import { useEffect, useRef, useState } from 'react'
import { Check, MapPin, Target } from 'lucide-react'
import { MapPicker } from './MapPicker'
import { MomentGalleryPicker, type DraftPhoto } from './MomentGalleryPicker'
import type { LatLng } from '../../lib/geo'
import { createMoment, type ChallengeForPlay } from '../../lib/challenges'
import { addMomentImages } from '../../lib/momentImages'
import { ImageDecodeError, uploadImage } from '../../lib/storage'
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

/**
 * Fecha por defecto del campo "Fecha" + tope superior del calendario, en cascada
 * (issue #553 — el dueño de un viaje pasado, sept 2024, tenía que navegar el
 * calendario desde hoy hasta esa fecha en CADA recuerdo nuevo):
 *  1. Si el viaje ya tiene momentos → la fecha del MÁS RECIENTE. Mismo criterio que
 *     usa el diario para ordenar y fechar (`created_at`; ver `Moment.date` en
 *     `lib/trip.ts`) — no hay columna de fecha propia del recuerdo (la fecha que
 *     elige el usuario solo queda, si acaso, incrustada en la descripción sin año,
 *     ver `buildDescription`; no es una fuente fiable para reconstruir un ISO).
 *     OJO: `created_at` es solo un PROXY de la fecha elegida, fiable únicamente
 *     cuando el diario se documenta EN VIVO. Si el viaje tiene fechas y la fecha
 *     derivada cae FUERA de [starts_on, ends_on ?? starts_on], es un artefacto de
 *     backfill — el caso real del dueño: viaje de sept 2024 rellenado HOY; el
 *     primer recuerdo se crea hoy, así que su `created_at` anclaría el SEGUNDO
 *     recuerdo en hoy y el dolor original reaparecería. En ese caso la ignoramos
 *     y caemos a la regla 2 (que para un viaje pasado da `starts_on`).
 *  2. Si no hay momentos (o su `created_at` cayó fuera del rango) pero el viaje
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
  latestMomentCreatedAt: string | null,
  startsOn: string | null,
  endsOn: string | null,
  today: string,
): { date: string; max: string } {
  const isFutureTrip = startsOn != null && startsOn > today
  const max = isFutureTrip && endsOn ? endsOn : today

  if (latestMomentCreatedAt) {
    const latestDate = localDateFromIso(latestMomentCreatedAt)
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
 * El momento (recuerdo o reto) más reciente del viaje por fecha de creación —
 * mismo criterio que usa el diario para ordenar (`lib/trip.ts`). Consulta mínima
 * (una columna, una fila): solo ancla la fecha por defecto del formulario, no
 * duplica el fetch pesado de `getGroupChallenges` (todas las columnas, todo el
 * viaje) que ya hace la pantalla del viaje.
 */
async function fetchLatestMomentCreatedAt(groupId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('challenges')
    .select('created_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.created_at ?? null
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

  // Fecha por defecto en cascada (issue #553): al montar, resolvemos el valor
  // inicial del campo "Fecha" con dos consultas ligeras en paralelo (el último
  // momento del viaje + sus fechas). Best-effort: si falla, se queda en "hoy" (el
  // comportamiento de siempre) sin bloquear el formulario. No pisa la fecha si el
  // usuario ya la tocó a mano antes de que la consulta responda.
  useEffect(() => {
    let cancelled = false
    async function loadDefaultDate() {
      try {
        const [latestCreatedAt, group] = await Promise.all([
          fetchLatestMomentCreatedAt(groupId),
          getGroup(groupId),
        ])
        if (cancelled) return
        const { date: defaultDate, max } = computeDefaultDate(
          latestCreatedAt,
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
  }

  // Marca una foto como portada moviéndola al frente (orden estable del resto).
  function onMakeCover(id: string) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id)
      if (!target) return prev
      return [target, ...prev.filter((p) => p.id !== id)]
    })
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

  // Texto del recuerdo: si el usuario eligió una fecha distinta de hoy, la
  // anteponemos a la descripción (no hay columna de fecha en el modelo; el orden
  // del diario va por `created_at`). Así la fecha del recuerdo no se pierde sin
  // tocar la capa de datos. Si la fecha es hoy, no añadimos nada.
  function buildDescription(): string | null {
    const body = description.trim()
    if (date && date !== todayIso()) {
      const human = new Date(`${date}T00:00:00`).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
      })
      return body ? `📅 ${human} · ${body}` : `📅 ${human}`
    }
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
        promoted_to_challenge: false,
        score_scale: null,
      })
      // Fallo PARCIAL: el recuerdo se guardó igual con las fotos que sí subieron,
      // pero avisamos cuáles se quedaron fuera (issue #531).
      if (failedFileNames.length > 0) {
        toast.show(
          failedFileNames.length === 1
            ? `Recuerdo guardado. No se pudo subir «${failedFileNames[0]}».`
            : `Recuerdo guardado. No se pudieron subir ${failedFileNames.length} fotos (${failedFileNames.join(', ')}).`,
          { tone: 'neutral' },
        )
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

        {/* FOTOS — galería del recuerdo (la 1ª es la portada). */}
        <section className={styles.block}>
          <span className={styles.blockLabel}>
            Fotos <span className={styles.optional}>opcional</span>
          </span>
          <MomentGalleryPicker
            photos={photos}
            loading={readingExif}
            failedIds={failedPhotoIds}
            onAdd={(files) => void onAddPhotos(files)}
            onRemove={onRemovePhoto}
            onMakeCover={onMakeCover}
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
