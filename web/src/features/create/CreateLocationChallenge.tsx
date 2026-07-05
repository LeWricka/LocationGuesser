import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { MapPicker } from './MapPicker'
import { StreetViewPreview } from './StreetViewPreview'
import { PhotoDropzone } from './PhotoDropzone'
import { ChallengeCreatedShare } from './ChallengeCreatedShare'
import { createChallenge, type ChallengeForPlay } from '../../lib/challenges'
import { deadlineFromMinutes } from '../../lib/time'
import { findPanorama, type PanoramaMatch } from '../../lib/streetview'
import { uploadImage } from '../../lib/storage'
import { track } from '../../lib/analytics'
import { reportError } from '../../lib/observability'
import { describeError } from '../../lib/errors'
import { useSession } from '../../lib/session-context'
import { DEFAULT_TIME_SCORING, type LatLng } from '../../lib/geo'
import { AppHeader, SegmentedControl, Spinner, useToast } from '../../ui'
import { IconGps } from '../../ui/icons/IconGps'
import { IconCandado } from '../../ui/icons/IconCandado'
import { IconPin } from '../../ui/icons/IconPin'
import styles from './CreateLocationChallenge.module.css'

// Los DOS pasos del flujo (issue #592, antes #585): el mapa manda en el paso de
// elegir sitio (necesita TODO el alto para afinar bien, y ahora también aloja la
// previa de SV inline); la previa YA NO vive en el paso 2 — ahí solo quedan las
// reglas (plazo/tiempo).
type Step = 'sitio' | 'previa'

interface Props {
  /** Grupo (el viaje) al que se añade el reto. */
  groupId: string
  /** Nombre del viaje para el contexto de cabecera. */
  groupName?: string | null
  /** Sale del flujo sin crear. */
  onBack: () => void
  /** Reto creado: el viaje vuelve a la lista y ofrece su enlace. */
  onCreated: (challenge: ChallengeForPlay) => void
  /**
   * SOLO galería/tests (issue #592): siembra el pin y el resultado de la
   * búsqueda de panorama YA RESUELTOS (sin red ni SDK de Maps), para capturas
   * deterministas de cada estado de la tarjeta SV / paso 2. `pano: 'none'`
   * simula "sin cobertura"; `step: 'previa'` salta directo a las reglas (por
   * defecto arranca en 'sitio', que es donde vive la tarjeta SV inline). En
   * producción no se pasa nunca.
   */
  initialState?: { point: LatLng; pano: PanoramaMatch | 'none'; step?: Step }
}

// Plazo del reto: duración relativa en minutos.
const DEADLINE_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 60, label: '1 h' },
  { minutes: 240, label: '4 h' },
  { minutes: 720, label: 'Hoy' },
  { minutes: 4320, label: '3 días' },
]
const DEFAULT_DEADLINE_INDEX = 1 // 4 h

// Tiempo por jugada en segundos; null = sin límite.
const GUESS_OPTIONS: { value: number | null; label: string }[] = [
  { value: 15, label: '15 s' },
  { value: 30, label: '30 s' },
  { value: 60, label: '60 s' },
  { value: null, label: 'Libre' },
]
const DEFAULT_GUESS_INDEX = 1 // 30 s

// Centro y zoom inicial del mapa (España como fallback cuando no hay GPS).
const DEFAULT_CENTER: LatLng = { lat: 40.4, lng: -3.7 }
const DEFAULT_ZOOM = 5
// Radio de búsqueda del panorama desde el punto elegido (metros).
const PANO_SEARCH_RADIUS = 80

// Estado de la búsqueda de panorama tras elegir un punto en el mapa.
type PanoState =
  | { kind: 'idle' } // sin punto elegido aún
  | { kind: 'searching'; at: LatLng } // buscando panorama
  | { kind: 'ready'; pano: PanoramaMatch } // panorama encontrado
  | { kind: 'no_coverage'; at: LatLng } // sin cobertura SV en ese punto

