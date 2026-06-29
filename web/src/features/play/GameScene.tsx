import { type RefObject } from 'react'
import { Check, Compass, Home, Maximize2, MapPin, MapPinned, X } from 'lucide-react'
import { PlayMap } from './PlayMap'
import { StreetViewPano, type StreetViewPanoHandle } from './StreetViewPano'
import { SceneImage } from './SceneImage'
import type { LatLng } from '../../lib/geo'
import {
  Badge,
  BackHomeButton,
  Button,
  CountdownRing,
  Icon,
  Lightbox,
  Modal,
  Row,
  Stack,
} from '../../ui'
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

  // --- Mapa de adivinar (hoja inferior) ---
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
              <Icon icon={Maximize2} size={15} /> Ampliar
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
            <Icon icon={Maximize2} size={14} />
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
            <Icon icon={Home} size={20} />
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

      {/* Barra de acción inferior: una sola pieza ancha y legible que abre el mapa
          para adivinar. Sustituye al FAB redondo (cuyo icono se solapaba con su
          etiqueta): aquí la etiqueta vive DENTRO del botón, así nunca se corta. El
          texto cambia según haya o no pin, y un check confirma cuando ya hay uno. */}
      {sceneReady && (
        <div className={styles.actionBar}>
          <button
            type="button"
            className={`${styles.guessAction} ${guess ? styles.guessActionPlaced : ''}`}
            onClick={onOpenMap}
            aria-label={guess ? 'Cambiar tu pin en el mapa' : 'Abrir el mapa para adivinar'}
          >
            <span className={styles.guessActionIcon} aria-hidden="true">
              <Icon icon={guess ? MapPinned : MapPin} size={22} />
            </span>
            <span className={styles.guessActionLabel}>
              {guess ? 'Tu pin está puesto' : 'Adivinar en el mapa'}
            </span>
            {guess && (
              <span className={styles.guessActionBadge} aria-hidden="true">
                <Icon icon={Check} size={16} strokeWidth={3} />
              </span>
            )}
          </button>
        </div>
      )}

      {/* Hoja inferior con el mapa de adivinar. El mapa se mantiene SIEMPRE montado
          (solo se traslada fuera de pantalla al cerrar) para conservar zoom/posición. */}
      <div
        className={`${styles.sheetScrim} ${mapOpen ? styles.sheetScrimOpen : ''}`}
        onClick={onCloseMap}
        aria-hidden={!mapOpen}
      />
      <section
        className={`${styles.sheet} ${mapOpen ? styles.sheetOpen : ''}`}
        role="dialog"
        aria-label="Mapa para adivinar"
        aria-hidden={!mapOpen}
      >
        <div className={styles.sheetHandle} aria-hidden="true" />
        <button
          type="button"
          className={styles.sheetClose}
          onClick={onCloseMap}
          aria-label="Cerrar el mapa"
        >
          <Icon icon={X} size={20} />
        </button>
        <div className={styles.sheetMap}>
          <PlayMap
            guess={guess}
            answer={null}
            locked={false}
            onPick={onGuess}
            meAvatar={meAvatar}
            meUserId={meUserId}
          />
        </div>
        <div className={styles.sheetFooter}>
          {guess ? (
            <Row gap={2} align="center">
              <Badge tone="accent">
                <span className={styles.badgeIcon} aria-hidden="true">
                  <Icon icon={MapPin} size={13} strokeWidth={2.5} />
                </span>
                Tu pin
              </Badge>
              <span className={styles.coords}>
                {guess.lat.toFixed(4)}, {guess.lng.toFixed(4)}
              </span>
            </Row>
          ) : (
            <span className={styles.status}>Toca el mapa para colocar tu pin.</span>
          )}
          <Button size="lg" fullWidth disabled={!guess || confirmDisabled} onClick={onConfirm}>
            <span className={styles.btnIcon} aria-hidden="true">
              <Icon icon={Check} size={18} strokeWidth={2.5} />
            </span>
            Confirmar y revelar
          </Button>
          <Button variant="secondary" fullWidth onClick={onCloseMap}>
            Volver a {hasStreetView ? 'Street View' : 'la imagen'}
          </Button>
        </div>
      </section>

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
