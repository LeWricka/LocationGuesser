import { useRef, useState, type CSSProperties, type RefObject } from 'react'
import { Compass as CompassIcon, Expand, House, Maximize2 } from 'lucide-react'
import { PlayMap } from './PlayMap'
import { StreetViewPano, type StreetViewPanoHandle } from './StreetViewPano'
import { SceneImage } from './SceneImage'
import type { LatLng } from '../../lib/geo'
import { AppHeader } from '../../ui/AppHeader'
import { Button, CountdownRing, Icon, Lightbox, Modal, Stack, useReducedMotion } from '../../ui'
import { IconDiana } from '../../ui/icons'
import styles from './PlayChallenge.module.css'

// Retiene un elemento montado el tiempo de SU fundido de salida al pasar
// `active` a `false`, en vez de desmontarlo de golpe (issue #606): el mini-mapa
// esquina↔expandido desaparecía uno mientras el otro aparecía de la nada, un
// corte seco. El desmontaje real lo dispara `onExitAnimationEnd` (llamar en el
// `onAnimationEnd` del propio nodo) cuando termina su keyframe de salida; así el
// saliente se CRUZA con la entrada de lo que ocupa su sitio, sin alargar nada
// (`active` cambia al instante, solo se retrasa el desmontaje visual). Bajo
// reduced-motion no hay keyframe que termine, así que desmontamos directo.
function useExitPresence(active: boolean, reducedMotion: boolean) {
  const [mounted, setMounted] = useState(active)
  // Ajustamos el estado DURANTE el render (patrón admitido por React, sin
  // efecto: evita el "cascading renders" que dispara el lint de hooks) para que
  // ambos casos se reflejen en el MISMO render que cambia `active`, sin el frame
  // de retraso que tendría un `useEffect`:
  // - activarse: si esperásemos a un efecto, el elemento que entra se quedaría
  //   un frame sin montar mientras el saliente ya muestra su fundido de salida
  //   — justo el corte que este hook evita.
  // - reduced-motion al desactivarse: no hay keyframe que dispare
  //   `onExitAnimationEnd`, así que desmontamos ya, sin fundido que cruzar.
  if (active && !mounted) setMounted(true)
  else if (!active && reducedMotion && mounted) setMounted(false)
  const exiting = mounted && !active
  return {
    mounted,
    exiting,
    onExitAnimationEnd: () => {
      if (exiting) setMounted(false)
    },
  }
}

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

  // --- Mini-mapa de adivinar (GeoGuessr: esquina → expandido) ---
  guess: LatLng | null
  onGuess: (p: LatLng) => void
  /** Mini-mapa expandido (para clavar el tiro) vs. colapsado (esquina). */
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
  /**
   * Alto VISIBLE real en px (de `useVisualViewport`). Fija el contenedor inmersivo
   * a ese alto en vez de a `100vh`, que colapsa cuando aparece el teclado del sistema
   * o la barra del navegador móvil. `null`/omitido → fallback CSS a `100dvh`.
   */
  viewportHeight?: number | null
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
  viewportHeight,
}: Props) {
  const hasStreetView = scene.kind === 'streetview'
  const imageUrl = scene.kind === 'photo' ? scene.photoUrl : null
  const hintPhotoUrl = scene.kind === 'streetview' ? scene.hintPhotoUrl : null
  const urgent = remaining != null && remaining <= 10
  // Cruce esquina↔expandido del mini-mapa (issue #606): ver `useExitPresence`.
  const reducedMotion = useReducedMotion()
  const collapsed = useExitPresence(!mapOpen, reducedMotion)
  // Última cámara del mapa expandido (centro + zoom): el mapa se DESMONTA al
  // volver al panorama y, sin esto, cada reapertura nacía en la vista mundo —
  // el jugador perdía el zoom que había afinado (feedback del dueño jugando).
  // Ref (no estado): cambia en cada arrastre y no debe repintar nada.
  const lastCameraRef = useRef<{ center: LatLng; zoom: number } | null>(null)
  const expanded = useExitPresence(sceneReady && mapOpen, reducedMotion)
  // Modelo de viewport: el contenedor se ata al alto VISIBLE real (px) cuando lo
  // conocemos; si no, el CSS cae a `100dvh`. Evita que el chrome/teclado colapse
  // el layout y empuje la escena fuera de pantalla.
  const immersiveStyle =
    viewportHeight != null ? ({ '--play-vh': `${viewportHeight}px` } as CSSProperties) : undefined

  return (
    <div className={styles.immersive} style={immersiveStyle}>
      {/* Escena protagonista: panorama interactivo o foto (legacy). Solo cuando
          está lista; antes, placeholder neutro (nada que delate el lugar). Al pasar a
          lista (entrar en juego tras la cuenta), la escena ENTRA con un montaje suave
          (fundido + leve acercamiento) en vez de un salto seco. */}
      <div className={`${styles.sceneFull} ${sceneReady ? styles.sceneEnter : ''}`}>
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
            className={[styles.photoSceneButton, 'lg-press'].join(' ')}
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
              <Icon icon={Expand} size={16} />
              Ampliar
            </span>
          </button>
        ) : (
          <div className={styles.noScene}>
            <p className={styles.status}>Este reto no tiene imagen ni Street View.</p>
          </div>
        )}
      </div>

      {/* Cabecera flotante sobre la escena: atrás + temporizador (respeta el notch
          con safe-area; tinta clara con velo de legibilidad). */}
      <AppHeader
        variant="floating"
        className={styles.sceneHeader}
        lead="back"
        leadLabel={backLabel}
        onLead={onBack}
        action={
          remaining != null && guessSeconds != null ? (
            <CountdownRing remaining={remaining} total={guessSeconds} urgent={urgent} />
          ) : undefined
        }
      />

      {/* Foto-pista flotante (si el reto la marcó como pista). */}
      {sceneReady && hintPhotoUrl && (
        <button
          type="button"
          className={[styles.hintFloat, 'lg-press'].join(' ')}
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
            <Icon icon={House} size={20} />
          </button>
          <button
            type="button"
            className={styles.glassBtn}
            onClick={() => panoRef.current?.resetPov()}
            aria-label="Enderezar la vista al norte"
            title="Enderezar (norte)"
          >
            <Icon icon={CompassIcon} size={20} />
          </button>
        </div>
      )}

      {/* -------- Mini-mapa GeoGuessr (esquina inferior derecha) --------
          Dos estados: colapsado (thumbnail táctil) → expandido (mapa grande + CTA).
          El mapa se monta SIEMPRE para conservar zoom/posición; solo cambia el CSS.
          Sin hoja ni popup "¿Dónde es?": el juego es el Street View, no un cartel. */}

      {/* Estado COLAPSADO: thumbnail en esquina; toca para expandir. NO se guarda
          bajo `sceneReady`: el mini-mapa es el mapa de ADIVINAR (mundo entero), no la
          escena del reto, así que mostrarlo antes de Empezar no es spoiler y monta ya
          el mapa (conserva zoom/posición). Lleva etiqueta "Adivinar" visible (no solo
          icono): guía al jugador y da contenido de texto al contenedor inmersivo. */}
      {collapsed.mounted && (
        <button
          type="button"
          className={[styles.miniMapa, collapsed.exiting ? styles.miniMapaExit : '', 'lg-press']
            .filter(Boolean)
            .join(' ')}
          onClick={onOpenMap}
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget) collapsed.onExitAnimationEnd()
          }}
          aria-label="Abrir el mapa para elegir tu posición"
        >
          <div className={styles.miniMapaScene} aria-hidden="true">
            {/* SIN `fixedCenterPin` a propósito (issue #789): esta miniatura no es
                interactiva (`pointer-events: none`, el botón padre abre el mapa
                grande) así que el modo "pin de centro fijo" no aporta nada — su
                icono decorativo se veía SIEMPRE igual, con o sin tiro puesto. En
                modo clásico se dibuja el pin de verdad en su coordenada real, y
                `centerOn` mantiene la vista sobre él (sin esto podría caer fuera
                de los 128px): la miniatura ENSEÑA que ya apuntaste (y dónde), no
                solo lo dice el rótulo. */}
            <PlayMap
              guess={guess}
              answer={null}
              locked={false}
              onPick={onGuess}
              meAvatar={meAvatar}
              meUserId={meUserId}
              preset="jugar"
              centerOn={guess}
            />
          </div>
          {/* Etiqueta con diana: indica "toca para apuntar". */}
          <span className={styles.miniMapaLabel}>
            <IconDiana size={14} />
            {guess ? 'Ajustar posición' : 'Adivinar'}
          </span>
        </button>
      )}

      {/* Estado EXPANDIDO: el mapa DOMINA la pantalla (issue #789 — antes se
          quedaba corto y no invitaba al ida-y-vuelta explorar↔posicionar).
          Montado como overlay absoluto que deja SOLO la cabecera (con el
          contador) visible arriba; el resto es lienzo de mapa. Debajo, DOS
          acciones de primera clase, igual de visibles: volver a explorar
          (el pin se queda puesto, se puede reajustar) y confirmar el tiro.
          Antes "volver" era un icono suelto en la esquina del mapa — un
          gesto escondido, no una acción obvia. */}
      {expanded.mounted && (
        <div
          className={[styles.mapaExpandido, expanded.exiting ? styles.mapaExpandidoExit : '']
            .filter(Boolean)
            .join(' ')}
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget) expanded.onExitAnimationEnd()
          }}
        >
          <div className={styles.mapaExpandidoScene}>
            <PlayMap
              guess={guess}
              answer={null}
              locked={false}
              onPick={onGuess}
              meAvatar={meAvatar}
              meUserId={meUserId}
              preset="jugar"
              fixedCenterPin
              // Reapertura: se restaura la cámara del viaje anterior (zoom
              // incluido). Primera vez con pin ya puesto (p.ej. borrador
              // retomado): se arranca sobre el pin a zoom de ciudad.
              initialCamera={
                lastCameraRef.current ?? (guess ? { center: guess, zoom: 6 } : undefined)
              }
              onCameraChange={(camera) => {
                lastCameraRef.current = camera
              }}
            />
            {/* Diana central: pin fijo de GeoGuessr. */}
            <span className={styles.dianaFija} aria-hidden="true">
              <IconDiana size={30} />
            </span>
          </div>
          <div className={styles.mapaExpandidoActions}>
            <Button variant="secondary" size="lg" fullWidth onClick={onCloseMap}>
              Volver {hasStreetView ? 'al panorama' : 'a la foto'}
            </Button>
            <Button size="lg" fullWidth disabled={!guess || confirmDisabled} onClick={onConfirm}>
              <span className={styles.btnIcon}>
                <IconDiana size={18} />
                Confirmar posición
              </span>
            </Button>
          </div>
        </div>
      )}

      {/* Visor a pantalla completa de la foto del reto. */}
      {(imageUrl || hintPhotoUrl) && (
        <Lightbox
          open={photoExpanded}
          src={imageUrl ?? hintPhotoUrl ?? ''}
          alt={title}
          onClose={onClosePhoto}
          // El tiempo SIEMPRE visible (regla del dueño): también mirando la foto
          // ampliada con el reloj corriendo.
          cornerSlot={
            remaining != null && guessSeconds != null ? (
              <CountdownRing remaining={remaining} total={guessSeconds} urgent={urgent} />
            ) : undefined
          }
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