// Estado del GPS (solo para centrar el mapa, no es la respuesta).
type GpsState = 'idle' | 'locating' | 'done' | 'error'

// Reto ¿Dónde estamos? con selección MANUAL del punto en el mapa (label del
// tipo, antes "¿Dónde?"; el `challenge_kind` interno sigue siendo 'location').
//
// Flujo EN DOS PASOS (issue #592 — rediseño sobre #585/#588 con feedback del
// dueño):
//  1. EL SITIO — mapa a pantalla completa (buscador integrado como barra de
//     vidrio flotante; GPS SOLO al pulsar su botón, issue #592 punto 1 — nada
//     de pedir permiso de localización al montar). Al marcar/mover el pin: se
//     busca el panorama de SV más cercano y su estado se ve EN UNA TARJETA
//     FLOTANTE sobre el propio mapa (buscando / sin cobertura / previa
//     interactiva) — issue #592 punto 3, nunca hace falta cambiar de paso para
//     saber si hay cobertura. El CTA fijo "Continuar" solo se habilita con
//     cobertura confirmada.
//  2. LAS REGLAS — el mapa y la previa se ocultan (ya cumplieron su función);
//     solo quedan plazo/tiempo por jugada + nota de privacidad + "Lanzar". Ya
//     NO existe "Cambiar sitio" como concepto (issue #592 punto 3): la única
//     forma de volver es el atrás de la cabecera (o del navegador), que
//     conserva pin y panorama.
// Atrás COHERENTE (issue #592 punto 4): en el paso 2 vuelve al paso 1
// (conservando todo); en el paso 1 sale del flujo. El paso 2 empuja su propia
// entrada de historial al entrar, así que el atrás DEL NAVEGADOR también
// retrocede un paso en vez de saltárselo y salir del flujo entero.
// Transición direccional entre pasos (mismo patrón que #531/#539).
export function CreateLocationChallenge({
  groupId,
  groupName,
  onBack,
  onCreated,
  initialState,
}: Props) {
  const [step, setStep] = useState<Step>(initialState?.step ?? 'sitio')
  // Dirección del cambio de paso: avanzar entra desde la derecha, volver desde
  // la izquierda — mismo criterio que #531/#539.
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward')
  // Punto elegido por el usuario en el mapa (pin).
  const [pickedPoint, setPickedPoint] = useState<LatLng | null>(initialState?.point ?? null)
  // flyTo: coordenadas a las que debe volar el mapa (GPS o nada).
  const [flyTo, setFlyTo] = useState<LatLng | null>(null)

  // Estado de la búsqueda de panorama.
  const [panoState, setPanoState] = useState<PanoState>(() => {
    if (!initialState) return { kind: 'idle' }
    return initialState.pano === 'none'
      ? { kind: 'no_coverage', at: initialState.point }
      : { kind: 'ready', pano: initialState.pano }
  })
  // POV capturado de la previa (encuadre inicial para los jugadores).
  const [pov, setPov] = useState({ heading: 0, pitch: 0 })

  const [gpsState, setGpsState] = useState<GpsState>('idle')

  const [deadlineIndex, setDeadlineIndex] = useState(DEFAULT_DEADLINE_INDEX)
  const [guessIndex, setGuessIndex] = useState(DEFAULT_GUESS_INDEX)
  // La velocidad puntúa (issue #628): ON por defecto. Solo tiene sentido con
  // límite por jugada (el toggle se OCULTA en 'Libre'), pero conservamos el
  // valor aunque se oculte — al volver a un límite, reaparece con lo elegido.
  const [timeScoring, setTimeScoring] = useState(DEFAULT_TIME_SCORING)

  // Foto opcional del reto (issue #595): puro extra sobre el Street View, que ya
  // es la pista principal. NO se lee su EXIF (el sitio ya lo fija el mapa del
  // paso 1) — solo se comprime y se le estripa el EXIF al subir, misma tubería
  // que el resto de flujos (lib/storage).
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [created, setCreated] = useState<ChallengeForPlay | null>(null)
  const [celebrating, setCelebrating] = useState(false)

  const toast = useToast()
  const { user } = useSession()
  // Id incremental para cancelar búsquedas de panorama en vuelo.
  const searchIdRef = useRef(0)
  // Si NOSOTROS empujamos la entrada de historial del paso 2 (issue #592
  // punto 4): distingue "hay que retroceder de verdad" (dispara popstate, que
  // hace el resto) de "llegamos a 'previa' sin pasar por aquí" (galería/tests
  // vía `initialState.step`), donde no hay nada que deshacer en el historial.
  const pushedHistoryRef = useRef(false)

  // Botón "Usar mi ubicación": vuela el mapa a tu posición GPS actual. Es la
  // ÚNICA vía de GPS del flujo (issue #592 punto 1): nunca se pide sola al
  // montar, solo cuando el usuario pulsa este botón.
  function useGpsLocation() {
    if (!navigator.geolocation) {
      toast.show('Tu navegador no permite geolocalización.', { tone: 'danger' })
      return
    }
    setGpsState('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p: LatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setGpsState('done')
        setFlyTo(p)
      },
      () => {
        setGpsState('error')
        toast.show('No se pudo obtener tu ubicación.', { tone: 'danger' })
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    )
  }

  // Al elegir un punto en el mapa: buscamos el panorama de SV más cercano. Su
  // resultado alimenta la tarjeta flotante del paso 1 (issue #592 punto 3).
  const handlePick = useCallback(async (point: LatLng) => {
    setPickedPoint(point)
    const myId = ++searchIdRef.current
    setPanoState({ kind: 'searching', at: point })

    const match = await findPanorama(point.lat, point.lng, PANO_SEARCH_RADIUS)
    // Si llegó otra búsqueda mientras esperábamos, ignoramos este resultado.
    if (searchIdRef.current !== myId) return

    if (!match) {
      setPanoState({ kind: 'no_coverage', at: point })
    } else {
      setPanoState({ kind: 'ready', pano: match })
    }
  }, [])

  // Limpia el object URL de la foto al desmontar o al cambiarla (no fugar memoria).
  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview)
    }
  }, [photoPreview])

  function pickPhoto(file: File | null) {
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return file ? URL.createObjectURL(file) : null
    })
    setPhotoFile(file)
  }

  const hasPano = panoState.kind === 'ready'

  // Paso 1 → 2: solo alcanzable con cobertura confirmada (el CTA "Continuar"
  // ya lo garantiza al estar deshabilitado sin ella). Empuja una entrada de
  // historial PROPIA: sin ella, el atrás del navegador saltaría este paso
  // entero y saldría del flujo (issue #592 punto 4).
  function continueToRules() {
    if (!hasPano) return
    window.history.pushState({ createLocationStep: 'previa' }, '')
    pushedHistoryRef.current = true
    setDirection('forward')
    setStep('previa')
  }

  // Paso 2 → 1 (flecha "Atrás" de la cabecera): si empujamos la entrada de
  // historial al entrar, retrocedemos DE VERDAD (dispara `popstate`, que hace
  // el resto vía el efecto de abajo) para que la cabecera y el botón atrás del
  // navegador queden sincronizados. Si no la empujamos (arrancamos ya en
  // 'previa' vía `initialState`, solo galería/tests), no hay nada que deshacer.
  function backToSitio() {
    if (pushedHistoryRef.current) {
      window.history.back()
    } else {
      setDirection('backward')
      setStep('sitio')
    }
  }

  // Atrás DEL NAVEGADOR en el paso 2: deshace la entrada que empujó
  // `continueToRules` y nos devuelve al paso 1 conservando pin y panorama, en
  // vez de saltárselo y salir del flujo entero (issue #592 punto 4).
  useEffect(() => {
    function onPopState() {
      if (step === 'previa') {
        pushedHistoryRef.current = false
        setDirection('backward')
        setStep('sitio')
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [step])

  async function save() {
    if (!user) {
      toast.show('Inicia sesión para crear un reto.', { tone: 'danger' })
      return
    }
    if (panoState.kind !== 'ready') {
      toast.show('Elige un punto en el mapa con cobertura de Street View.', { tone: 'danger' })
      return
    }

    const pano = panoState.pano
    setBusy(true)
    try {
      let imagePath: string | undefined
      if (photoFile) {
        // Foto opcional: se sube comprimida y sin EXIF (misma tubería que el
        // resto de flujos de crear, lib/storage). Si falla, el catch de fuera
        // aborta el lanzamiento entero con un mensaje genérico — es la misma
        // política que CreateNumberChallenge/CreateChallengeImmersive.
        setStatus('Subiendo la foto…')
        imagePath = await uploadImage(photoFile)
      }

      setStatus('Lanzando el reto…')
      const title = groupName ? `¿Dónde estamos? · ${groupName}` : '¿Dónde estamos?'
      const { challenge } = await createChallenge({
        title,
        lat: pano.lat,
        lng: pano.lng,
        createdBy: user.id,
        groupId,
        svPanoId: pano.panoId,
        svHeading: pov.heading,
        svPitch: pov.pitch,
        deadlineAt: deadlineFromMinutes(DEADLINE_OPTIONS[deadlineIndex].minutes),
        guessSeconds: GUESS_OPTIONS[guessIndex].value,
        // La velocidad puntúa (issue #628): inerte sin límite ('Libre'), así que
        // se manda tal cual sin condicionar aquí (submit_vote ya lo filtra).
        timeScoring,
        imagePath,
        // Decisión issue #595: sin toggle nuevo, se mantiene el comportamiento
        // MÁS SIMPLE ya existente en el resto de flujos de crear (default de
        // `createChallenge`, CreateChallengeImmersive, CreateNumberChallenge) —
        // con foto, se enseña como PISTA junto al Street View, nunca sorpresa.
        // `PlayChallenge` ya sabe pintarla así (hintPhotoUrl) sin cambios ahí.
        photoIsHint: true,
        // Ciudad como escala default (el GeoGuessr de la calle pide precisión de zona).
        scoreScale: 'ciudad',
      })
      setStatus(null)
      track('challenge_created', {
        group_id: groupId,
        challenge_id: challenge.id,
        has_photo: Boolean(imagePath),
        has_streetview: true,
        guess_seconds: GUESS_OPTIONS[guessIndex].value,
        time_scoring: timeScoring,
        photo_is_hint: imagePath ? true : null,
        duration_hours: DEADLINE_OPTIONS[deadlineIndex].minutes / 60,
        difficulty: 'streetview',
        score_scale: 'ciudad',
        location_source: 'map_pick',
      })
      setCelebrating(true)
      window.setTimeout(() => {
        setCelebrating(false)
        setCreated(challenge)
      }, 1400)
    } catch (err) {
      reportError(err, { area: 'create_location_challenge' })
      const msg = describeError(err)
      setStatus(null)
      const networkish = /failed to fetch|networkerror|load failed/i.test(msg)
      toast.show(
        networkish
          ? 'Sin conexión. Prueba con datos o WiFi y reinténtalo.'
          : `No se pudo lanzar el reto: ${msg}`,
        { tone: 'danger' },
      )
      setBusy(false)
    }
  }

  const isSearching = panoState.kind === 'searching'
  const noCoverage = panoState.kind === 'no_coverage'
  const canLaunch = hasPano && !busy
  const isGpsLocating = gpsState === 'locating'

  // Clase de dirección del paso (mismo patrón que #531/#539): solo el
  // CONTENIDO del paso activo anima; header/celebración/hoja de compartir
  // quedan fijos entre pasos.
  const stepClass = `${styles.step} ${direction === 'backward' ? styles.stepBack : ''}`.trim()

  return (
    <div className={styles.root}>
      {/* Cabecera: atrás (sale en el paso 1, vuelve al paso 1 en el paso 2) +
          título + botón GPS secundario (solo en el paso 1, donde hay mapa que
          centrar y solo se dispara al pulsarlo — issue #592 punto 1).
          `dense` en el paso 1 (issue #705): el mapa es el protagonista a
          sangre y pelea por el alto — atrás+título en una fila, hilo corto.
          El paso 2 (las reglas) es un formulario normal → `plain`. */}
      <AppHeader
        variant={step === 'sitio' ? 'dense' : 'plain'}
        lead="back"
        onLead={step === 'previa' ? backToSitio : onBack}
        leadLabel="Atrás"
        kicker={groupName ?? undefined}
        title="¿Dónde estamos?"
        action={
          step === 'sitio' ? (
            <button
              type="button"
              className={styles.gpsBtn}
              aria-label="Usar mi ubicación"
              title="Centrar el mapa en mi posición"
              onClick={useGpsLocation}
              disabled={isGpsLocating}
            >
              {isGpsLocating ? <Spinner size={18} /> : <IconGps size={20} />}
            </button>
          ) : undefined
        }
      />

      {/* ── PASO 1 — EL SITIO: mapa a pantalla completa + tarjeta SV inline ── */}
      {step === 'sitio' && (
        <div className={stepClass}>
          <div className={styles.mapArea}>
            <MapPicker
              value={pickedPoint}
              flyTo={flyTo}
              center={DEFAULT_CENTER}
              zoom={DEFAULT_ZOOM}
              onPick={(p) => void handlePick(p)}
              searchPlacement="overlay"
            />
            {/* Hint inicial: solo cuando no hay punto elegido. */}
            {!pickedPoint && (
              <div className={styles.mapHint} aria-live="polite">
                <IconPin size={15} />
                Toca el mapa para elegir el sitio
              </div>
            )}

            {/* Tarjeta flotante de Street View (issue #592 punto 3): se
                actualiza sola al mover el pin, SIN cambiar de paso. */}
            {pickedPoint && (
              <div className={styles.svCard}>
                {isSearching && (
                  <div className={styles.svCardState} role="status">
                    <Spinner size={18} />
                    <span>Buscando Street View…</span>
                  </div>
                )}
                {noCoverage && (
                  <div className={styles.svCardNoCoverage} role="alert">
                    <IconPin size={18} />
                    <p>Sin Street View aquí — mueve el pin.</p>
                  </div>
                )}
                {hasPano && panoState.kind === 'ready' && (
                  <div className={styles.svCardPreview}>
                    <StreetViewPreview
                      panoId={panoState.pano.panoId}
                      heading={pov.heading}
                      pitch={pov.pitch}
                      onPovChange={setPov}
                    />
                    {/* Chip de privacidad sobre la previa. */}
                    <div className={styles.privacyChip} aria-hidden>
                      <IconCandado size={11} />
                      Tu sitio queda oculto
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* CTA fijo (footer en el flujo flex, NO absoluto — no tapa el
              mapa ni la tarjeta SV): solo aparece al haber pin, y solo se
              habilita con cobertura confirmada (issue #592 punto 3). */}
          {pickedPoint && (
            <div className={styles.footer}>
              <button
                type="button"
                className={styles.launchBtn}
                onClick={continueToRules}
                disabled={!hasPano}
                aria-label={
                  hasPano
                    ? 'Continuar a las reglas del reto'
                    : 'Elige un punto con cobertura de Street View para continuar'
                }
              >
                <ArrowRight size={17} strokeWidth={2} aria-hidden />
                Continuar
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── PASO 2 — LAS REGLAS: sin mapa ni previa, ya cumplieron su función ── */}
      {step === 'previa' && (
        <div className={stepClass}>
          <div className={styles.previaBody}>
            <div className={styles.rules}>
              <div className={styles.ruleRow}>
                <label className={styles.ruleLabel}>
                  Foto <span className={styles.optional}>opcional</span>
                </label>
                <PhotoDropzone
                  preview={photoPreview}
                  onPick={pickPhoto}
                  onClear={() => pickPhoto(null)}
                  label="Añadir foto (opcional)"
                />
              </div>
              <div className={styles.ruleRow}>
                <label className={styles.ruleLabel}>Plazo</label>
                <SegmentedControl
                  label="Plazo para jugar"
                  options={DEADLINE_OPTIONS.map((opt, i) => ({
                    value: String(i),
                    label: opt.label,
                  }))}
                  value={String(deadlineIndex)}
                  onChange={(v) => setDeadlineIndex(Number(v))}
                />
              </div>
              <div className={styles.ruleRow}>
                <label className={styles.ruleLabel}>Tiempo por jugada</label>
                <SegmentedControl
                  label="Tiempo por jugada"
                  options={GUESS_OPTIONS.map((opt, i) => ({
                    value: String(i),
                    label: opt.label,
                  }))}
                  value={String(guessIndex)}
                  onChange={(v) => setGuessIndex(Number(v))}
                />
              </div>
              {/* La velocidad puntúa (issue #628): ON por defecto, SOLO visible
                  con límite por jugada — sin límite ('Libre') no hay nada que
                  medir, así que el toggle no aporta nada y se oculta. */}
              {GUESS_OPTIONS[guessIndex].value != null && (
                <div className={styles.ruleRow}>
                  <div className={styles.toggleRow}>
                    <label className={styles.ruleLabel} htmlFor="time-scoring-toggle">
                      La velocidad puntúa
                    </label>
                    <button
                      type="button"
                      id="time-scoring-toggle"
                      role="switch"
                      aria-checked={timeScoring}
                      className={`${styles.toggle} ${timeScoring ? styles.toggleOn : ''}`}
                      onClick={() => setTimeScoring((v) => !v)}
                    >
                      <span className={styles.toggleThumb} />
                    </button>
                  </div>
                  <span className={styles.toggleHint}>
                    Responder rápido suma puntos; tarde, resta.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* CTA fijo (footer en el flujo flex): estado + nota de privacidad + lanzar. */}
          <div className={styles.footer}>
            {status && (
              <div className={styles.statusRow}>
                <Spinner size={15} />
                <span>{status}</span>
              </div>
            )}
            <div className={styles.privacy}>
              <IconCandado size={14} aria-hidden />
              <span>Tu posición en el mapa queda oculta hasta que todos jueguen.</span>
            </div>
            <button
              type="button"
              className={styles.launchBtn}
              disabled={!canLaunch}
              onClick={() => void save()}
              aria-label="Este es mi sitio: lanzar el reto al grupo"
            >
              {busy ? <Spinner size={18} /> : <RocketIcon />}
              Lanzar el reto
            </button>
          </div>
        </div>
      )}

      {/* Microcelebración al lanzar. */}
      {celebrating && (
        <div className={styles.celebrate} role="status">
          <div className={styles.celebrateCard}>
            <span className={styles.burst}>
              <CheckIcon />
            </span>
            <h3 className={styles.celebrateH}>¡Reto lanzado!</h3>
            <p className={styles.celebrateSub}>Tu grupo ya puede intentar adivinarlo.</p>
          </div>
        </div>
      )}

      {/* Hoja de compartir tras crear el reto. */}
      {created && (
        <ChallengeCreatedShare
          groupId={groupId}
          groupName={groupName}
          challengeId={created.id}
          challengeTitle={created.title}
          imagePath={created.image_path}
          onPlay={() => onCreated(created)}
        />
      )}
    </div>
  )
}

// --- Iconos puntuales ---

function RocketIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden>
      <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
