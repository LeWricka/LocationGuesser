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
import { Compass, Lock, MapPin, Trash2 } from 'lucide-react'
import {
  AppHeader,
  Badge,
  Banner,
  Button,
  ChallengePhoto,
  Field,
  FileButton,
  Icon,
  Input,
  Row,
  SegmentedControl,
  type SegmentedOption,
  Spinner,
  Stack,
  useToast,
} from '../../ui'
import styles from './EditChallenge.module.css'

interface Props {
  /** Reto a editar (SIN lat/lng: la respuesta se carga aparte de challenge_answers). */
  challenge: ChallengeForPlay
  /** Vuelve atrás sin guardar (cancelar). */
  onBack: () => void
  /** Reto actualizado: el grupo lo usa para refrescar la lista. */
  onSaved: (challenge: ChallengeForPlay) => void
}

// "Paradas" de duración: editar la duración recoloca el plazo a "ahora + duración
// elegida" (es lo único inequívoco; recalcular contra el created_at original
// confundiría). El valor del segmento es la cifra de minutos en texto; el valor
// especial '' = "sin cambios" (mantenemos el plazo actual).
const KEEP_DURATION = ''
const DURATION_OPTIONS: SegmentedOption<string>[] = [
  { value: KEEP_DURATION, label: 'Sin cambios' },
  { value: '60', label: '1 h' },
  { value: '240', label: '4 h' },
  { value: '720', label: '12 h' },
  { value: '1440', label: '24 h' },
  { value: '2880', label: '48 h' },
]

// Tiempo por jugada en segundos; '' = sin límite. El control segmentado trabaja con
// strings, así que el null lógico se codifica como '' (y se decodifica al guardar).
const NO_GUESS_LIMIT = ''
const GUESS_OPTIONS: SegmentedOption<string>[] = [
  { value: '60', label: '1 min' },
  { value: '120', label: '2 min' },
  { value: '180', label: '3 min' },
  { value: NO_GUESS_LIMIT, label: 'Sin límite' },
]

// Foto: pista visible al jugar o sorpresa hasta el revelado.
const PHOTO_OPTIONS: SegmentedOption<string>[] = [
  { value: 'hint', label: 'Pista' },
  { value: 'surprise', label: 'Sorpresa' },
]

const SPAIN: LatLng = { lat: 40.4, lng: -3.7 }

