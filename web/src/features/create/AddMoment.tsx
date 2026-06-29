import { useEffect, useRef, useState } from 'react'
import { MapPicker } from './MapPicker'
import { StreetViewPreview } from './StreetViewPreview'
import { MomentGalleryPicker, type DraftPhoto } from './MomentGalleryPicker'
import type { LatLng } from '../../lib/geo'
import { createMoment, promoteToChallenge, type ChallengeForPlay } from '../../lib/challenges'
import { addMomentImages } from '../../lib/momentImages'
import { deadlineFromMinutes } from '../../lib/time'
import { findPanorama, findPanoramaNear, type PanoramaMatch } from '../../lib/streetview'
import { uploadImage } from '../../lib/storage'
import { readGpsFromExif } from '../../lib/exif'
import { track } from '../../lib/analytics'
import { reportError } from '../../lib/observability'
import { describeError } from '../../lib/errors'
import { useSession } from '../../lib/session-context'
import {
  Badge,
  Button,
  Field,
  Input,
  Row,
  Spinner,
  Stack,
  useReducedMotion,
  useToast,
} from '../../ui'
import styles from './AddMoment.module.css'

interface Props {
  /** Viaje (grupo) al que se añade el recuerdo. Ya existe (flujo grupo-primero). */
  groupId: string
  /** Vuelve atrás sin guardar (cancelar). */
  onBack: () => void
  /** Recuerdo (o reto) creado: el llamador vuelve al viaje y refresca. */
  onCreated: (challenge: ChallengeForPlay) => void
}

const SPAIN: LatLng = { lat: 40.4, lng: -3.7 }

// Radio (m) en el que buscamos Street View cerca del lugar cuando hay foto.
const SV_NEAR_RADIUS = 50

// Duración del reto (cuando se activa el toggle): paradas de express a largas.
// Mismo conjunto que el asistente de reto clásico para coherencia.
const DURATION_STOPS: { minutes: number; label: string }[] = [
  { minutes: 5, label: '5 min' },
  { minutes: 10, label: '10 min' },
  { minutes: 15, label: '15 min' },
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 h' },
  { minutes: 120, label: '2 h' },
  { minutes: 240, label: '4 h' },
  { minutes: 480, label: '8 h' },
  { minutes: 720, label: '12 h' },
  { minutes: 1440, label: '24 h' },
  { minutes: 2880, label: '48 h' },
]
const DEFAULT_DURATION_INDEX = DURATION_STOPS.findIndex((s) => s.minutes === 240)
const EXPRESS_MAX_MINUTES = 15

// Tiempo por jugada en segundos; null = sin límite. Default: 1 min.
const GUESS_OPTIONS: { value: number | null; label: string }[] = [
  { value: 60, label: '1 min' },
  { value: 120, label: '2 min' },
  { value: 180, label: '3 min' },
  { value: null, label: 'Sin límite' },
]

// Fecha de hoy en formato `yyyy-mm-dd` (zona local), para el valor por defecto del
// input date. La usamos también como "centinela": si el usuario no cambia la fecha,
// no la guardamos (no hay columna de fecha; ver nota en `save`).
function todayIso(): string {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10)
}

/**
 * AÑADIR RECUERDO — el flujo CLAVE de la separación contenido/reto
 * (flujos-viaje-po.md §1.3 y §2.B). El camino feliz es ligero: una foto y/o un
 * lugar y una descripción → se guarda como RECUERDO (sin juego) en pocos toques.
 *
 * El RETO es una capa OPCIONAL bajo un toggle (apagado por defecto): al activarlo
 * aparecen los ajustes de juego (plazo, tiempo por jugada, candados de Street
 * View). Al guardar con el toggle ON, creamos el recuerdo y lo promocionamos a
 * reto (`createMoment` + `promoteToChallenge`): un solo camino de datos, sin
 * duplicar la lógica del asistente de reto clásico.
 *
 * El lugar del recuerdo es VISIBLE (`place_*`); al promocionar pasa a ser la
 * respuesta OCULTA a adivinar (`lat`/`lng`).
 */
