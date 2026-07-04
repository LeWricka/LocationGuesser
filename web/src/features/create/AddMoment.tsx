import { useEffect, useRef, useState } from 'react'
import { Check, MapPin, Target } from 'lucide-react'
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
import { supabase } from '../../lib/supabase'
import {
  AppHeader,
  Badge,
  Button,
  DatePicker,
  Field,
  Input,
  Icon,
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

// Fecha de hoy en formato `yyyy-mm-dd` (zona local), para el valor por defecto del
// input date. La usamos también como "centinela": si el usuario no cambia la fecha,
// no la guardamos (no hay columna de fecha; ver nota en `save`).
function todayIso(): string {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10)
}

// Fecha local (`YYYY-MM-DD`) de un timestamp ISO cualquiera, con el mismo criterio
// de zona horaria que `todayIso` (evita el desfase de "un día antes" que da
// `.toISOString()` directo sobre un timestamp UTC cerca de medianoche local).
function localDateFromIso(isoTimestamp: string): string {
  const d = new Date(isoTimestamp)
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10)
}

// `latestMomentDate` (más abajo) puede ser un `happened_on` PURO (`YYYY-MM-DD`,
// migración 0037/#566: ya es el día exacto elegido, sin hora ni huso) o, para un
// momento legado sin fecha propia, un `created_at` ISO completo (con hora y huso,
// necesita `localDateFromIso`). Pasar un `happened_on` por `localDateFromIso`
// sería un error: lo interpretaría como medianoche UTC y, en husos AL OESTE de
// UTC, restaría un día.
function toLocalDateOnly(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : localDateFromIso(value)
}

/**
 * Fecha por defecto del campo "Fecha" + tope superior del calendario, en cascada
 * (issue #553 — el dueño de un viaje pasado, sept 2024, tenía que navegar el
 * calendario desde hoy hasta esa fecha en CADA recuerdo nuevo):
 *  1. Si el viaje ya tiene momentos → la fecha del MÁS RECIENTE (`happened_on` si
 *     lo tiene —migración 0037, la fuente REAL de la fecha elegida— o su
 *     `created_at` como proxy en momentos legado; ver `fetchLatestMomentDate` y
 *     `Moment.date` en `lib/trip.ts`, mismo criterio que ordena el diario).
 *     OJO: el proxy `created_at` (solo momentos legado) es fiable únicamente
 *     cuando el diario se documentó EN VIVO. Si el viaje tiene fechas y la fecha
 *     derivada cae FUERA de [starts_on, ends_on ?? starts_on], es un artefacto de
 *     backfill — el caso real del dueño: viaje de sept 2024 rellenado HOY; el
 *     primer recuerdo (legado, sin `happened_on`) se crea hoy, así que su
 *     `created_at` anclaría el SEGUNDO recuerdo en hoy y el dolor original
 *     reaparecería. En ese caso la ignoramos y caemos a la regla 2 (que para un
 *     viaje pasado da `starts_on`). Con `happened_on` (momentos nuevos) este
 *     artefacto ya no debería darse, pero el guardarraíl no estorba y cubre el
 *     viaje mixto (legado + nuevo).
 *  2. Si no hay momentos (o su fecha cayó fuera del rango) pero el viaje
 *     tiene fechas (`starts_on`/`ends_on`, migración 0027) → hoy ACOTADO al
 *     rango: si hoy cae dentro, hoy; si el viaje es pasado o futuro (hoy fuera
 *     del rango), `starts_on`.
 *  3. Sin momentos ni fechas del viaje → hoy (comportamiento de siempre).
 * Tope superior: por defecto hoy (no se crean recuerdos "futuros" sueltos). Si el
 * viaje es FUTURO y tiene `ends_on`, lo ampliamos hasta ahí — si no, `max=hoy`
 * bloquearía cualquier fecha del propio viaje (planificar recuerdos con antelación
 * dentro de su rango). Sin `ends_on` nos quedamos en `max=hoy` (no hay tope al que
 * ampliar). Exportada para testear la cascada sin montar el componente (rompe
 * fast refresh en este fichero; aceptable, igual que en `react-google-maps.tsx`).
 */
/* eslint-disable-next-line react-refresh/only-export-components -- función pura exportada
   solo para testear la cascada; no vale la pena un fichero aparte para una función pequeña
   usada solo aquí (mismo criterio que en `react-google-maps.tsx`). */
export function computeDefaultDate(
  latestMomentDate: string | null,
  startsOn: string | null,
  endsOn: string | null,
  today: string,
): { date: string; max: string } {
  const isFutureTrip = startsOn != null && startsOn > today
  const max = isFutureTrip && endsOn ? endsOn : today

  if (latestMomentDate) {
    const latestDate = toLocalDateOnly(latestMomentDate)
    // Regla 1 solo si la fecha del último momento es plausible: sin fechas del
    // viaje (nada con qué contrastar) o dentro del rango. Fuera del rango es un
    // artefacto de backfill (ver comentario de arriba) → cae a la regla 2.
    const plausible = !startsOn || (latestDate >= startsOn && latestDate <= (endsOn ?? startsOn))
    if (plausible) return { date: latestDate, max }
  }
  if (startsOn) {
    const withinRange = today >= startsOn && today <= (endsOn ?? startsOn)
    return { date: withinRange ? today : startsOn, max }
  }
  return { date: today, max }
}

/**
 * Fecha del momento (recuerdo o reto) más reciente del viaje — mismo criterio que
 * usa el diario para ordenar y fechar (`happened_on` con fallback `created_at`,
 * migración 0037/#566; ver `Moment.date` en `lib/trip.ts`). Consulta mínima (dos
 * columnas, una fila): solo ancla la fecha por defecto del formulario, no duplica
 * el fetch pesado de `getGroupChallenges` (todas las columnas, todo el viaje) que
 * ya hace la pantalla del viaje.
 */
async function fetchLatestMomentDate(groupId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('challenges')
    .select('happened_on, created_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return data.happened_on ?? data.created_at
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
              <Icon icon={Target} size={18} /> Añadir reto
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
      <AppHeader lead="back" onLead={onBack} leadLabel="Volver" title="Nuevo recuerdo" />
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
            <Icon icon={MapPin} size={16} /> Sitio del recuerdo{' '}
            <span className={styles.optional}>opcional</span>
          </span>
          <Stack gap={3}>
            <Button variant="secondary" fullWidth loading={locating} onClick={useGps}>
              <Icon icon={MapPin} size={18} /> Mi ubicación
            </Button>
            <MapPicker value={place} flyTo={flyTo} center={SPAIN} zoom={5} onPick={pickPlace} />
            {place ? (
              <Row gap={2} align="center">
                <Badge tone="accent">
                  <Icon icon={MapPin} size={14} /> Sitio marcado
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
