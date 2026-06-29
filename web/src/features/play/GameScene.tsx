import { type RefObject } from 'react'
import { ArrowLeft, Check, Compass, House, MapPin, Maximize2, X } from 'lucide-react'
import { PlayMap } from './PlayMap'
import { StreetViewPano, type StreetViewPanoHandle } from './StreetViewPano'
import { SceneImage } from './SceneImage'
import type { LatLng } from '../../lib/geo'
import { BackHomeButton, Button, CountdownRing, Icon, Lightbox, Modal, Row, Stack } from '../../ui'
import styles from './PlayChallenge.module.css'

// Escena de Street View del reto (lo que de verdad se monta a pantalla completa).
interface StreetViewScene {
  kind: 'streetview'
  panoId: string | null
  /** Posición de fallback si no hay panoId (la respuesta real, solo conocida en juego). */
  position: LatLng
  heading: number | null
  pitch: number | null
  lockMove?: boolean
  lockRotate?: boolean
  /** Foto-pista opcional que acompaña al panorama (URL firmada / object URL). */
  hintPhotoUrl: string | null
}

// Escena de foto del reto (sin Street View): la foto ES la escena.
interface PhotoScene {
  kind: 'photo'
  photoUrl: string | null
}

export type GameSceneData = StreetViewScene | PhotoScene

interface Props {
  /** Título del reto (alt de la foto, etiqueta del visor). */
  title: string
  /** Qué se muestra: panorama interactivo o foto. */
  scene: GameSceneData
  /** ¿La escena real ya está montada? En `false` se muestra un placeholder neutro
   * (no-spoiler antes de Empezar). En la previa siempre es `true`. */
  sceneReady: boolean

  // --- Cuenta atrás (opcional) ---
  /** Segundos restantes; null = sin reloj activo. */
  remaining: number | null
  /** Segundos totales por jugada; null = sin límite (no se pinta el anillo). */
  guessSeconds: number | null

  // --- Salida ---
  /** Texto del botón de salir. */
  backLabel: string
  onBack: () => void

  // --- Mapa de adivinar (mini-mapa expansible) ---
  guess: LatLng | null
  onGuess: (p: LatLng) => void
  mapOpen: boolean
  onOpenMap: () => void
  onCloseMap: () => void
  /** Avatar/identidad del jugador para el pin propio. En la previa van vacíos. */
  meAvatar?: string | null
  meUserId: string
  /** Confirmar el pin y revelar. En la previa está deshabilitado. */
  onConfirm: () => void
  /** Deshabilita confirmar el voto (modo previa: no se vota). */
  confirmDisabled?: boolean

  // --- Foto a pantalla completa (visor) ---
  photoExpanded: boolean
  onExpandPhoto: () => void
  onClosePhoto: () => void

  // --- Controles del panorama (solo Street View) ---
  panoRef?: RefObject<StreetViewPanoHandle | null>

  /** Overlay "Empezar" (solo en juego real, fase idle). En la previa no se pasa. */
  startOverlay?: {
    open: boolean
    onStart: () => void
    onClose: () => void
    body: React.ReactNode
  }
}