export function AddMoment({ groupId, onBack, onCreated }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(todayIso)

  // Lugar VISIBLE del recuerdo. Sale de la foto (EXIF), del mapa o del GPS.
  const [place, setPlace] = useState<LatLng | null>(null)
  const [flyTo, setFlyTo] = useState<LatLng | null>(null)
  const [locating, setLocating] = useState(false)

  // GALERÍA del recuerdo: varias fotos del móvil, la 1ª es la portada. Cada una
  // se sube SIN EXIF al guardar. `previewUrl` es un object URL que revocamos al
  // quitar/desmontar para no fugar memoria. Un RETO usa solo la portada.
  const [photos, setPhotos] = useState<DraftPhoto[]>([])
  const [readingExif, setReadingExif] = useState(false)

  // ── Capa de RETO (opcional) ────────────────────────────────────────────────
  const [isChallenge, setIsChallenge] = useState(false)
  const [durationIndex, setDurationIndex] = useState(DEFAULT_DURATION_INDEX)
  const [guessSeconds, setGuessSeconds] = useState<number | null>(60)
  // Street View del reto (opcional). Con foto es contexto cercano; sin foto, ES la
  // escena. Candados de exploración: ambos permitidos por defecto.
  const [wantsStreetView, setWantsStreetView] = useState(false)
  const [pano, setPano] = useState<PanoramaMatch | null>(null)
  const [checkingPano, setCheckingPano] = useState(false)
  const [svPrompt, setSvPrompt] = useState<{ pano: PanoramaMatch; distanceMeters: number } | null>(
    null,
  )
  const [pov, setPov] = useState({ heading: 0, pitch: 0 })
  const [allowMove, setAllowMove] = useState(true)
  const [allowRotate, setAllowRotate] = useState(true)

  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  // Salida tipo móvil: al guardar, la pantalla se desliza hacia abajo antes de volver.
  const [leaving, setLeaving] = useState(false)
  const reducedMotion = useReducedMotion()
  const toast = useToast()
  const { user } = useSession()

  // Token para descartar búsquedas de panorama obsoletas (si se mueve el pin
  // mientras una búsqueda está en curso, ignoramos la vieja).
  const panoSearchToken = useRef(0)
  const hasPhoto = photos.length > 0

  // Revoca TODOS los object URLs de la galería al desmontar (no fugar memoria).
  useEffect(() => {
    return () => {
      setPhotos((prev) => {
        prev.forEach((p) => URL.revokeObjectURL(p.previewUrl))
        return []
      })
    }
  }, [])

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

  // Buscar Street View (solo con el toggle de reto ON y un lugar fijado):
  //  · Con foto: contexto a ≤50 m → si cae cerca, pedimos confirmar.
  //  · Sin foto: el SV ES la escena → exigimos cobertura en el punto exacto.
  useEffect(() => {
    if (!place || !wantsStreetView || !isChallenge) return
    const token = ++panoSearchToken.current
    void (async () => {
      setSvPrompt(null)
      setPano(null)
      setCheckingPano(true)
      try {
        if (hasPhoto) {
          const near = await findPanoramaNear(place.lat, place.lng, SV_NEAR_RADIUS)
          if (token !== panoSearchToken.current) return
          if (!near) {
            toast.show('No hay Street View cerca de la foto. El reto irá solo con la foto.', {
              tone: 'neutral',
            })
            return
          }
          setSvPrompt({ pano: near, distanceMeters: near.distanceMeters })
        } else {
          const match = await findPanorama(place.lat, place.lng)
          if (token !== panoSearchToken.current) return
          if (!match) {
            toast.show('Aquí no hay Street View; mueve el pin a un punto con cobertura.', {
              tone: 'danger',
            })
            return
          }
          setPano(match)
          setPov({ heading: 0, pitch: 0 })
        }
      } finally {
        if (token === panoSearchToken.current) setCheckingPano(false)
      }
    })()
    // toast es estable (contexto). Reaccionamos al lugar, al toggle de SV/reto y a
    // si hay foto (cambia el criterio: cercano vs. exacto).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place, wantsStreetView, isChallenge, hasPhoto])

  function acceptSv() {
    if (!svPrompt) return
    setPano(svPrompt.pano)
    setPov({ heading: 0, pitch: 0 })
    setSvPrompt(null)
  }

  function rejectSv() {
    setSvPrompt(null)
    setPano(null)
  }

  function toggleStreetView() {
    setWantsStreetView((on) => {
      const next = !on
      if (!next) {
        setPano(null)
        setSvPrompt(null)
        setAllowMove(true)
        setAllowRotate(true)
      }
      return next
    })
  }

  // Al apagar el toggle de reto, limpiamos toda la capa de juego (vuelve a ser un
  // recuerdo puro): así no arrastramos un panorama o candados invisibles.
  function toggleIsChallenge() {
    setIsChallenge((on) => {
      const next = !on
      if (!next) {
        setWantsStreetView(false)
        setPano(null)
        setSvPrompt(null)
        setAllowMove(true)
        setAllowRotate(true)
      }
      return next
    })
  }

  // Reglas de guardado:
  //  · Recuerdo: con título basta (foto y lugar son opcionales). Es lo barato.
  //  · Reto: además exige LUGAR (la respuesta a adivinar) y nada pendiente de SV.
  const titleValid = title.trim().length > 0
  const canSaveMemory = titleValid && !locating && !readingExif
  const canSaveChallenge = canSaveMemory && place != null && !svPrompt && !checkingPano
  const canSave = isChallenge ? canSaveChallenge : canSaveMemory

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
    if (isChallenge && !place) {
      toast.show('Un reto necesita un lugar a adivinar. Márcalo en el mapa.', { tone: 'danger' })
      return
    }

    setBusy(true)
    try {
      // Fotos opcionales: subida comprimida y SIN EXIF, en ORDEN (la 1ª es la
      // portada). Para un RETO solo subimos la portada (se queda con una sola
      // foto, la que se adivina). Las paths conservan el orden de la galería.
      const uploadList = isChallenge ? photos.slice(0, 1) : photos
      const paths: string[] = []
      for (let i = 0; i < uploadList.length; i++) {
        setStatus(
          uploadList.length > 1
            ? `Subiendo fotos… (${i + 1}/${uploadList.length})`
            : 'Subiendo la foto…',
        )
        paths.push(await uploadImage(uploadList[i].file))
      }
      // La portada espeja `image_path` (lo lee la tarjeta del viaje y el mapamundi).
      const coverPath = paths[0]

      setStatus(isChallenge ? 'Creando el reto…' : 'Guardando el recuerdo…')
      // 1) Siempre nace como RECUERDO (la unidad mínima). El lugar es VISIBLE.
      const { challenge } = await createMoment({
        title: title.trim(),
        createdBy: user.id,
        groupId,
        description: buildDescription(),
        placeLat: place?.lat ?? null,
        placeLng: place?.lng ?? null,
        imagePath: coverPath ?? null,
        svPanoId: isChallenge ? (pano?.panoId ?? null) : null,
        svHeading: isChallenge && pano ? pov.heading : null,
        svPitch: isChallenge && pano ? pov.pitch : null,
      })

      // 1b) Galería del recuerdo: registramos TODAS las fotos en `moment_images`
      // con su orden. Solo para recuerdo (un reto se queda con su foto única, ya
      // en `image_path`). `image_path` ya quedó espejado por `createMoment`.
      if (!isChallenge && paths.length > 0) {
        await addMomentImages(challenge.id, paths)
      }

      // 2) Si el toggle de reto está ON, lo promocionamos: el lugar VISIBLE pasa a
      // ser la respuesta OCULTA, con plazo, cronómetro y candados de Street View.
      let result = challenge
      if (isChallenge && place) {
        result = await promoteToChallenge(challenge.id, {
          lat: place.lat,
          lng: place.lng,
          deadlineAt: deadlineFromMinutes(DURATION_STOPS[durationIndex].minutes),
          guessSeconds,
          svPanoId: pano?.panoId ?? null,
          svHeading: pano ? pov.heading : null,
          svPitch: pano ? pov.pitch : null,
          // El toggle es "permitir"; el candado es lo contrario (lock = !allow).
          svLockMove: pano ? !allowMove : false,
          svLockRotate: pano ? !allowRotate : false,
          photoIsHint: true,
        })
      }

      setStatus(null)
      track('moment_created', {
        group_id: groupId,
        challenge_id: result.id,
        has_photo: paths.length > 0,
        photo_count: paths.length,
        has_place: place != null,
        promoted_to_challenge: isChallenge,
      })
      // Efecto móvil al guardar: vibración corta + la pantalla se desliza hacia abajo
      // (como descartar una hoja nativa) y luego volvemos al viaje. Sin animación con
      // reduced-motion: navegamos directos.
      if (reducedMotion) {
        onCreated(result)
      } else {
        navigator.vibrate?.(30)
        setLeaving(true)
        window.setTimeout(() => onCreated(result), 260)
      }
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

  const durationStop = DURATION_STOPS[durationIndex]
  const isExpress = durationStop.minutes <= EXPRESS_MAX_MINUTES

  return (
    <main className={`lg-page ${styles.screen}${leaving ? ` ${styles.leaving}` : ''}`}>
      <Stack gap={5} className="lg-stagger">
        <header className={styles.header}>
          <Button variant="ghost" size="sm" onClick={onBack}>
            ← Volver
          </Button>
          <div className={styles.heading}>
            <span className={styles.eyebrow}>Tu viaje</span>
            <h1 className={styles.title}>Añadir un recuerdo</h1>
            <p className={styles.lede}>
              Una foto, un sitio, unas palabras. Lo compartes y los tuyos lo viven contigo.
            </p>
          </div>
        </header>

        {/* FOTOS — galería del recuerdo (la 1ª es la portada). Un reto usa solo la
            portada (se queda con una foto, la que se adivina). */}
        <section className={styles.block}>
          <span className={styles.blockLabel}>
            {isChallenge ? 'Foto' : 'Fotos'} <span className={styles.optional}>opcional</span>
          </span>
          <MomentGalleryPicker
            photos={photos}
            loading={readingExif}
            onAdd={(files) => void onAddPhotos(files)}
            onRemove={onRemovePhoto}
            onMakeCover={onMakeCover}
          />
          {isChallenge && photos.length > 1 && (
            <span className={styles.hint}>
              Un reto usa solo la portada (la 1ª). Las demás no se guardan.
            </span>
          )}
        </section>

        {/* LUGAR — mapa satélite. En recuerdo es el sitio VISIBLE; con el toggle de
            reto ON es la respuesta OCULTA a adivinar (cambia el lenguaje). */}
        <section className={styles.block}>
          <span className={styles.blockLabel}>
            {isChallenge ? '🎯 Lugar a adivinar' : '📍 Sitio del recuerdo'}{' '}
            <span className={styles.optional}>{isChallenge ? 'obligatorio' : 'opcional'}</span>
          </span>
          <Stack gap={3}>
            <Button variant="secondary" fullWidth loading={locating} onClick={useGps}>
              📍 Mi ubicación
            </Button>
            <MapPicker value={place} flyTo={flyTo} center={SPAIN} zoom={5} onPick={pickPlace} />
            {place ? (
              <Row gap={2} align="center">
                <Badge tone="accent">📍 Sitio marcado</Badge>
                <span className={styles.coords}>
                  {place.lat.toFixed(5)}, {place.lng.toFixed(5)}
                </span>
              </Row>
            ) : (
              <span className={styles.hint}>
                👆 Toca el mapa para marcar dónde es. Sin lugar también vale.
              </span>
            )}
            {isChallenge && (
              <span className={styles.hint}>
                Este será el sitio oculto que los jugadores deberán adivinar.
              </span>
            )}
          </Stack>
        </section>

        {/* DESCRIPCIÓN + FECHA */}
        <section className={styles.block}>
          <Field label="Título" hint="Cómo lo recordarás de un vistazo.">
            {(fieldProps) => (
              <Input
                {...fieldProps}
                placeholder="Atardecer en Santorini 🌅"
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
              <Input
                {...fieldProps}
                type="date"
                value={date}
                max={todayIso()}
                onChange={(e) => setDate(e.target.value)}
              />
            )}
          </Field>
        </section>

        {/* TOGGLE — convertir en reto. Apagado por defecto. */}
        <section className={styles.challengeCard} data-on={isChallenge || undefined}>
          <button
            type="button"
            className={styles.toggle}
            role="switch"
            aria-checked={isChallenge}
            onClick={toggleIsChallenge}
          >
            <span className={styles.toggleText}>
              <span className={styles.toggleTitle}>
                {isChallenge ? '✓ Es un reto' : '🎯 Convertirlo en reto'}
              </span>
              <span className={styles.toggleHint}>
                Esconde el lugar y que adivinen dónde es, con cuenta atrás.
              </span>
            </span>
            <span className={styles.switch} aria-hidden>
              <span className={styles.knob} />
            </span>
          </button>

          {isChallenge && (
            <Stack gap={5} className={styles.challengeBody}>
              {!place && (
                <Row gap={2} align="center" className={styles.warn}>
                  <span aria-hidden>⚠️</span>
                  <span>Un reto necesita un lugar a adivinar. Márcalo en el mapa de arriba.</span>
                </Row>
              )}

              <Field label="Duración">
                {(fieldProps) => (
                  <Stack gap={2}>
                    <Row gap={2} className={styles.durationValue}>
                      <span className={styles.durationLabel}>{durationStop.label}</span>
                      {isExpress && <span className={styles.expressPill}>⚡ Express</span>}
                    </Row>
                    <input
                      {...fieldProps}
                      type="range"
                      className={styles.durationSlider}
                      min={0}
                      max={DURATION_STOPS.length - 1}
                      step={1}
                      value={durationIndex}
                      onChange={(e) => setDurationIndex(Number(e.target.value))}
                      aria-label="Duración del reto"
                      aria-valuetext={durationStop.label}
                    />
                    <Row gap={2} justify="between" className={styles.durationScale}>
                      <span>{DURATION_STOPS[0].label}</span>
                      <span>{DURATION_STOPS[DURATION_STOPS.length - 1].label}</span>
                    </Row>
                  </Stack>
                )}
              </Field>

              <Field label="Tiempo por jugada">
                {() => (
                  <Row gap={2} wrap>
                    {GUESS_OPTIONS.map((opt) => (
                      <Button
                        key={opt.label}
                        variant={guessSeconds === opt.value ? 'primary' : 'secondary'}
                        size="sm"
                        aria-pressed={guessSeconds === opt.value}
                        onClick={() => setGuessSeconds(opt.value)}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </Row>
                )}
              </Field>

              {/* Street View opcional (solo con lugar fijado). */}
              <Stack gap={3}>
                <span className={styles.blockLabel}>
                  Street View <span className={styles.optional}>opcional</span>
                </span>
                <span className={styles.hint}>Deja que exploren tu calle en 360°.</span>
                <Button
                  variant={wantsStreetView ? 'primary' : 'secondary'}
                  fullWidth
                  disabled={!place}
                  aria-pressed={wantsStreetView}
                  onClick={toggleStreetView}
                >
                  {wantsStreetView ? '✓ Street View' : '🗺️ Añadir Street View'}
                </Button>
                {!place && <span className={styles.hint}>Marca antes el lugar en el mapa.</span>}

                {checkingPano && (
                  <Row gap={2} className={styles.status}>
                    <Spinner size={16} />
                    <span>Buscando Street View…</span>
                  </Row>
                )}

                {svPrompt && (
                  <Stack gap={2} className={styles.svPrompt}>
                    <span>Street View a {svPrompt.distanceMeters} m del lugar. ¿Lo usamos?</span>
                    <Row gap={2} wrap>
                      <Button size="sm" onClick={acceptSv}>
                        Sí, usarlo
                      </Button>
                      <Button variant="ghost" size="sm" onClick={rejectSv}>
                        No
                      </Button>
                    </Row>
                  </Stack>
                )}

                {pano && (
                  <StreetViewPreview
                    panoId={pano.panoId}
                    heading={pov.heading}
                    pitch={pov.pitch}
                    onPovChange={setPov}
                  />
                )}

                {pano && (
                  <details className={styles.advanced}>
                    <summary className={styles.advancedSummary}>Opciones avanzadas</summary>
                    <Stack gap={3} className={styles.advancedBody}>
                      <Row gap={2} align="center" wrap>
                        <Button
                          variant={allowMove ? 'primary' : 'secondary'}
                          size="sm"
                          aria-pressed={allowMove}
                          onClick={() => setAllowMove((v) => !v)}
                        >
                          {allowMove ? '✓ ' : ''}Permitir moverse
                        </Button>
                        <span className={styles.hint}>
                          {allowMove ? 'Pueden avanzar por la calle.' : 'No pueden avanzar.'}
                        </span>
                      </Row>
                      <Row gap={2} align="center" wrap>
                        <Button
                          variant={allowRotate ? 'primary' : 'secondary'}
                          size="sm"
                          aria-pressed={allowRotate}
                          onClick={() => setAllowRotate((v) => !v)}
                        >
                          {allowRotate ? '✓ ' : ''}Permitir mirar alrededor
                        </Button>
                        <span className={styles.hint}>
                          {allowRotate ? 'Pueden girar la cámara.' : 'Vista fija.'}
                        </span>
                      </Row>
                    </Stack>
                  </details>
                )}
              </Stack>
            </Stack>
          )}
        </section>

        {/* CTA — el verbo cambia con el toggle. Mientras guarda, el PROPIO botón
            muestra el estado (subiendo fotos n/N, guardando…) para que se vea qué
            pasa y no parezca colgado. */}
        <Button size="lg" fullWidth loading={busy} disabled={!canSave} onClick={() => void save()}>
          {busy ? (status ?? 'Guardando…') : isChallenge ? '🎯 Crear reto' : 'Guardar recuerdo'}
        </Button>
      </Stack>
    </main>
  )
}