// Pantalla de edición de reto (solo dueño). Reutiliza las piezas de crear
// (MapPicker, StreetViewPreview) con la estética del sistema de diseño.
//
// DOS reglas de integridad distintas:
//  - La UBICACIÓN-RESPUESTA (lat/lng) solo se puede tocar si el reto aún no tiene
//    jugadas; con votos guardados, moverla cambiaría la respuesta y dejaría
//    inconsistentes distancias/puntos (#146).
//  - El STREET VIEW (la escena/paseo) SÍ se puede añadir/cambiar/quitar SIEMPRE,
//    incluso con jugadas: no revela ni altera la respuesta ni los puntos. Así un
//    reto solo-foto puede ganar un paseo después de haberse jugado.
export function EditChallenge({ challenge, onBack, onSaved }: Props) {
  const [title, setTitle] = useState(challenge.title)
  // Guardamos los segmentos como string ('' = sin límite / sin cambios) y los
  // decodificamos al guardar.
  const [guessValue, setGuessValue] = useState<string>(
    challenge.guess_seconds == null ? NO_GUESS_LIMIT : String(challenge.guess_seconds),
  )
  const [durationValue, setDurationValue] = useState<string>(KEEP_DURATION)

  // Ubicación-respuesta editable solo sin votos. Mientras no lo sepamos, bloqueamos
  // por seguridad (locked = true) para no ofrecer un campo que el guardado rechazaría.
  const [votes, setVotes] = useState<number | null>(null)
  const locationLocked = votes === null || votes > 0

  // Punto/panorama: la ubicación real (la respuesta) ya NO viaja en el reto (columna
  // revocada en 0010). La cargamos aparte de `challenge_answers` (el dueño tiene
  // derecho por RLS) y prefijamos el formulario cuando llega. Hasta entonces,
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
  // ¿El dueño ha tocado la ubicación-respuesta en esta sesión? Si no, no la mandamos.
  const [locationTouched, setLocationTouched] = useState(false)

  // Edición de la ESCENA (Street View) con la ubicación bloqueada: abrir un mapa para
  // recolocar SOLO el paseo (sin tocar la respuesta). `sceneTouched` marca que el
  // dueño cambió el paseo en esta sesión (para mandar `scene` al guardar).
  const [sceneEditing, setSceneEditing] = useState(false)
  const [sceneTouched, setSceneTouched] = useState(false)
  const hadStreetView = challenge.sv_pano_id != null

  // Foto: precargamos la existente (firmada) como preview. `photoFile` solo se setea
  // si el dueño elige una nueva; `removePhoto` marca quitar la actual.
  const existingPhotoUrl = useSignedImage(challenge.image_path)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [photoIsHint, setPhotoIsHint] = useState(challenge.photo_is_hint)

  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const toast = useToast()

  // ¿Tiene votos? Decide si la ubicación es editable. Se comprueba en cliente para la
  // UI; updateChallenge lo revalida en la capa de datos.
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
  // formulario. El dueño tiene derecho a leerla por RLS aunque el reto siga abierto y
  // sin votos. Prefija punto, mapa (flyTo) y el panorama existente (si lo había).
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

  // Al recolocar el punto, encajamos el panorama más cercano (igual que al crear).
  // Vale tanto si se mueve la respuesta (ubicación editable) como si solo se recoloca
  // la escena (ubicación bloqueada): en ambos casos buscamos el panorama del punto.
  useEffect(() => {
    const movingAnswer = !locationLocked && locationTouched
    const movingScene = locationLocked && sceneTouched
    if (!movingAnswer && !movingScene) return
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
    // toast es estable; solo reaccionamos al punto y a qué se está moviendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point, locationLocked, locationTouched, sceneTouched])

  // Recolocar el punto. Con la ubicación editable mueve la RESPUESTA; con ella
  // bloqueada (escena en edición) solo recoloca el PASEO.
  function pickPoint(p: LatLng) {
    if (!locationLocked) {
      setLocationTouched(true)
    } else if (sceneEditing) {
      setSceneTouched(true)
    } else {
      return
    }
    setPoint(p)
    setFlyTo(p)
  }

  // Abrir el mapa para colocar/cambiar el Street View con la respuesta bloqueada.
  function startSceneEdit() {
    setSceneEditing(true)
    // Sembramos el mapa cerca de la respuesta para que sea fácil acertar la calle.
    if (locationReady) setFlyTo({ ...point })
  }

  // Quitar el Street View del reto (la escena, no la respuesta).
  function removeScene() {
    setPano(null)
    setSceneTouched(true)
    setSceneEditing(false)
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

      const guessSeconds = guessValue === NO_GUESS_LIMIT ? null : Number(guessValue)
      const changingAnswer = !locationLocked && locationTouched && pano != null
      // La escena se manda cuando el dueño la tocó con la respuesta BLOQUEADA (con la
      // respuesta editable, la escena ya viaja dentro de `location`). `pano=null` con
      // sceneTouched = quitar el paseo.
      const changingScene = locationLocked && sceneTouched

      setStatus('Guardando los cambios…')
      const updated = await updateChallenge(challenge.id, {
        title: title.trim() || '¿Dónde estoy? 🌍',
        guessSeconds,
        photoIsHint,
        ...(imagePath !== undefined ? { imagePath } : {}),
        ...(durationValue !== KEEP_DURATION
          ? { deadlineAt: deadlineFromMinutes(Number(durationValue)) }
          : {}),
        ...(changingAnswer
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
        ...(changingScene
          ? {
              scene: pano
                ? { svPanoId: pano.panoId, svHeading: pov.heading, svPitch: pov.pitch }
                : null,
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
      <AppHeader title="Editar reto" lead="back" onLead={onBack} leadLabel="Volver" />

      <Stack gap={4}>
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

        {/* Ubicación-respuesta: bloqueada si el reto ya tiene jugadas (cambiarla
            alteraría la respuesta y los puntos ya guardados). Lo explicamos. */}
        <Field
          label="Ubicación"
          hint={
            locationLocked
              ? undefined
              : 'Toca el mapa para mover el punto. Aún no hay jugadas, así que puedes cambiarlo.'
          }
        >
          {() =>
            locationLocked ? (
              <Stack gap={2}>
                <Banner tone="info" icon={Lock}>
                  Bloqueada: este reto ya tiene jugadas. Cambiar el sitio alteraría la respuesta y
                  los puntos. (El Street View sí se puede cambiar más abajo.)
                </Banner>
                <Row gap={2} className={styles.coords}>
                  <Badge tone="neutral">
                    <Icon icon={Lock} size={14} /> Ubicación fija
                  </Badge>
                  <span>
                    {locationReady
                      ? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`
                      : 'Cargando…'}
                  </span>
                </Row>
              </Stack>
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

        {/* Street View (la ESCENA): editable SIEMPRE, también con jugadas. No revela
            ni cambia la respuesta. Solo se muestra como sección aparte cuando la
            ubicación está bloqueada; con ella editable, el SV ya va con el mapa de
            arriba (al mover el punto se recoloca el paseo). */}
        {locationLocked && (
          <Field
            label="Street View"
            hint="Un paseo por la calle como pista extra. Cambiarlo no toca la respuesta ni los puntos."
          >
            {() => (
              <Stack gap={3}>
                {sceneEditing ? (
                  <>
                    <MapPicker
                      value={point}
                      flyTo={flyTo}
                      center={SPAIN}
                      zoom={5}
                      onPick={pickPoint}
                    />
                    <p className={styles.coords}>
                      Toca el mapa donde quieras el paseo. Buscamos el Street View más cercano.
                    </p>
                  </>
                ) : (
                  <Row gap={2} wrap>
                    <Button variant="secondary" size="sm" onClick={startSceneEdit}>
                      <Icon icon={Compass} size={16} />
                      {pano ? 'Cambiar el Street View' : 'Añadir Street View'}
                    </Button>
                    {pano && (
                      <Button variant="ghost" size="sm" onClick={removeScene}>
                        <Icon icon={Trash2} size={16} />
                        Quitar Street View
                      </Button>
                    )}
                  </Row>
                )}

                {checkingPano && (
                  <Row gap={2} className={styles.status}>
                    <Spinner size={16} />
                    <span>Buscando Street View…</span>
                  </Row>
                )}

                {pano ? (
                  <StreetViewPreview
                    panoId={pano.panoId}
                    heading={pov.heading}
                    pitch={pov.pitch}
                    onPovChange={setPov}
                  />
                ) : (
                  !sceneEditing && (
                    <p className={styles.coords}>
                      {hadStreetView && !sceneTouched
                        ? 'Cargando el paseo…'
                        : 'Este reto no tiene Street View.'}
                    </p>
                  )
                )}
              </Stack>
            )}
          </Field>
        )}

        <Field label="Foto del reto" hint="Opcional. Se sube sin datos de ubicación (sin EXIF).">
          {(fieldProps) => (
            <Stack gap={3} align="start">
              <FileButton
                {...fieldProps}
                accept="image/*"
                variant="secondary"
                ariaLabel="Elegir foto del reto"
                onPick={pickPhoto}
              >
                {showPhotoPreview ? 'Cambiar foto' : 'Elegir foto'}
              </FileButton>
              {showPhotoPreview && (
                <>
                  <ChallengePhoto src={showPhotoPreview} alt="Vista previa de la foto del reto" />
                  <SegmentedControl
                    label="Cómo se muestra la foto"
                    options={PHOTO_OPTIONS}
                    value={photoIsHint ? 'hint' : 'surprise'}
                    onChange={(v) => setPhotoIsHint(v === 'hint')}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      pickPhoto(null)
                      setRemovePhoto(true)
                    }}
                  >
                    <Icon icon={Trash2} size={16} />
                    Quitar foto
                  </Button>
                </>
              )}
            </Stack>
          )}
        </Field>

        <Field
          label="Duración del reto"
          hint="Elige para reabrir el plazo desde ahora; «Sin cambios» lo deja como está."
        >
          {() => (
            <SegmentedControl
              label="Duración del reto"
              options={DURATION_OPTIONS}
              value={durationValue}
              onChange={setDurationValue}
            />
          )}
        </Field>

        <Field label="Tiempo por jugada">
          {() => (
            <SegmentedControl
              label="Tiempo por jugada"
              options={GUESS_OPTIONS}
              value={guessValue}
              onChange={setGuessValue}
            />
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