// Escena de JUGAR a pantalla completa, extraída de PlayChallenge para reutilizarla
// en la PREVIA de crear (issue #234): el creador ve EXACTAMENTE lo que verán los
// jugadores. Es 100% presentacional; toda la lógica (votar, reloj, anti-trampa)
// vive en el padre. En modo previa el padre deshabilita confirmar y no monta el
// overlay de Empezar, así el flujo real de votar no se toca.
//
// Patrón de adivinar (GeoGuessr / Street View): un MINI-MAPA persistente vive en la
// esquina inferior derecha (siempre visible, sin solaparse con nada). Al tocarlo se
// EXPANDE a una hoja casi a pantalla completa para colocar el pin con precisión y
// confirmar. La MISMA instancia de mapa se conserva entre los dos estados (un solo
// `PlayMap` montado): así no se pierde el zoom/posición ni se paga doble el coste
// de Google Maps; solo cambia el contenedor (mini ↔ expandido).
export function GameScene({
  title,
  scene,
  sceneReady,
  remaining,
  guessSeconds,
  backLabel,
  onBack,
  guess,
  onGuess,
  mapOpen,
  onOpenMap,
  onCloseMap,
  meAvatar,
  meUserId,
  onConfirm,
  confirmDisabled,
  photoExpanded,
  onExpandPhoto,
  onClosePhoto,
  panoRef,
  startOverlay,
}: Props) {
  const hasStreetView = scene.kind === 'streetview'
  const imageUrl = scene.kind === 'photo' ? scene.photoUrl : null
  const hintPhotoUrl = scene.kind === 'streetview' ? scene.hintPhotoUrl : null
  const urgent = remaining != null && remaining <= 10

  return (
    <div className={styles.immersive}>
      {/* Escena protagonista: panorama interactivo o foto (legacy). Solo cuando
          está lista; antes, placeholder neutro (nada que delate el lugar). */}
      <div className={styles.sceneFull}>
        {!sceneReady ? (
          <div className={styles.scenePlaceholder} aria-hidden="true" />
        ) : scene.kind === 'streetview' ? (
          <StreetViewPano
            ref={panoRef}
            panoId={scene.panoId}
            position={scene.position}
            heading={scene.heading}
            pitch={scene.pitch}
            lockMove={scene.lockMove}
            lockRotate={scene.lockRotate}
          />
        ) : imageUrl ? (
          <button
            type="button"
            className={styles.photoSceneButton}
            onClick={onExpandPhoto}
            aria-label="Ampliar la foto del reto"
          >
            <SceneImage
              key={imageUrl}
              src={imageUrl}
              alt={title}
              className={styles.photoFull}
              skeletonRadius="sm"
            />
            <span className={styles.photoExpandHint} aria-hidden="true">
              <Icon icon={Maximize2} size={15} />
              Ampliar
            </span>
          </button>
        ) : (
          <div className={styles.noScene}>
            <p className={styles.status}>Este reto no tiene imagen ni Street View.</p>
          </div>
        )}
      </div>

      {/* Clúster arriba-izquierda: salida + temporizador, flotando sobre la
          escena (respeta el notch con safe-area). */}
      <div className={styles.topCluster}>
        <BackHomeButton onClick={onBack} label={backLabel} />
        {remaining != null && guessSeconds != null && (
          <CountdownRing remaining={remaining} total={guessSeconds} urgent={urgent} />
        )}
      </div>

      {/* Foto-pista flotante (si el reto la marcó como pista). */}
      {sceneReady && hintPhotoUrl && (
        <button
          type="button"
          className={styles.hintFloat}
          onClick={onExpandPhoto}
          aria-label="Ampliar la foto del reto"
        >
          <SceneImage
            key={hintPhotoUrl}
            src={hintPhotoUrl}
            alt="Pista: foto del reto"
            className={styles.hintImg}
            skeletonRadius="md"
          />
          <span className={styles.hintExpand} aria-hidden="true">
            <Icon icon={Maximize2} size={13} />
          </span>
        </button>
      )}

      {/* Abajo-izquierda: controles del panorama (solo con Street View montado). */}
      {sceneReady && hasStreetView && panoRef && (
        <div className={styles.panoControls}>
          <button
            type="button"
            className={styles.glassBtn}
            onClick={() => panoRef.current?.resetToStart()}
            aria-label="Volver a la posición inicial"
            title="Volver a la posición inicial"
          >
            <Icon icon={House} size={20} />
          </button>
          <button
            type="button"
            className={styles.glassBtn}
            onClick={() => panoRef.current?.resetPov()}
            aria-label="Enderezar la vista al norte"
            title="Enderezar (norte)"
          >
            <Icon icon={Compass} size={20} />
          </button>
        </div>
      )}

      {/* Velo tras la hoja expandida (oscurece la escena, capta el toque para
          cerrar). Solo cuenta cuando el mapa está expandido. */}
      <div
        className={`${styles.sheetScrim} ${mapOpen ? styles.sheetScrimOpen : ''}`}
        onClick={onCloseMap}
        aria-hidden={!mapOpen}
      />

      {/* MINI-MAPA EXPANSIBLE (patrón GeoGuessr): un único contenedor con UNA sola
          instancia de PlayMap que se MORFEA entre dos estados — mini (esquina) y
          expandido (hoja). El mapa permanece montado siempre, así conserva el zoom
          y la posición al expandir/cerrar y no se paga doble el coste de Google. */}
      <div className={`${styles.mapShell} ${mapOpen ? styles.mapShellOpen : styles.mapShellMini}`}>
        {/* Cabecera del mapa expandido: título + cerrar. Solo visible al expandir. */}
        {mapOpen && (
          <div className={styles.sheetHeader}>
            <span className={styles.sheetTitle}>
              <Icon icon={MapPin} size={18} />
              ¿Dónde es?
            </span>
            <button
              type="button"
              className={styles.sheetClose}
              onClick={onCloseMap}
              aria-label="Cerrar el mapa"
            >
              <Icon icon={X} size={20} />
            </button>
          </div>
        )}

        <div className={styles.mapCanvas}>
          <PlayMap
            guess={guess}
            answer={null}
            locked={false}
            onPick={onGuess}
            meAvatar={meAvatar}
            meUserId={meUserId}
            // Mini = teaser (sin gestos ni zoom); expandido = interacción real. El
            // prop reactivo cambia las opciones del mapa sin remontarlo.
            preview={!mapOpen}
          />
          {/* En mini, una capa de toque sobre el mapa lo EXPANDE (un solo gesto,
              cero ambigüedad sobre dónde se adivina). El mapa en `preview` no
              captura clics, así que este botón recibe el toque limpio. */}
          {!mapOpen && (
            <button
              type="button"
              className={styles.miniTap}
              onClick={onOpenMap}
              aria-label="Abrir el mapa para adivinar"
            >
              <span className={styles.miniHint}>
                <Icon icon={MapPin} size={15} />
                {guess ? 'Ajustar pin' : 'Adivinar'}
              </span>
              {guess && <span className={styles.miniDot} aria-hidden="true" />}
            </button>
          )}
        </div>

        {/* Pie del mapa expandido: estado del pin + confirmar / volver. */}
        {mapOpen && (
          <div className={styles.sheetFooter}>
            {guess ? (
              <Row gap={2} align="center">
                <span className={styles.pinChip}>
                  <Icon icon={MapPin} size={14} />
                  Tu pin
                </span>
                <span className={styles.coords}>
                  {guess.lat.toFixed(4)}, {guess.lng.toFixed(4)}
                </span>
              </Row>
            ) : (
              <span className={styles.status}>Toca el mapa para colocar tu pin.</span>
            )}
            <Button size="lg" fullWidth disabled={!guess || confirmDisabled} onClick={onConfirm}>
              <span className={styles.btnInner}>
                <Icon icon={Check} size={18} />
                Confirmar y revelar
              </span>
            </Button>
            <Button variant="secondary" fullWidth onClick={onCloseMap}>
              <span className={styles.btnInner}>
                <Icon icon={ArrowLeft} size={18} />
                Volver a {hasStreetView ? 'Street View' : 'la imagen'}
              </span>
            </Button>
          </div>
        )}
      </div>

      {/* Visor a pantalla completa de la foto del reto. */}
      {(imageUrl || hintPhotoUrl) && (
        <Lightbox
          open={photoExpanded}
          src={imageUrl ?? hintPhotoUrl ?? ''}
          alt={title}
          onClose={onClosePhoto}
        />
      )}

      {/* Overlay "Empezar" (solo en juego real). En la previa no se pasa. */}
      {startOverlay && (
        <Modal
          open={startOverlay.open}
          onClose={startOverlay.onClose}
          title="¿Listo para jugar?"
          footer={
            <Button size="lg" fullWidth onClick={startOverlay.onStart}>
              Empezar
            </Button>
          }
        >
          <div className={styles.startBody}>
            <Stack gap={3} align="center">
              {startOverlay.body}
            </Stack>
          </div>
        </Modal>
      )}
    </div>
  )
}
