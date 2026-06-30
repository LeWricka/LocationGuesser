import { useEffect, useState } from 'react'
import { MapPicker } from '../create/MapPicker'
import { StreetViewPreview } from '../create/StreetViewPreview'
import type { LatLng } from '../../lib/geo'
import { countVotes, getAnswer, updateChallenge, type ChallengeForPlay } from '../../lib/challenges'
import { deadlineFromMinutes } from '../../lib/time'
import { findPanorama, type PanoramaMatch } from '../../lib/streetview'
import { uploadImage } from '../../lib/storage'
import { useSignedImage } from '../../lib/useSignedImage'
import { track } from '../../lib/analytics'
import { Lock, MapPin, Zap } from 'lucide-react'
import {
  Badge,
  Button,
  ChallengePhoto,
  Field,
  Icon,
  Input,
  Row,
  Spinner,
  Stack,
  useToast,
} from '../../ui'
import styles from '../create/CreateChallenge.module.css'

interface Props {
  /** Reto a editar (SIN lat/lng: la respuesta se carga aparte de challenge_answers). */
  challenge: ChallengeForPlay
  /** Vuelve atrás sin guardar (cancelar). */
  onBack: () => void
  /** Reto actualizado: el grupo lo usa para refrescar la lista. */
  onSaved: (challenge: ChallengeForPlay) => void
}

// Mismas "paradas" de duración que al crear: editar la duración recoloca el
// plazo a "ahora + duración elegida" (es lo único inequívoco; recalcular contra
// el created_at original confundiría). Por defecto, dejamos el plazo como está y
// solo lo tocamos si el dueño mueve el slider.
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
const DEFAULT_DURATION_INDEX = DURATION_STOPS.findIndex((s) => s.minutes === 1440)
const EXPRESS_MAX_MINUTES = 15

const GUESS_OPTIONS: { value: number | null; label: string }[] = [
  { value: 60, label: '1 min' },
  { value: 120, label: '2 min' },
  { value: 180, label: '3 min' },
  { value: null, label: 'Sin límite' },
]

const SPAIN: LatLng = { lat: 40.4, lng: -3.7 }

