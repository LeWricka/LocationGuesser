/// <reference types="google.maps" />
import { useEffect, useState } from 'react'
import { Map, Marker, Polyline, useMap } from '@vis.gl/react-google-maps'
import { MapPin } from 'lucide-react'
import type { LatLng } from '../../lib/geo'
import { avatarPinFromProfile, PIN_ANCHOR, PIN_SIZE } from '../../lib/avatarPin'
import type { MapPreset } from '../../lib/mapPresets'
import { Icon, MapSkeleton } from '../../ui'
import styles from './PlayMap.module.css'

// Vista inicial: el MUNDO entero. Empezando alejado, el
// jugador va de lejos a cerca directo sin tener que alejar primero.
const WORLD: google.maps.LatLngLiteral = { lat: 25, lng: 0 }
const WORLD_ZOOM = 2

// El pin de la respuesta es el icono `Target` de lucide (mismo set que el resto
// de la app, sin el "tell" de prototipo del emoji). Usamos el Marker clásico (no
// AdvancedMarker) a propósito: NO requiere `mapId`, así no hace falta crear nada
// en Google Cloud. El glifo va como `icon.url` (data-URI SVG), igual que el pin
// del propio jugador (avatarPin): así heredan el mismo enfoque y conservan la
// animación DROP nativa del Marker.
const ANSWER_PIN_SIZE = 34

