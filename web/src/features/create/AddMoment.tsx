import { useEffect, useMemo, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { MapPicker } from './MapPicker'
import { MomentGalleryPicker, type DraftPhoto } from './MomentGalleryPicker'
import { VoiceRecorder, type VoiceValue } from './VoiceRecorder'
import type { LatLng } from '../../lib/geo'
import { createMoment, type ChallengeForPlay } from '../../lib/challenges'
import { addMomentImages } from '../../lib/momentImages'
import { ImageDecodeError, uploadAudio, uploadImage, uploadVideo } from '../../lib/storage'
import { readGpsFromExif } from '../../lib/exif'
import { track } from '../../lib/analytics'
import { reportError } from '../../lib/observability'
import { describeError } from '../../lib/errors'
import { useSession } from '../../lib/session-context'
import { getGroup } from '../../lib/groupData'
import { computeDefaultDate, fetchLatestMomentDate, todayIso } from '../../lib/defaultDate'
import {
  clearDraft,
  deserializeBlob,
  deserializeFile,
  loadDraft,
  serializeBlob,
  serializeFile,
  useDraftAutosave,
  type SerializedBlob,
  type SerializedFile,
} from '../../lib/drafts'
import {
  AppHeader,
  Badge,
  Button,
  DatePicker,
  Field,
  Input,
  Icon,
  IconDiana,
  IconGps,
  IconPin,
  Row,
  Stack,
  useToast,
} from '../../ui'
import styles from './AddMoment.module.css'

interface Props {
  /** Viaje (grupo) al que se añade el recuerdo. Ya existe (flujo grupo-primero). */
  groupId: string
  /** Vuelve atrás sin guardar (cancelar). */
  onBack: () => void
  /** Recuerdo creado: el llamador vuelve al viaje y refresca. */
  onCreated: (challenge: ChallengeForPlay) => void
  /**
   * "Añadir reto" desde el recuerdo recién guardado: lleva al formulario de reto
   * pre-rellenado con la foto y el lugar del recuerdo (uno de los dos orígenes que
   * convergen). El llamador resuelve la navegación (ruta `&from=<momentId>`).
   */
  onAddChallenge: (momentId: string) => void
}

const SPAIN: LatLng = { lat: 40.4, lng: -3.7 }

// `computeDefaultDate`/`fetchLatestMomentDate`/`todayIso` viven en
// `lib/defaultDate.ts` (compartidas con los asistentes de crear reto, que
// también fechan con `happened_on` para ordenar bien el diario). Re-exportamos
// `computeDefaultDate` para no tocar el import del test existente
// (`AddMoment.test.tsx`), que la prueba sin montar el componente.
// eslint-disable-next-line react-refresh/only-export-components -- re-export de una función pura para el test, mismo criterio que antes de mover la función a lib/.
export { computeDefaultDate }

// BORRADOR PERSISTENTE (issue #718) — es el caso concreto del reporte del
// dueño: "creando un momento con fotos, clips y descripción, salgo a mirar
// una notificación y al volver todo perdido". Clave por viaje: un dueño solo
// tiene UN "Nuevo recuerdo" a medias por viaje a la vez.
function draftKey(groupId: string): string {
  return `moment:${groupId}`
}

interface MomentDraft {
  title: string
  description: string
  date: string
  place: LatLng | null
  // Fotos/clip/nota de voz van SERIALIZADOS (ArrayBuffer + metadatos, ver
  // `SerializedFile`/`SerializedBlob` en lib/drafts.ts): el `File`/`Blob`
  // original ya se copió a bytes propios al elegirlo (#644), así que
  // persistir esos bytes es robusto en cualquier navegador.
  photos: { id: string; file: SerializedFile }[]
  video: { frameId: string; file: SerializedFile; mimeType: string } | null
  voice: { blob: SerializedBlob; mimeType: string } | null
}

// Un draft sin nada real (ni texto, ni sitio, ni fotos/clip/voz) no merece
// restaurarse ni avisar: es ruido.
function hasContent(d: MomentDraft): boolean {
  return Boolean(
    d.title.trim() || d.description.trim() || d.place || d.photos.length > 0 || d.video || d.voice,
  )
}

/**
 * AÑADIR RECUERDO — el camino feliz, limpio (rediseño Oleada 3). Un recuerdo es
 * SOLO foto + lugar + texto: se acabó el toggle "convertirlo en reto" (mezclaba dos
 * intenciones en una pantalla). El reto es ahora una entidad de primera clase con su
 * propio formulario; desde aquí se llega DESPUÉS de guardar, con "Añadir reto".
 *
 * Tras guardar, la pantalla muestra el estado "Recuerdo guardado" con dos caminos:
 * "Añadir reto" (pre-rellena foto y lugar) y "Listo, volver al viaje". Así el orden
 * es el correcto: primero el recuerdo; luego —si quieres— el reto.
 *
 * El lugar del recuerdo es VISIBLE (`place_*`); si más tarde se promociona a reto,
 * pasa a ser la respuesta a adivinar.
 */
export function AddMoment({ groupId, onBack, onCreated, onAddChallenge }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(todayIso)
  // Tope superior del calendario: hoy por defecto; se amplía a `ends_on` si el
  // viaje es futuro (ver `computeDefaultDate`). Arranca en hoy y solo cambia tras
  // resolver la cascada (evita parpadeo: nunca deja elegir MÁS de lo permitido).
  const [maxDate, setMaxDate] = useState(todayIso)
  // Nombre del viaje para el kicker de la cabecera 5B (#659). Llega con la misma
  // consulta getGroup() de la cascada de fecha; hasta entonces, cabecera sin kicker.
  const [groupName, setGroupName] = useState<string | null>(null)
  // Si el usuario toca la fecha a mano, la cascada async ya no debe pisarla.
  const dateTouchedRef = useRef(false)

  // Lugar VISIBLE del recuerdo. Sale de la foto (EXIF), del mapa o del GPS.
  const [place, setPlace] = useState<LatLng | null>(null)
  const [flyTo, setFlyTo] = useState<LatLng | null>(null)
  const [locating, setLocating] = useState(false)

  // GALERÍA del recuerdo: varias fotos del móvil, la 1ª es la portada. Cada una
  // se sube SIN EXIF al guardar. `previewUrl` es un object URL que revocamos al
  // quitar/desmontar para no fugar memoria.
  const [photos, setPhotos] = useState<DraftPhoto[]>([])
  const [readingExif, setReadingExif] = useState(false)
  // Nota de voz opcional (≤60s, issue #648): grabada junto a la Descripción.
  const [voice, setVoice] = useState<VoiceValue>({ kind: 'none' })
  // Clip de vídeo corto opcional (v1: uno solo, issue #649). Su fotograma-
  // portada YA vive como una foto más en `photos` (ver `onAddVideo`); aquí solo
  // guardamos el archivo del CLIP en sí (se sube aparte al guardar) y el id de
  // esa foto (`frameId`) para poder soltar el vídeo si el dueño quita la foto.
  const [videoDraft, setVideoDraft] = useState<{
    frameId: string
    file: File
    mimeType: string
  } | null>(null)
  // Ids de fotos que fallaron al subir en el ÚLTIMO intento de guardado (#550):
  // las marcamos en el picker (borde/badge) para que el dueño sepa cuáles
  // quitar o reintentar, en vez de que desaparezcan sin más contexto.
  const [failedPhotoIds, setFailedPhotoIds] = useState<Set<string>>(new Set())

  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  // Recuerdo recién guardado: dispara el estado "Recuerdo guardado" (dos acciones).
  const [saved, setSaved] = useState<ChallengeForPlay | null>(null)
  // URL de la portada para enseñarla en el estado "guardado" (object URL ya creado).
  const savedCoverUrl = photos[0]?.previewUrl ?? null

  const toast = useToast()
  const { user } = useSession()

  // Revoca TODOS los object URLs de la galería al desmontar (no fugar memoria).
  useEffect(() => {
    return () => {
      setPhotos((prev) => {
        prev.forEach((p) => URL.revokeObjectURL(p.previewUrl))
        return []
      })
    }
  }, [])

  // Revoca el object URL de la nota de voz (si es un draft nuevo, no una ya
  // guardada) al desmontar sin haber guardado. Ref en vez de dependencia
  // directa: el efecto solo debe correr en el CLEANUP final, no en cada cambio
  // de `voice` (regrabar/descartar ya revocan el suyo en `VoiceRecorder`).
  const voiceRef = useRef(voice)
  useEffect(() => {
    voiceRef.current = voice
  }, [voice])
  useEffect(() => {
    return () => {
      if (voiceRef.current.kind === 'draft') URL.revokeObjectURL(voiceRef.current.url)
    }
  }, [])

  // Fecha por defecto en cascada (issue #553): al montar, resolvemos el valor
  // inicial del campo "Fecha" con dos consultas ligeras en paralelo (el último
  // momento del viaje + sus fechas). Best-effort: si falla, se queda en "hoy" (el
  // comportamiento de siempre) sin bloquear el formulario. No pisa la fecha si el
  // usuario ya la tocó a mano antes de que la consulta responda.
  useEffect(() => {
    let cancelled = false
    async function loadDefaultDate() {
      try {
        const [latestDate, group] = await Promise.all([
          fetchLatestMomentDate(groupId),
          getGroup(groupId),
        ])
        if (cancelled) return
        setGroupName(group?.name ?? null)
        const { date: defaultDate, max } = computeDefaultDate(
          latestDate,
          group?.starts_on ?? null,
          group?.ends_on ?? null,
          todayIso(),
        )
        setMaxDate(max)
        if (!dateTouchedRef.current) setDate(defaultDate)
      } catch (err) {
        reportError(err, { area: 'add_moment', stage: 'default_date' })
      }
    }
    void loadDefaultDate()
    return () => {
      cancelled = true
    }
  }, [groupId])

  // Descarta el borrador restaurado a mano (acción "Descartar" del toast):
  // vuelve el formulario a blanco y revoca los object URLs que la
  // restauración había creado (fotos + nota de voz), igual que un
  // quitar/desmontar normal.
  function discardDraft() {
    void clearDraft(draftKey(groupId))
    setTitle('')
    setDescription('')
    setPlace(null)
    setFlyTo(null)
    setPhotos((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.previewUrl))
      return []
    })
    setVideoDraft(null)
    setVoice((prev) => {
      if (prev.kind === 'draft') URL.revokeObjectURL(prev.url)
      return { kind: 'none' }
    })
    setFailedPhotoIds(new Set())
  }

  // BORRADOR PERSISTENTE (issue #718): al montar, intenta restaurar. Ocurre
  // aparte de (y no interfiere con) la cascada de fecha por defecto de arriba:
  // si el draft trae fecha, marcamos `dateTouchedRef` para que esa cascada no
  // la pise sea cual sea el orden en que resuelvan las dos promesas. `restored`
  // desarma el autosave hasta que este intento termine — si no, el primer
  // render (con los campos vacíos) pisaría un draft real antes de leerlo.
  const [restored, setRestored] = useState(false)
  useEffect(() => {
    let cancelled = false
    void loadDraft<MomentDraft>(draftKey(groupId)).then((draft) => {
      if (cancelled) return
      if (draft && hasContent(draft)) {
        setTitle(draft.title)
        setDescription(draft.description)
        if (draft.date) {
          dateTouchedRef.current = true
          setDate(draft.date)
        }
        if (draft.place) {
          setPlace(draft.place)
          setFlyTo(draft.place)
        }
        if (draft.photos.length > 0) {
          setPhotos(
            draft.photos.map((p) => {
              const file = deserializeFile(p.file)
              return { id: p.id, file, previewUrl: URL.createObjectURL(file) }
            }),
          )
        }
        if (draft.video) {
          setVideoDraft({
            frameId: draft.video.frameId,
            file: deserializeFile(draft.video.file),
            mimeType: draft.video.mimeType,
          })
        }
        if (draft.voice) {
          const blob = deserializeBlob(draft.voice.blob)
          setVoice({
            kind: 'draft',
            blob,
            mimeType: draft.voice.mimeType,
            url: URL.createObjectURL(blob),
          })
        }
        track('draft_restored', { form: 'moment', has_photos: draft.photos.length > 0 })
        toast.show('Recuperado tu borrador del recuerdo.', {
          tone: 'neutral',
          action: { label: 'Descartar', onClick: discardDraft },
        })
      }
      setRestored(true)
    })
    return () => {
      cancelled = true
    }
    // Solo al montar: restaurar un draft es una operación de una sola vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  // Las fotos/clip/nota de voz se serializan APARTE (async, issue #718):
  // `serializeFile`/`serializeBlob` leen bytes con `arrayBuffer()`, así que no
  // pueden vivir en el `useMemo` síncrono del snapshot de más abajo. El
  // debounce de `useDraftAutosave` absorbe ese pequeño desfase.
  const [draftPhotos, setDraftPhotos] = useState<{ id: string; file: SerializedFile }[]>([])
  useEffect(() => {
    let cancelled = false
    void Promise.all(
      photos.map(async (p) => ({ id: p.id, file: await serializeFile(p.file) })),
    ).then((serialized) => {
      if (!cancelled) setDraftPhotos(serialized)
    })
    return () => {
      cancelled = true
    }
  }, [photos])

  const [draftVideo, setDraftVideo] = useState<{
    frameId: string
    file: SerializedFile
    mimeType: string
  } | null>(null)
  useEffect(() => {
    let cancelled = false
    if (!videoDraft) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset síncrono al quitar el clip, no un derivado de otro estado
      setDraftVideo(null)
      return
    }
    void serializeFile(videoDraft.file).then((file) => {
      if (!cancelled) {
        setDraftVideo({ frameId: videoDraft.frameId, file, mimeType: videoDraft.mimeType })
      }
    })
    return () => {
      cancelled = true
    }
  }, [videoDraft])

  const [draftVoice, setDraftVoice] = useState<{ blob: SerializedBlob; mimeType: string } | null>(
    null,
  )
  useEffect(() => {
    let cancelled = false
    if (voice.kind !== 'draft') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset síncrono sin nota nueva, no un derivado de otro estado
      setDraftVoice(null)
      return
    }
    void serializeBlob(voice.blob).then((blob) => {
      if (!cancelled) setDraftVoice({ blob, mimeType: voice.mimeType })
    })
    return () => {
      cancelled = true
    }
  }, [voice])

  const draftSnapshot = useMemo<MomentDraft>(
    () => ({
      title,
      description,
      date,
      place,
      photos: draftPhotos,
      video: draftVideo,
      voice: draftVoice,
    }),
    [title, description, date, place, draftPhotos, draftVideo, draftVoice],
  )
  useDraftAutosave(draftKey(groupId), draftSnapshot, restored)

  // Añadir fotos (selección múltiple del móvil). Se anexan al final. Si es la
  // PRIMERA tanda (galería vacía), leemos el GPS de la portada (File ORIGINAL,
  // antes de estriparlo al subir): con GPS fija el lugar; sin GPS, a tocar el mapa.
  async function onAddPhotos(files: File[]) {
    const wasEmpty = photos.length === 0
    const drafts: DraftPhoto[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
    }))
    setPhotos((prev) => [...prev, ...drafts])

    if (!wasEmpty) return
    // El GPS solo lo leemos de la portada (la primera de la primera tanda).
    setReadingExif(true)
    try {
      const gps = await readGpsFromExif(files[0])
      if (gps) {
        setPlace(gps)
        setFlyTo(gps)
        toast.show('Leímos dónde es por la foto. Ajusta el pin si hace falta.', { tone: 'success' })
      }
    } finally {
      setReadingExif(false)
    }
  }

  // Quita una foto de la galería y revoca su object URL.
  function onRemovePhoto(id: string) {
    setPhotos((prev) => {
      const found = prev.find((p) => p.id === id)
      if (found) URL.revokeObjectURL(found.previewUrl)
      return prev.filter((p) => p.id !== id)
    })
    // Ya no tiene sentido seguir marcándola como fallida si se quita.
    setFailedPhotoIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    // Si la foto quitada era el fotograma-portada del clip, el clip se va con
    // ella (issue #649): no tiene sentido guardar un vídeo sin su portada.
    setVideoDraft((prev) => (prev?.frameId === id ? null : prev))
  }

  // Marca una foto como portada moviéndola al frente (orden estable del resto).
  function onMakeCover(id: string) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id)
      if (!target) return prev
      return [target, ...prev.filter((p) => p.id !== id)]
    })
  }

  // Se eligió un clip válido en el picker (ya pasó validación + extracción de
  // fotograma, issue #649): el fotograma entra a la galería como una foto MÁS
  // (en cabeza, es la portada del clip) y el vídeo en sí queda aparte,
  // pendiente de subir al guardar.
  function onAddVideo(file: File, mimeType: string, coverFrame: File) {
    const frameId = crypto.randomUUID()
    setPhotos((prev) => [
      { id: frameId, file: coverFrame, previewUrl: URL.createObjectURL(coverFrame) },
      ...prev,
    ])
    setVideoDraft({ frameId, file, mimeType })
    toast.show('Clip añadido: su fotograma es ahora la portada.', { tone: 'success' })
  }

  function pickPlace(p: LatLng) {
    setPlace(p)
  }

  // "Mi ubicación": pide el GPS y, al obtenerlo, fija el lugar y vuela ahí.
  function useGps() {
    if (!navigator.geolocation) {
      toast.show('Tu navegador no permite geolocalización. Toca el mapa.', { tone: 'danger' })
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setPlace(p)
        setFlyTo(p)
        setLocating(false)
      },
      (err) => {
        setLocating(false)
        const message =
          err.code === err.PERMISSION_DENIED
            ? 'Diste «no» al permiso de ubicación. Actívalo en el navegador o toca el mapa.'
            : err.code === err.TIMEOUT
              ? 'Tardó demasiado en localizarte. Reinténtalo o toca el mapa.'
              : 'No se pudo obtener tu ubicación. Toca el mapa.'
        toast.show(message, { tone: 'danger' })
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    )
  }

  // Un recuerdo se guarda con título (foto y lugar son opcionales). Es lo barato.
  const titleValid = title.trim().length > 0
  const canSave = titleValid && !locating && !readingExif

  // Texto del recuerdo: SOLO la descripción. Antes de la migración 0037 (#566) no
  // había columna de fecha propia, así que la fecha elegida se anteponía como
  // texto libre (`📅 8 de abril · ...`) para no perderla del todo — un hack de
  // solo-escritura, nada la volvía a leer como dato. Ahora vive en `happened_on`
  // (columna real, ver `save`) y se muestra donde toca (`Moment.date`), así que ya
  // no hace falta duplicarla aquí: seguir haciéndolo dejaría dos fuentes que
  // podrían desincronizarse si se edita solo una. Los recuerdos ANTIGUOS que ya
  // llevan la fecha incrustada conservan ese texto tal cual (dato ya guardado, no
  // se toca ni se parsea de vuelta).
  function buildDescription(): string | null {
    const body = description.trim()
    return body || null
  }

  async function save() {
    if (!user) {
      toast.show('Inicia sesión para añadir un recuerdo.', { tone: 'danger' })
      return
    }
    if (!titleValid) {
      toast.show('Ponle un título al recuerdo.', { tone: 'danger' })
      return
    }

    setBusy(true)
    // Reinicia el marcado de fallos del intento anterior: este intento decide
    // de cero qué fotos quedan marcadas (si una fallida ya subió esta vez, deja
    // de estarlo).
    setFailedPhotoIds(new Set())
    try {
      // Fotos opcionales: subida comprimida y SIN EXIF, EN SECUENCIA (una foto
      // detrás de otra, no en paralelo — la presión de memoria de decodificar
      // varias fotos de cámara a la vez en un móvil es sospechosa cuando fallan
      // TODAS, #550) y en ORDEN (la 1ª es la portada). Las paths conservan el
      // orden de LAS QUE SÍ SUBIERON (remate del #520): si una foto falla al
      // decodificar (ImageDecodeError, con .fileName), no abortamos el recuerdo
      // entero — la saltamos y seguimos con las demás. Un error de
      // infraestructura (red, Storage caído) SÍ aborta: seguir intentando no
      // ayuda y el mensaje de red del catch de fuera es más útil que el de foto.
      const paths: string[] = []
      const failedFileNames: string[] = []
      const failedIds: string[] = []
      for (let i = 0; i < photos.length; i++) {
        setStatus(
          photos.length > 1 ? `Subiendo fotos… (${i + 1}/${photos.length})` : 'Subiendo la foto…',
        )
        try {
          paths.push(await uploadImage(photos[i].file))
        } catch (err) {
          if (!(err instanceof ImageDecodeError)) throw err
          reportError(err, {
            area: 'add_moment',
            stage: 'upload_photo',
            groupId,
            fileName: err.fileName,
          })
          failedFileNames.push(err.fileName)
          failedIds.push(photos[i].id)
        }
      }

      // Si había fotos y NINGUNA subió, no guardamos un recuerdo "a medias" sin
      // avisar: error claro, marcamos cuáles fallaron en el picker (borde/badge)
      // y el formulario (título, lugar, fotos) queda intacto para reintentar
      // pulsando «Guardar recuerdo» de nuevo o quitar la foto problemática.
      if (photos.length > 0 && paths.length === 0) {
        setStatus(null)
        setBusy(false)
        setFailedPhotoIds(new Set(failedIds))
        toast.show(
          failedFileNames.length === 1
            ? `No se pudo subir «${failedFileNames[0]}». Prueba con otra foto o quítala para guardar sin fotos.`
            : `No se pudo subir ninguna foto (${failedFileNames.join(', ')}). Prueba con otras o quítalas para guardar sin fotos.`,
          { tone: 'danger' },
        )
        return
      }

      // La portada espeja `image_path` (lo lee la tarjeta del viaje y el mapamundi).
      const coverPath = paths[0]

      // Nota de voz opcional: BEST-EFFORT (patrón #539/#531) — si falla la
      // subida, el recuerdo se guarda igual (sin nota) y avisamos al final,
      // igual que con una foto que no sube. No aborta el guardado entero.
      let audioPath: string | null = null
      let audioFailed = false
      if (voice.kind === 'draft') {
        setStatus('Subiendo la nota de voz…')
        try {
          audioPath = await uploadAudio(voice.blob, voice.mimeType)
        } catch (err) {
          audioFailed = true
          reportError(err, { area: 'add_moment', stage: 'upload_audio', groupId })
        }
      }

      // Clip de vídeo corto opcional: BEST-EFFORT igual que la nota de voz
      // (issue #649) — su fotograma-portada YA subió arriba como una foto más
      // (va en `photos`/`paths`), así que si el vídeo en sí falla, el recuerdo
      // se queda con esa foto como portada pero sin reproductor.
      let videoPath: string | null = null
      let videoFailed = false
      if (videoDraft) {
        setStatus('Subiendo el vídeo…')
        try {
          videoPath = await uploadVideo(videoDraft.file, videoDraft.mimeType)
        } catch (err) {
          videoFailed = true
          reportError(err, { area: 'add_moment', stage: 'upload_video', groupId })
        }
      }

      setStatus('Guardando el recuerdo…')
      // Nace como RECUERDO (la unidad mínima). El lugar es VISIBLE.
      const { challenge } = await createMoment({
        title: title.trim(),
        createdBy: user.id,
        groupId,
        description: buildDescription(),
        placeLat: place?.lat ?? null,
        placeLng: place?.lng ?? null,
        imagePath: coverPath ?? null,
        audioPath,
        videoPath,
        // Fecha ELEGIDA en el campo "Fecha" (issue #566, migración 0037): fuente
        // real de la fecha del recuerdo, ya no un hack de texto (ver `buildDescription`).
        happenedOn: date,
      })

      // Galería del recuerdo: registramos TODAS las fotos en `moment_images` con su
      // orden. `image_path` ya quedó espejado por `createMoment`.
      if (paths.length > 0) {
        await addMomentImages(challenge.id, paths)
      }

      setStatus(null)
      // Recuerdo guardado con éxito: el borrador ya cumplió su función (issue #718).
      void clearDraft(draftKey(groupId))
      track('moment_created', {
        group_id: groupId,
        challenge_id: challenge.id,
        has_photo: paths.length > 0,
        photo_count: paths.length,
        has_place: place != null,
        has_audio: audioPath != null,
        has_video: videoPath != null,
        promoted_to_challenge: false,
        score_scale: null,
      })
      // Fallo PARCIAL: el recuerdo se guardó igual con lo que sí subió (fotos,
      // nota de voz y/o vídeo), pero avisamos qué se quedó fuera (#531/#648/#649).
      // Los dos mensajes de SOLO fotos son los de siempre (#531); el sufijo añade
      // lo que además falló (nota de voz y/o vídeo).
      if (failedFileNames.length > 0 || audioFailed || videoFailed) {
        const extras: string[] = []
        if (audioFailed) extras.push('la nota de voz')
        if (videoFailed) extras.push('el vídeo')
        const extraSuffix = extras.length > 0 ? ` ni ${extras.join(' ni ')}` : ''
        const message =
          failedFileNames.length === 0
            ? `Recuerdo guardado. No se pudo subir ${extras.join(' ni ')}.`
            : failedFileNames.length === 1
              ? `Recuerdo guardado. No se pudo subir «${failedFileNames[0]}»${extraSuffix}.`
              : `Recuerdo guardado. No se pudieron subir ${failedFileNames.length} fotos (${failedFileNames.join(', ')})${extraSuffix}.`
        toast.show(message, { tone: 'neutral' })
      }
      // Efecto móvil al guardar: vibración corta. En vez de salir directos al viaje,
      // mostramos el estado "Recuerdo guardado" con "Añadir reto" / "Volver al viaje".
      navigator.vibrate?.(30)
      setBusy(false)
      setSaved(challenge)
    } catch (err) {
      reportError(err, { area: 'add_moment' })
      const msg = describeError(err)
      setStatus(null)
      const networkish = /failed to fetch|networkerror|load failed/i.test(msg)
      toast.show(
        networkish
          ? 'Sin conexión con el servidor. Prueba con datos en vez de WiFi (o al revés) y desactiva VPN, DNS privado o bloqueador; luego reinténtalo.'
          : `No se pudo guardar: ${msg}`,
        { tone: 'danger' },
      )
      setBusy(false)
    }
  }

  // ESTADO "Recuerdo guardado": dos caminos claros. "Añadir reto" lleva al
  // formulario de reto pre-rellenado con la foto y el lugar; "Listo" vuelve al viaje.
  if (saved) {
    return (
      <main className={styles.screen}>
        {/* Cabecera ÚNICA del producto (variante papel), a sangre sobre el papel
            con su hairline; el cuerpo lleva el gutter, no la cabecera. */}
        <AppHeader title="Recuerdo guardado" />
        <Stack gap={5} className={`${styles.body} ${styles.savedWrap}`}>
          {savedCoverUrl ? (
            <img className={styles.savedCover} src={savedCoverUrl} alt="" aria-hidden />
          ) : (
            <div className={styles.savedCover} data-empty aria-hidden>
              <Icon icon={Check} size={32} />
            </div>
          )}
          <div className={styles.savedHeading}>
            <span className={styles.eyebrow}>
              <Icon icon={Check} size={14} /> Guardado en el viaje
            </span>
            <h1 className={styles.title}>{saved.title.trim() || 'Recuerdo'}</h1>
            {description.trim() && (
              <p className={`prose ${styles.savedDesc}`}>{description.trim()}</p>
            )}
          </div>
          <Stack gap={3} className={styles.savedActions}>
            <Button size="lg" fullWidth onClick={() => onAddChallenge(saved.id)}>
              <IconDiana size={18} /> Añadir reto
            </Button>
            <Button variant="secondary" size="lg" fullWidth onClick={() => onCreated(saved)}>
              Listo, volver al viaje
            </Button>
          </Stack>
        </Stack>
      </main>
    )
  }

  return (
    <main className={styles.screen}>
      {/* Cabecera ÚNICA del producto (variante papel), a sangre con su hairline.
          El gutter lo lleva el cuerpo, para que la cabecera no flote como una
          barra blanca recortada distinta al papel. */}
      <AppHeader
        lead="back"
        onLead={onBack}
        leadLabel="Volver"
        kicker={groupName ?? undefined}
        title="Nuevo recuerdo"
      />
      <Stack gap={5} className={`${styles.body} lg-stagger`}>
        <div className={styles.heading}>
          <p className={styles.lede}>
            Una foto, un sitio, unas palabras. Lo compartes y los tuyos lo viven contigo.
          </p>
        </div>

        {/* FOTOS Y VÍDEO — galería del recuerdo (la 1ª es la portada). Un clip
            corto (≤15s) cuenta como una foto más: entra por el mismo picker
            (issue #649). */}
        <section className={styles.block}>
          <span className={styles.blockLabel}>
            Fotos o un clip <span className={styles.optional}>opcional</span>
          </span>
          <MomentGalleryPicker
            photos={photos}
            loading={readingExif}
            failedIds={failedPhotoIds}
            onAdd={(files) => void onAddPhotos(files)}
            onRemove={onRemovePhoto}
            onMakeCover={onMakeCover}
            hasVideo={videoDraft != null}
            videoFrameId={videoDraft?.frameId ?? null}
            onAddVideo={onAddVideo}
          />
        </section>

        {/* LUGAR — mapa satélite. En un recuerdo es el sitio VISIBLE. */}
        <section className={styles.block}>
          <span className={styles.blockLabel}>
            <IconPin size={16} /> Sitio del recuerdo{' '}
            <span className={styles.optional}>opcional</span>
          </span>
          <Stack gap={3}>
            <Button variant="secondary" fullWidth loading={locating} onClick={useGps}>
              <IconGps size={18} /> Mi ubicación
            </Button>
            <MapPicker value={place} flyTo={flyTo} center={SPAIN} zoom={5} onPick={pickPlace} />
            {place ? (
              <Row gap={2} align="center">
                <Badge tone="accent">
                  <IconPin size={14} /> Sitio marcado
                </Badge>
                <span className={styles.coords}>
                  {place.lat.toFixed(5)}, {place.lng.toFixed(5)}
                </span>
              </Row>
            ) : (
              <span className={styles.hint}>
                Toca el mapa para marcar dónde es. Sin lugar también vale.
              </span>
            )}
          </Stack>
        </section>

        {/* TÍTULO + DESCRIPCIÓN + FECHA */}
        <section className={styles.block}>
          <Field label="Título" hint="Cómo lo recordarás de un vistazo." required>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                placeholder="Atardecer en Santorini"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            )}
          </Field>

          <Field label="Descripción" hint="Lo que viviste ahí (opcional).">
            {(fieldProps) => (
              <textarea
                {...fieldProps}
                className={styles.textarea}
                placeholder="Llegamos justo a tiempo para ver el sol caer sobre el mar…"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            )}
          </Field>

          {/* NOTA DE VOZ — junto a la descripción (issue #648): otra forma de
              contar el momento, sin escribir. */}
          <div className={styles.voiceField}>
            <span className={styles.voiceLabel}>
              Nota de voz <span className={styles.optional}>opcional</span>
            </span>
            <VoiceRecorder value={voice} onChange={setVoice} disabled={busy} />
          </div>

          <Field label="Fecha">
            {(fieldProps) => (
              <DatePicker
                {...fieldProps}
                value={date}
                max={maxDate}
                placeholder="Elige el día"
                onChange={(v) => {
                  dateTouchedRef.current = true
                  setDate(v ?? '')
                }}
              />
            )}
          </Field>
        </section>

        {/* CTA — guardar el recuerdo. Mientras guarda, el botón muestra el estado
            (subiendo fotos n/N, guardando…) para que no parezca colgado. */}
        <Button size="lg" fullWidth loading={busy} disabled={!canSave} onClick={() => void save()}>
          {busy ? (status ?? 'Guardando…') : 'Guardar recuerdo'}
        </Button>
        {!titleValid && !busy && (
          <span className={styles.hint}>Falta el título del recuerdo para poder guardarlo.</span>
        )}
      </Stack>
    </main>
  )
}