// Pantalla de edición de reto (solo dueño). Reutiliza las piezas de crear
// (MapPicker, StreetViewPreview) pero con la REGLA CRÍTICA del #146: la ubicación
// solo se puede tocar si el reto aún no tiene jugadas; con votos guardados, mover
// lat/lng cambiaría la respuesta y dejaría inconsistentes distancias/puntos.
export function EditChallenge({ challenge, onBack, onSaved }: Props) {
  const [title, setTitle] = useState(challenge.title)
  const [guessSeconds, setGuessSeconds] = useState<number | null>(challenge.guess_seconds)
  // Duración: index null = "sin cambios" (mantenemos el plazo actual). En cuanto
  // el dueño mueve el slider, fijamos un index y recalculamos el deadline.
  const [durationIndex, setDurationIndex] = useState<number | null>(null)

  // Ubicación editable solo sin votos. Mientras no lo sepamos, bloqueamos por
  // seguridad (locked = true) para no ofrecer un campo que el guardado rechazaría.
  const [votes, setVotes] = useState<number | null>(null)
  const locationLocked = votes === null || votes > 0

  // Punto/panorama: la ubicación real (la respuesta) ya NO viaja en el reto
  // (columna revocada en 0010). La cargamos aparte de `challenge_answers` (el dueño
  // tiene derecho por RLS) y prefijamos el formulario cuando llega. Hasta entonces,
  // arrancamos en un punto neutro y marcamos `locationReady=false`.
  const [point, setPoint] = useState<LatLng>(SPAIN)
  const [flyTo, setFlyTo] = useState<LatLng | null>(null)
  const [pano, setPano] = useState<PanoramaMatch | null>(null)
  const [locationReady, setLocationReady] = useState(false)
  const [pov, setPov] = useState({
    heading: challenge.sv_heading ?? 0,
    pitch: challenge.sv_pitch ?? 0,
  })
  const [checkingPano, setCheckingPano] = useState(false)
  // ¿El dueño ha tocado la ubicación en esta sesión? Si no, no la mandamos.
  const [locationTouched, setLocationTouched] = useState(false)

  // Foto: precargamos la existente (firmada) como preview. `photoFile` solo se
  // setea si el dueño elige una nueva; `removePhoto` marca quitar la actual.
  const existingPhotoUrl = useSignedImage(challenge.image_path)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [photoIsHint, setPhotoIsHint] = useState(challenge.photo_is_hint)

  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const toast = useToast()

  // ¿Tiene votos? Decide si la ubicación es editable. Se comprueba en cliente
  // para la UI; updateChallenge lo revalida en la capa de datos.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const n = await countVotes(challenge.id)
        if (!cancelled) setVotes(n)
      } catch {
        // Si falla, mantenemos la ubicación bloqueada (votes sigue null).
      }
    })()
    return () => {
      cancelled = true
    }
  }, [challenge.id])

  // Carga la ubicación real (la respuesta) de challenge_answers para prefijar el
  // formulario. El dueño tiene derecho a leerla por RLS aunque el reto siga abierto
  // y sin votos. Prefija punto, mapa (flyTo) y el panorama existente (si lo había).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const answer = await getAnswer(challenge.id)
        if (cancelled || !answer) return
        setPoint(answer)
        setFlyTo(answer)
        if (challenge.sv_pano_id) {
          setPano({ panoId: challenge.sv_pano_id, lat: answer.lat, lng: answer.lng })
        }
        setLocationReady(true)
      } catch {
        // Sin respuesta (RLS/red): dejamos el formulario sin prefijar (locationReady
        // sigue false); el dueño puede recolocar si la ubicación no está bloqueada.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [challenge.id, challenge.sv_pano_id])

  function pickPhoto(file: File | null) {
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return file ? URL.createObjectURL(file) : null
    })
    setPhotoFile(file)
    if (file) setRemovePhoto(false)
  }

  // Al recolocar el punto (solo si la ubicación es editable), encajamos el
  // panorama más cercano, igual que al crear.
  useEffect(() => {
    if (locationLocked || !locationTouched) return
    let cancelled = false
    void (async () => {
      setCheckingPano(true)
      setPano(null)
      try {
        const match = await findPanorama(point.lat, point.lng)
        if (cancelled) return
        if (!match) {
          toast.show('No hay Street View aquí; elige otro punto.', { tone: 'danger' })
          return
        }
        setPano(match)
        setPov({ heading: 0, pitch: 0 })
      } finally {
        if (!cancelled) setCheckingPano(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // toast es estable; solo reaccionamos al punto y al estado de bloqueo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point, locationLocked, locationTouched])

  function pickPoint(p: LatLng) {
    if (locationLocked) return
    setLocationTouched(true)
    setPoint(p)
    setFlyTo(p)
  }

  async function save() {
    setBusy(true)
    try {
      // Foto: subimos la nueva (sin EXIF) si la hay; null si el dueño la quitó.
      let imagePath: string | null | undefined
      if (photoFile) {
        setStatus('Subiendo la foto…')
        imagePath = await uploadImage(photoFile)
      } else if (removePhoto) {
        imagePath = null
      }

      setStatus('Guardando los cambios…')
      const updated = await updateChallenge(challenge.id, {
        title: title.trim() || '¿Dónde estoy? 🌍',
        guessSeconds,
        photoIsHint,
        ...(imagePath !== undefined ? { imagePath } : {}),
        ...(durationIndex !== null
          ? { deadlineAt: deadlineFromMinutes(DURATION_STOPS[durationIndex].minutes) }
          : {}),
        // La ubicación solo si es editable (sin votos) y el dueño la tocó.
        ...(!locationLocked && locationTouched && pano
          ? {
              location: {
                lat: pano.lat,
                lng: pano.lng,
                svPanoId: pano.panoId,
                svHeading: pov.heading,
                svPitch: pov.pitch,
              },
            }
          : {}),
      })
      setStatus(null)
      track('challenge_edited', { group_id: challenge.group_id, challenge_id: challenge.id })
      onSaved(updated)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setStatus(null)
      toast.show(`No se pudieron guardar los cambios: ${msg}`, { tone: 'danger' })
      setBusy(false)
    }
  }

  const showPhotoPreview = photoPreview ?? (removePhoto ? null : existingPhotoUrl)

  return (
    <main className="lg-page">
      <Stack gap={4}>
        <Row gap={3} className={styles.header}>
          <Button variant="ghost" size="sm" onClick={onBack}>
            ← Volver
          </Button>
          <h1 className={styles.title}>Editar reto</h1>
        </Row>

        <Field label="Título del reto" hint="Si lo dejas vacío usamos «¿Dónde estoy? 🌍».">
          {(fieldProps) => (
            <Input
              {...fieldProps}
              placeholder="¿Dónde estoy? 🌍"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
        </Field>

        {/* Ubicación: bloqueada si el reto ya tiene jugadas (cambiarla alteraría
            la respuesta y los puntos ya guardados). Lo explicamos al dueño. */}
        <Field
          label="Ubicación"
          hint={
            locationLocked
              ? 'Bloqueada: este reto ya tiene jugadas. Cambiar el sitio alteraría la respuesta y los puntos.'
              : 'Toca el mapa para mover el punto. Aún no hay jugadas, así que puedes cambiarlo.'
          }
        >
          {() =>
            locationLocked ? (
              <Row gap={2} className={styles.coords}>
                <Badge tone="neutral">
                  <Icon icon={Lock} size={14} /> Ubicación fija
                </Badge>
                <span>
                  {locationReady ? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` : 'Cargando…'}
                </span>
              </Row>
            ) : (
              <Stack gap={3}>
                <MapPicker value={point} flyTo={flyTo} center={SPAIN} zoom={5} onPick={pickPoint} />
                <Row gap={2}>
                  <Badge tone="accent">
                    <Icon icon={MapPin} size={14} /> Punto marcado
                  </Badge>
                  <span className={styles.coords}>
                    {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                  </span>
                </Row>
                {checkingPano && (
                  <Row gap={2} className={styles.status}>
                    <Spinner size={16} />
                    <span>Buscando Street View…</span>
                  </Row>
                )}
                {pano && (
                  <StreetViewPreview
                    panoId={pano.panoId}
                    heading={pov.heading}
                    pitch={pov.pitch}
                    onPovChange={setPov}
                  />
                )}
              </Stack>
            )
          }
        </Field>

        <Field label="Foto del reto" hint="Opcional. Se sube sin datos de ubicación (sin EXIF).">
          {(fieldProps) => (
            <Stack gap={3} align="start">
              <input
                {...fieldProps}
                type="file"
                accept="image/*"
                className={styles.fileInput}
                onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
              />
              {showPhotoPreview && (
                <>
                  <ChallengePhoto src={showPhotoPreview} alt="Vista previa de la foto del reto" />
                  <Row gap={2} wrap>
                    <Button
                      variant={photoIsHint ? 'primary' : 'secondary'}
                      size="sm"
                      aria-pressed={photoIsHint}
                      onClick={() => setPhotoIsHint(true)}
                    >
                      Foto como pista
                    </Button>
                    <Button
                      variant={!photoIsHint ? 'primary' : 'secondary'}
                      size="sm"
                      aria-pressed={!photoIsHint}
                      onClick={() => setPhotoIsHint(false)}
                    >
                      Foto sorpresa
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        pickPhoto(null)
                        setRemovePhoto(true)
                      }}
                    >
                      Quitar foto
                    </Button>
                  </Row>
                </>
              )}
            </Stack>
          )}
        </Field>

        <Field
          label="Duración del reto"
          hint="Muévelo para reabrir el plazo desde ahora; déjalo para no cambiarlo."
        >
          {(fieldProps) => {
            const index = durationIndex ?? DEFAULT_DURATION_INDEX
            const stop = DURATION_STOPS[index]
            const isExpress = stop.minutes <= EXPRESS_MAX_MINUTES
            return (
              <Stack gap={2}>
                <Row gap={2} className={styles.durationValue}>
                  <span className={styles.durationLabel}>
                    {durationIndex === null ? 'Sin cambios' : stop.label}
                  </span>
                  {durationIndex !== null && isExpress && (
                    <span className={styles.expressPill}>
                      <Icon icon={Zap} size={13} /> Express
                    </span>
                  )}
                </Row>
                <input
                  {...fieldProps}
                  type="range"
                  className={styles.durationSlider}
                  min={0}
                  max={DURATION_STOPS.length - 1}
                  step={1}
                  value={index}
                  onChange={(e) => setDurationIndex(Number(e.target.value))}
                  aria-label="Duración del reto"
                  aria-valuetext={durationIndex === null ? 'Sin cambios' : stop.label}
                />
                <Row gap={2} justify="between" className={styles.durationScale}>
                  <span>{DURATION_STOPS[0].label}</span>
                  <span>{DURATION_STOPS[DURATION_STOPS.length - 1].label}</span>
                </Row>
              </Stack>
            )
          }}
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

        <Button size="lg" fullWidth loading={busy} onClick={() => void save()}>
          Guardar cambios
        </Button>

        {status && (
          <Row gap={2} className={styles.status}>
            <Spinner size={16} />
            <span>{status}</span>
          </Row>
        )}
      </Stack>
    </main>
  )
}