// Target de lucide como data-URI SVG. El color sale del token `--accent` en
// runtime (Google necesita un literal; no hardcodeamos el color en el repo).
//
// Halo blanco por debajo (issue #602): el revelado pasa a satélite siempre, y
// un trazo fino de acento se funde con tonos oscuros de la tesela (mar,
// bosque). Se dibuja el mismo trío de aros dos veces — blanco y más grueso
// debajo, color de acento encima — para que se lea sobre cualquier fondo.
function answerPinUri(color: string): string {
  const rings =
    '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ANSWER_PIN_SIZE}" height="${ANSWER_PIN_SIZE}" ` +
    'viewBox="0 0 24 24" fill="none">' +
    `<g stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">${rings}</g>` + // design-lint-allow: halo del pin en SVG data-URI, no puede leer var(--)
    `<g stroke="${color}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">${rings}</g>` +
    '</svg>'
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

const respectsMotion = () =>
  typeof window !== 'undefined' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Acento Pizarra de los tokens (no hardcodear color): Google Maps necesita un
// string literal para el trazo, así que leemos `--accent` del :root en runtime.
function accentColor(): string {
  if (typeof window === 'undefined') return '#34506b'
  const value = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  return value || '#34506b'
}

interface Props {
  /** Pin del jugador; null hasta que toca el mapa. */
  guess: LatLng | null
  /** Ubicación real; solo se pasa tras revelar (entonces se dibuja 🎯 + línea). */
  answer: LatLng | null
  /** Bloquea el clic tras revelar: el voto ya no se puede mover. */
  locked: boolean
  onPick: (p: LatLng) => void
  /** Avatar del jugador (`profiles.avatar_url`) para la burbuja de su pin. */
  meAvatar?: string | null
  /** Id del jugador: ancla el avatar por defecto cuando no hay avatar elegido. */
  meUserId: string
  /**
   * HISTÓRICO — desde el toggle Satélite/Mapa propio de PlayMap (issue #602) ya
   * no decide la capa por sí solo:
   *  - Revelado (`locked`): SIEMPRE satélite (decisión del dueño — separar
   *    guess/reveal en dos estilos de mapa es artificial si comparten
   *    componente, así que "aplica a ambos"). El prop se mantiene en la
   *    interfaz solo por compatibilidad con los llamantes existentes
   *    (`GameScene`/`PlayChallenge`, fuera del área de este cambio); ya no se lee.
   *  - Interactivo (adivinando, `!locked`): la capa la elige el jugador con el
   *    toggle propio de este componente (por defecto satélite, persistido en
   *    `LAYER_KEY`), independientemente de lo que llegue aquí.
   */
  preset?: MapPreset
  /**
   * Pin de CENTRO FIJO (estilo GeoGuessr de una mano): en vez de tocar el mapa, el
   * pin se queda clavado en el centro de la pantalla y el jugador MUEVE el mapa
   * bajo él; al asentarse el arrastre, el voto = centro del mapa. Más preciso a una
   * mano en móvil. Opt-in; sin esto, el comportamiento clásico (tocar para marcar).
   */
  fixedCenterPin?: boolean
  /**
   * Mantiene la vista CENTRADA en esta coordenada mientras cambie (issue #789).
   * Para lienzos no interactivos que deben ENSEÑAR un punto — el thumbnail
   * colapsado de "Adivinar" (GameScene) centra aquí el pin provisional: si el
   * jugador ya apuntó, la miniatura lo muestra (el pin podría caer fuera de sus
   * 128px si la vista se quedara donde estaba). No usar en mapas interactivos:
   * pelearía con el arrastre del jugador.
   */
  centerOn?: LatLng | null
}

// Capa base del mapa interactivo (issue #602): satélite por defecto, coherente
// con el Street View del propio reto; callejero como alternativa vía toggle.
type BaseLayer = 'satellite' | 'street'

const LAYER_LABELS: Record<BaseLayer, string> = {
  satellite: 'Satélite',
  street: 'Mapa',
}

// Misma clave que el toggle de `features/create/MapPicker.tsx` (constante NO
// exportada allí): aunque el motor de mapas es distinto (Google aquí, Leaflet +
// Esri en MapPicker), "¿satélite o callejero?" es la MISMA preferencia del
// jugador, y compartir la clave la hace viajar entre crear y jugar. Duplicada
// aquí a propósito — extraerla a un módulo común obligaría a tocar MapPicker,
// fuera del área de este cambio (issue #602).
const LAYER_KEY = 'lg.mapLayer'

// Satélite por defecto (decisión del dueño, #602). Solo se respeta lo guardado
// si el jugador ya eligió explícitamente "Mapa"; cualquier otro valor (o
// ausencia) cae a satélite.
function readStoredLayer(): BaseLayer {
  const v = localStorage.getItem(LAYER_KEY)
  return v === 'street' ? 'street' : 'satellite'
}

// mapTypeId de Google para cada capa: 'satellite' → hybrid (foto aérea +
// etiquetas, como el antiguo preset 'diario'); 'street' → roadmap (callejero
// etiquetado, como el antiguo preset 'jugar').
function mapTypeForLayer(layer: BaseLayer): string {
  return layer === 'satellite' ? 'hybrid' : 'roadmap'
}

// Pastilla Satélite/Mapa (issue #602): mismo patrón visual que el toggle de
// MapPicker (capa activa = acento sólido + anillo blanco), con las clases y el
// chrome propios de la escena de juego (`--chrome-*`, ver `.glassBtn` en
// PlayChallenge.module.css) en vez del chrome de MapPicker (`--map-chrome-*`)
// — visualmente equivalentes, solo cambia el token de origen para no acoplar
// este componente al CSS module de otra feature.
function LayerToggle({ layer, onChoose }: { layer: BaseLayer; onChoose: (l: BaseLayer) => void }) {
  return (
    <div className={styles.layerToggle} role="group" aria-label="Estilo de mapa">
      {(Object.keys(LAYER_LABELS) as BaseLayer[]).map((key) => (
        <button
          key={key}
          type="button"
          className={key === layer ? styles.layerBtnActive : styles.layerBtn}
          aria-pressed={key === layer}
          onClick={() => onChoose(key)}
        >
          {LAYER_LABELS[key]}
        </button>
      ))}
    </div>
  )
}

/**
 * Modo PIN DE CENTRO FIJO: el pin no se mueve; el jugador arrastra el mapa y el voto
 * es el centro al asentarse el gesto. Escuchamos `idle` (Google lo dispara cuando el
 * mapa deja de moverse) y reportamos el centro. No-op si está bloqueado (tras revelar).
 */
function CenterPinTracker({ locked, onPick }: { locked: boolean; onPick: (p: LatLng) => void }) {
  const map = useMap()
  useEffect(() => {
    if (!map || locked) return
    const listener = map.addListener('idle', () => {
      const c = map.getCenter()
      if (c) onPick({ lat: c.lat(), lng: c.lng() })
    })
    return () => listener.remove()
  }, [map, locked, onPick])
  return null
}

// Sigue a `centerOn` (issue #789): re-centra la vista cada vez que cambia la
// coordenada. Sin animación (setCenter, no panTo): el thumbnail que lo usa vive
// bajo `pointer-events: none` y el salto ocurre tapado por el mapa expandido,
// así que animarlo solo gastaría frames (y panTo ignora reduced-motion).
function CenterOn({ position }: { position: LatLng }) {
  const map = useMap()
  useEffect(() => {
    if (!map) return
    map.setCenter(position)
  }, [map, position])
  return null
}

// Icono del pin de la RESPUESTA (lucide Target): centrado en la coordenada exacta
// del objetivo. El color sale de `--accent` en runtime.
function answerIcon(): google.maps.Icon {
  return {
    url: answerPinUri(accentColor()),
    scaledSize: new google.maps.Size(ANSWER_PIN_SIZE, ANSWER_PIN_SIZE),
    anchor: new google.maps.Point(ANSWER_PIN_SIZE / 2, ANSWER_PIN_SIZE / 2),
  }
}

// Icono del pin del PROPIO jugador: la burbuja de su avatar (teardrop con su
// emoji sobre su fondo) servida como data-URI SVG en `icon.url`. Anclado por la
// punta a la coordenada exacta, igual que el resto de marcadores clásicos.
function guessIcon(avatar: string | null | undefined, userId: string): google.maps.Icon {
  return {
    url: avatarPinFromProfile(avatar ?? null, userId),
    scaledSize: new google.maps.Size(PIN_SIZE.width, PIN_SIZE.height),
    anchor: new google.maps.Point(PIN_ANCHOR.x, PIN_ANCHOR.y),
  }
}

// Al revelar, encuadra ambos puntos (tu pin + 🎯) con margen para que se vean
// los dos con el zoom adecuado. fitBounds es el equivalente directo del
// FitToReveal/fitBounds de Leaflet. El bloque de resultado entra con animación
// (transform): si encuadramos mientras anima, Google mide mal el contenedor y un
// pin queda fuera. Encuadramos tras un frame y otra vez al asentarse el layout,
// para que SIEMPRE entren ambos puntos sin cortarse.
function FitToReveal({ guess, answer }: { guess: LatLng; answer: LatLng }) {
  const map = useMap()
  useEffect(() => {
    if (!map) return
    const fit = () => {
      const bounds = new google.maps.LatLngBounds()
      bounds.extend(guess)
      bounds.extend(answer)
      // Padding generoso (px por lado) para que el glifo del pin nunca quede
      // pegado al borde y se corte. maxZoom evita acercar de más si los dos
      // puntos están casi encima (quedaría un zoom absurdo de calle).
      map.fitBounds(bounds, { top: 56, right: 56, bottom: 56, left: 56 })
      if ((map.getZoom() ?? 0) > 12) map.setZoom(12)
    }
    const raf = requestAnimationFrame(fit)
    const settle = setTimeout(fit, 520)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(settle)
    }
  }, [map, guess, answer])
  return null
}

// Línea pin → 🎯 que se "dibuja" al revelar. Google Polyline no expone el path
// SVG como Leaflet, así que recreamos la animación interpolando el extremo final
// del trazo de `guess` hacia `answer` con la Web Animations timing (rAF): el path
// crece de un punto a la recta completa. Bajo reduced-motion aparece ya completa.
function DrawnLine({ guess, answer }: { guess: LatLng; answer: LatLng }) {
  const animate = respectsMotion()
  // Reduced-motion: la recta completa de entrada (sin animar). Animando: arranca
  // como un punto en `guess` y el efecto la hace crecer hacia `answer`.
  const [path, setPath] = useState<google.maps.LatLngLiteral[]>(() =>
    animate ? [guess] : [guess, answer],
  )

  useEffect(() => {
    if (!animate) return
    const duration = 600
    const delay = 120
    const start = performance.now() + delay
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration))
      // Mismo easing que la animación Leaflet anterior (cubic-bezier suave-out).
      const eased = 1 - Math.pow(1 - t, 3)
      const end: google.maps.LatLngLiteral = {
        lat: guess.lat + (answer.lat - guess.lat) * eased,
        lng: guess.lng + (answer.lng - guess.lng) * eased,
      }
      setPath([guess, end])
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [animate, guess, answer])

  return (
    <>
      {/* Halo blanco (issue #602): igual razón que el pin de la respuesta — con el
          revelado siempre en satélite, una traza blanca más ancha por debajo
          separa la línea de acento del terreno (se pierde sobre agua/bosque
          sin esto). Mismo `path` animado que la línea de encima. */}
      <Polyline
        path={path}
        strokeColor="#ffffff" // design-lint-allow: la API de Google Maps exige color literal
        strokeWeight={6}
        strokeOpacity={0.9}
        clickable={false}
      />
      <Polyline
        path={path}
        strokeColor={accentColor()}
        strokeWeight={3}
        strokeOpacity={1}
        clickable={false}
      />
    </>
  )
}

// Pin de la respuesta (🎯) que "cae" con muelle al revelar, equivalente al
// lg-pin-drop de antes. Usamos la animación DROP nativa del Marker clásico, que
// no requiere mapId. Se aplica solo en el primer montaje (y si el sistema no
// pide reduce-motion); después se quita para que recolocar no rebote de nuevo.
function AnswerMarker({ answer }: { answer: LatLng }) {
  const [animation, setAnimation] = useState<google.maps.Animation | null>(
    respectsMotion() ? google.maps.Animation.DROP : null,
  )
  useEffect(() => {
    if (!animation) return
    const t = setTimeout(() => setAnimation(null), 800)
    return () => clearTimeout(t)
  }, [animation])
  return <Marker position={answer} icon={answerIcon()} clickable={false} animation={animation} />
}

export function PlayMap({
  guess,
  answer,
  locked,
  onPick,
  meAvatar,
  meUserId,
  // `preset` ya no decide la capa (ver el JSDoc del prop en `Props`): se
  // mantiene en la firma solo por compatibilidad con los llamantes existentes
  // (`GameScene`/`PlayChallenge`, fuera del área de este cambio), que siguen
  // pasándolo sin que este componente lo lea.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- ver comentario arriba
  preset: _preset = 'jugar',
  fixedCenterPin = false,
  centerOn = null,
}: Props) {
  // En modo pin de centro fijo no se ve el pin-avatar (lo sustituye el pin clavado
  // al centro de la pantalla); tampoco se marca tocando, sino moviendo el mapa.
  const centerPinMode = fixedCenterPin && !answer

  // Capa base (issue #602): revelado (`locked`) siempre satélite — decisión del
  // dueño de aplicarla a ambos, ver JSDoc de `preset`. Adivinando, el jugador
  // decide con el toggle propio (`LayerToggle`, más abajo), que arranca de la
  // preferencia guardada (satélite por defecto).
  const [layer, setLayer] = useState<BaseLayer>(() => (locked ? 'satellite' : readStoredLayer()))

  function chooseLayer(next: BaseLayer) {
    setLayer(next)
    localStorage.setItem(LAYER_KEY, next)
  }

  // Estado de carga: mientras el SDK de Google no ha pintado sus teselas, el lienzo
  // se ve oscuro ("parece roto"). Tapamos el hueco con `MapSkeleton` hasta el primer
  // `onTilesLoaded` (teselas visibles cargadas); luego se funde y se desmonta.
  const [mapReady, setMapReady] = useState(false)
  const [skeletonGone, setSkeletonGone] = useState(false)

  return (
    <div className={styles.wrap}>
      <Map
        className="lg-map"
        defaultCenter={WORLD}
        defaultZoom={WORLD_ZOOM}
        minZoom={2}
        // `onTilesLoaded` = teselas visibles cargadas → ocultar el skeleton.
        onTilesLoaded={() => setMapReady(true)}
        // Un dedo mueve el mapa en móvil (sin el banner "usa dos dedos"), igual que
        // el worldCopyJump/arrastre fluido de antes.
        gestureHandling="greedy"
        // Tipo de mapa según la CAPA (issue #602): 'satellite' → satélite con
        // etiquetas (hybrid); 'street' → callejero etiquetado tipo GeoGuessr
        // (roadmap). Sin mapId: Marker clásico, no AdvancedMarker. Forzamos
        // esquema claro (no seguir el modo oscuro del SO).
        mapTypeId={mapTypeForLayer(layer)}
        colorScheme="LIGHT"
        disableDefaultUI
        zoomControl
        clickableIcons={false}
        // Colocar/mover el pin tocando el mapa, salvo en modo centro fijo (donde el
        // voto es el centro del mapa) o tras bloquear (revelado).
        onClick={(e) => {
          if (locked || centerPinMode) return
          const latLng = e.detail.latLng
          if (latLng) onPick({ lat: latLng.lat, lng: latLng.lng })
        }}
      >
        {/* En modo clásico, el pin-avatar clavado donde tocaste. En modo centro fijo
            no se dibuja (lo sustituye el pin estático del overlay). */}
        {guess && !centerPinMode && (
          <Marker position={guess} icon={guessIcon(meAvatar, meUserId)} clickable={false} />
        )}
        {answer && <AnswerMarker answer={answer} />}
        {guess && answer && <DrawnLine guess={guess} answer={answer} />}
        {guess && answer && <FitToReveal guess={guess} answer={answer} />}
        {centerPinMode && <CenterPinTracker locked={locked} onPick={onPick} />}
        {centerOn && <CenterOn position={centerOn} />}
      </Map>

      {/* Estado de carga: tapa el lienzo hasta que Google pinta sus teselas
          (`onTilesLoaded`); luego se funde y se desmonta. Evita el "parece roto". */}
      {!skeletonGone && (
        <MapSkeleton hidden={mapReady} onFadeOutEnd={() => setSkeletonGone(true)} />
      )}

      {/* Toggle Satélite/Mapa (issue #602): solo en modo interactivo (adivinando);
          el mapa bloqueado (revelado) no lo necesita, su capa es siempre satélite
          (ver JSDoc de `preset`). Arriba-IZQUIERDA, NO arriba-derecha como en
          MapPicker: se mantiene el lado histórico para no mover un control ya
          aprendido; las acciones de "volver"/"clavar tiro" del mapa expandido de
          "Adivinar" (GameScene, issue #789) viven fuera de este componente, en
          una fila debajo del mapa, así que ya no compiten por ninguna esquina.
          Se esconde con `@container` en el thumbnail colapsado (128px, PlayMap
          dentro de `.miniMapaScene`): ahí no cabe ni hace falta, y ese contenedor
          ya es `pointer-events: none` (solo abre el mapa al tocar). */}
      {!locked && <LayerToggle layer={layer} onChoose={chooseLayer} />}

      {/* Pin de CENTRO FIJO: clavado en el centro de la pantalla mientras el jugador
          mueve el mapa debajo. Decorativo (pointer-events:none) para no robar el
          arrastre al mapa; el voto lo calcula `CenterPinTracker` con el centro. */}
      {centerPinMode && (
        <div className={styles.centerPin} aria-hidden="true">
          <Icon icon={MapPin} size={36} />
        </div>
      )}
    </div>
  )
}
