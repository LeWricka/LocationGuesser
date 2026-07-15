import { useCallback, useEffect, useRef, useState } from 'react'
import { Info } from 'lucide-react'
// Tipos SOLO (import type → cero coste en bundle). El runtime de maplibre entra por
// import() dinámico dentro del efecto, para que quede en su propio chunk WebGL.
import type { Map as MapLibreMap, Marker as MapLibreMarker, StyleSpecification } from 'maplibre-gl'
import { MAP_PRESETS, SCENE_GLOBE } from '../lib/mapPresets'
import { hasWebGL } from '../lib/webglSupport'
import { Icon } from './Icon'
import { buildHomePinElement } from '../features/trip/pinMarkers'
import '../features/trip/tripPins.css'
import styles from './HomeGlobe.module.css'

/** Un pin-foto del globo de la home: una coordenada con miniatura y a qué viaje abre. */
export interface GlobePin {
  /** Clave estable del pin. */
  id: string
  lat: number
  lng: number
  /** Texto accesible del pin (título del momento o del viaje). */
  title: string
  /** Miniatura del pin, o null (cae a un marcador de ubicación genérico). */
  imageUrl: string | null
  /** Id del destino al tocar el pin (el viaje que abre). */
  targetId: string
  /** Marca el pin "lead" del grupo (anillo cálido pulsante). */
  lead?: boolean
  /**
   * Marca el pin del reto "Te toca jugar" SIN JUGAR (issue #776): anillos de sónar
   * expandiéndose (la metáfora de "adivina dónde"). El reto en sí no tiene
   * coordenada propia (sería spoiler, ver useWorldTrips) — HomePage lo traduce al
   * punto MÁS RECIENTE del viaje al que pertenece (mismo criterio que `lead`).
   */
  pending?: boolean
}

/** Ruta dorada de un viaje del globo (issue #702): los puntos VISIBLES de ese
 * viaje, en orden cronológico ASC (los cose `useWorldTrips`), formato `[lng, lat]`
 * (el que espera MapLibre). Con menos de 2 puntos no dibuja nada (ver `repaint`). */
export interface GlobeRoute {
  /** Id del destino (viaje) al que pertenece esta ruta; casa con `GlobePin.targetId`
   * y con `activeTargetId` para decidir si es la protagonista (oro pleno) o no
   * (oro tenue). */
  targetId: string
  points: [number, number][]
}

interface Props {
  /** Pines-foto a clavar en el globo. */
  pins: GlobePin[]
  /** Rutas doradas por viaje (issue #702): una polyline por viaje con ≥2 puntos
   * visibles. La del viaje `activeTargetId` se pinta en oro pleno; el resto, tenue. */
  routes?: GlobeRoute[]
  /** Tocar un pin → abre su destino (un viaje). */
  onOpenPin?: (targetId: string) => void
  /**
   * Encuadre del globo:
   *  - `'pins'` (por defecto): encuadra los pines (fitBounds), capado a zoom bajo para no
   *    aplanar la proyección. Para la home logueada con viajes reales.
   *  - `'world'`: vista MUNDO fija, sin fit. Para la landing, donde los pines son
   *    DECORATIVOS: garantiza el globo héroe esférico pase lo que pase con los pines.
   */
  framing?: 'pins' | 'world'
  /**
   * La hoja está extendida (cubre casi todo el globo): relajamos el render WebGL
   * (pausamos el repaint continuo) para no malgastar batería con el globo tapado.
   */
  relaxed?: boolean
  /**
   * Id del destino "activo" ahora mismo (p.ej. el viaje enfocado en la hoja, pieza 2
   * de la home inmersiva — issue #567). Al cambiar a un valor con pines cuyo
   * `targetId` coincida, el globo ENCUADRA el recorrido de ese viaje —fit de todos
   * sus pines; con uno solo, vuelo suave a él (#700)— y aplica en EXCLUSIVA el
   * estado "lead" (anillo dorado + escala, el mismo estilo que ya existe para
   * `pin.lead`) a su pin más reciente, retirándoselo a cualquier otro —incluido uno
   * que lo llevara por dato—. También manda sobre el ENCUADRE POR DEFECTO: al cargar
   * o cambiar los pines, el fit es el recorrido de este viaje (no el centroide de
   * todos). `null`/`undefined` (o un id sin pin correspondiente) es un NO-OP: deja
   * intacto el framing/deriva y el "lead" que ya hubiera (por dato o por un vuelo
   * anterior), y el encuadre cae a todos los pines.
   */
  activeTargetId?: string | null
  /**
   * Alto en px del chrome flotante INFERIOR de `HomeDashboard` (chip "Te toca jugar" +
   * cabecera "Tus viajes" + filtros + carrusel de tarjetas — el "dock") que tapa la
   * parte de abajo del lienzo del globo (issue #693: el fit centraba los pines contra
   * el LIENZO COMPLETO, y caían justo detrás del dock — invisibles). `HomeDashboard` lo
   * mide con `ResizeObserver` y lo pasa aquí; `0` (por defecto) es el comportamiento de
   * siempre, correcto para `framing="world"` (la landing decorativa, sin dock ni fit).
   */
  bottomObscuredPx?: number
  /**
   * Alto en px de lienzo EXTRA por ENCIMA del viewport (issue #702): HomeDashboard
   * estira `.globeLayer` hacia arriba (−2·lift) para subir la esfera en pantalla
   * — a zoom bajo se dibuja centrada en su lienzo y la cámara no puede moverla —
   * y la cámara compensa esa franja invisible igual que hace con el dock.
   */
  topObscuredPx?: number
  className?: string
}

const { base: SATELLITE, labels: LABELS } = MAP_PRESETS.diario

// Crédito de los tiles (mismas cadenas del preset, decodificando la entidad &copy; a "©"
// porque lo pintamos como TEXTO plano en nuestro propio popover, no como HTML). Cumple la
// atribución de Esri sin depender del control de MapLibre (que en prod dejaba una banda).
const MAP_CREDIT = [SATELLITE.attribution, LABELS?.attribution]
  .filter(Boolean)
  .join(' · ')
  .replace(/&copy;/g, '©')

// Vista inicial del globo: mundo entero centrado en la franja poblada del norte. El
// globo es interactivo (gira/zoom); este es solo el encuadre de arranque.
const WORLD_CENTER: [number, number] = [10, 25]
const WORLD_ZOOM = 1.6
const MIN_ZOOM = 0.8
// Tope DURO de zoom del globo. La proyección globo de MapLibre solo se "ve" esférica a
// zoom bajo; al pasar de ~3 se aplana en un mapa 2D (el bug que reportó el dueño en la
// deslogueada, donde los pines demo agrupados en Iberia/Italia forzaban un fit cercano
// que aplanaba el globo). Lo capamos en el PROPIO mapa (`maxZoom`), así NINGÚN camino
// —fit, easeTo, gesto del usuario o pines reales agrupados— puede aplanar la esfera.
const GLOBE_MAX_ZOOM = 2.4
// Techo al encuadrar varios pines: por debajo del tope duro, para que el fit deje aire y
// no toque el límite donde la curvatura se desvanece.
const FIT_MAX_ZOOM = 2.2
// Un solo pin: acercamos algo más, pero sin perder la curvatura del globo.
const SINGLE_ZOOM = 2.2
// Duración de los movimientos de cámara (fit del recorrido y vuelos, `Map#easeTo`/
// `fitBounds`) — el sistema `--motion` no tiene un token propio para "viaje de
// cámara" (su techo, `--duration-slower`, son 480ms, pensados para transiciones de
// UI, no para un giro de globo); 700ms es DELIBERADAMENTE más lento. MapLibre pide
// la curva como función `(t) => t'` de progreso temporal, no como cadena
// `cubic-bezier()`, así que no podemos reenchufar literalmente
// `--motion-ease-emphasized`; dejamos el easing por defecto (una curva ease-out
// equivalente en sensación, arranca rápido y frena suave) en vez de reimplementar
// un evaluador de Bézier solo para esto.
// OJO ("perf(cargas): entrada sin saltos"): esta duración es SOLO para cambios
// PROVOCADOS por el usuario DESPUÉS del arranque (tocar una tarjeta → cambia
// `activeTargetId`, crece el dock…). El encuadre INICIAL es siempre instantáneo
// (`duration: 0`) y ocurre con el lienzo aún OCULTO — la escena nunca se mueve
// sola nada más entrar (ver `revealedRef`/`frameRoute`).
const CAMERA_DURATION_MS = 700
// Red de seguridad del REVELADO del lienzo: si el primer `idle` de MapLibre nunca
// llega (teselas que fallan en bucle, o un motor que no lo emite), el globo no
// puede quedarse invisible para siempre (opacity 0). Pasado este margen revelamos
// igual — mismo criterio que MAP_READY_FALLBACK_MS en TripMapGlobe (#500).
const REVEAL_FALLBACK_MS = 4000
// Alto/ancho aproximado del pin de la home (disco + puntita + aro "lead") en px. El
// marcador se ancla por la PUNTA (base) y el disco crece HACIA ARRIBA, así que el fit
// necesita reservar ~este alto por ENCIMA de cada coordenada para que ningún disco quede
// cortado por el canto del lienzo o tapado por el chrome flotante. El aro "lead" y su
// pulso de bienvenida sobresalen un poco más: redondeamos al alza.
const PIN_HEIGHT = 56
const PIN_HALF_WIDTH = 28
// Anillos de sónar del pin "Te toca jugar" (issue #776): 2 ondas, desfasadas a
// mitad de su propio ciclo (ver `lg-home-sonar` en HomeGlobe.module.css) para que
// se lea como una onda continua emanando del disco, no dos anillos sincronizados.
const SONAR_RING_COUNT = 2
const SONAR_CYCLE_S = 2.5
// Padding SUPERIOR/lateral del fit, ya con el TAMAÑO DEL PIN reservado (el fit encuadra
// las COORDENADAS, no las cajas de los pines; sin este colchón el disco del pin más alto
// o el de los laterales se sale del encuadre y el lienzo lo recorta). Deja aire arriba
// para la marca/el avatar flotantes. FIJO: a diferencia del `bottom` (ver
// `computeFitPaddingY`), el chrome superior no cambia de alto con los datos del usuario.
// Componente FIJO reducido de 72 → 56 (issue #702, parte 2: "sobra margen por
// arriba"): mide EXACTAMENTE la banda superior en blanco entre el chrome (marca +
// avatar, ~64px de alto real: `--space-4` de padding arriba/abajo + el propio
// icono/avatar) y el pin más alto — la parte NO ocupada por el disco del pin
// (`PIN_HEIGHT`, que sigue intacto: reserva espacio real, no "aire" decorativo).
// Medido con Playwright contra la galería (`home-con-datos`, ver PR #702): antes
// el pin más alto arrancaba a ~130px (390×844) / ~123px (360×740) del borde
// superior del lienzo; con 56 pasa a ~122px / ~107px — dentro del objetivo
// 100–140px a ambos viewports, con margen de sobra antes de tocar el suelo de
// 100px en el viewport más bajo (360×740, el más ajustado).
const FIT_PADDING_TOP = 56 + PIN_HEIGHT
const FIT_PADDING_SIDE = 48 + PIN_HALF_WIDTH
// Aire entre el disco del pin y el canto del dock de HomeDashboard (chip "Te toca
// jugar" + cabecera "Tus viajes" + filtros + carrusel — `bottomObscuredPx`, medido por
// HomeDashboard): sin este respiro el pin tocaría el borde del dock en vez de flotar
// claramente por encima.
const GAP_ABOVE_DOCK = 16
// Banda MÍNIMA de lienzo que el fit debe dejar SIEMPRE visible para los pines (fracción
// del alto del contenedor) — el suelo que evita que un dock muy alto (viewport bajo, o
// un carrusel con tarjetas grandes) se coma el lienzo entero y deje el fit sin ningún
// hueco real donde encuadrar. Mismo espíritu que `safeFitZoom` en TripMapGlobe (#641):
// el chrome nunca puede recortar los pines por completo, solo empujarlos hasta un límite.
const MIN_VISIBLE_FRACTION = 0.22

/**
 * Padding vertical del fit (issue #693), consciente del dock REAL de HomeDashboard: el
 * `bottom` reserva el alto medido del dock (`bottomObscuredPx`) + el alto de un pin +
 * un respiro (`GAP_ABOVE_DOCK`), clampado para que la banda visible entre el chrome
 * superior y el dock nunca baje de `MIN_VISIBLE_FRACTION` del alto del contenedor —
 * sin este suelo, un dock casi tan alto como la pantalla dejaría el fit sin hueco.
 */
function computeFitPaddingY(
  containerHeight: number,
  bottomObscuredPx: number,
  topObscuredPx: number,
): { top: number; bottom: number } {
  const top = FIT_PADDING_TOP + topObscuredPx
  const desiredBottom = bottomObscuredPx + PIN_HEIGHT + GAP_ABOVE_DOCK
  const minVisible = containerHeight * MIN_VISIBLE_FRACTION
  const maxBottom = Math.max(0, containerHeight - top - minVisible)
  return { top, bottom: Math.min(Math.max(0, desiredBottom), maxBottom) }
}

/**
 * Desplazamiento vertical (px) para que `easeTo`/`jumpTo` centren la cámara en la banda
 * VISIBLE (entre el chrome superior y el dock) en vez del centro del lienzo COMPLETO —
 * se pasa como opción `offset` (MapLibre: el punto `center` pedido aparece en
 * `centro-del-lienzo + offset`, no en el centro real). Negativo = sube el pin en
 * pantalla. Reutiliza el MISMO padding que `fitBounds` (arriba) para que el vuelo al pin
 * activo (`flyToTarget`) aterrice en la misma banda que ya usa el fit de varios pines.
 */
function verticalFrameOffset(
  containerHeight: number,
  bottomObscuredPx: number,
  topObscuredPx: number,
): number {
  const { top, bottom } = computeFitPaddingY(containerHeight, bottomObscuredPx, topObscuredPx)
  // Ancla en el TERCIO ALTO de la banda visible, no en su centro (reporte del dueño,
  // 4 jul: "sigue sobrando espacio [arriba]"): con el zoom capado (GLOBE_MAX_ZOOM, la
  // esfera no puede crecer) centrar en la banda deja un cielo negro enorme entre la
  // marca y la coronilla; anclar arriba lo consume y el aire sobrante cae entre el
  // contenido y el dock, donde ya hay chrome que lo aprovecha.
  const band = Math.max(0, containerHeight - bottom - top)
  const anchor = top + band * BAND_ANCHOR_FRACTION
  return anchor - containerHeight / 2
}

// Fracción de la banda visible donde ancla el contenido encuadrado (0 = pegado al
// chrome superior, 0.5 = centro de la banda). Ver `verticalFrameOffset`.
const BAND_ANCHOR_FRACTION = 0.3

// Span MÍNIMO del encuadre (grados). Cuando todos los pines caen casi en el mismo punto
// (varios momentos de una misma ciudad: "Finde Madrid"), sus bounds son minúsculos y el
// fit intentaría un zoom muy cercano —capado a FIT_MAX_ZOOM, con los discos apilados en
// una columna ilegible—. Ensanchamos los bounds a este mínimo alrededor de su centro para
// que el encuadre deje aire y los pines cercanos se separen en vez de amontonarse.
const MIN_FIT_SPAN_DEG = 1.2

// Span MÁXIMO encuadrable (grados). Cuando el conjunto a encuadrar abarca varios
// continentes (el caso real del dueño: Japón + Maldivas + Colombia), encuadrarlo
// entero obliga a la cámara a su centroide — casi siempre océano abierto (Índico/
// Antártida) con los pines diminutos en los bordes de la esfera. El globo de la
// home es AMBIENTE, no un data-viz de cobertura: pasado este umbral manda el pin
// protagonista (ver `frameRoute`, #699) a zoom de pin único, y el resto viven
// fuera de plano — la deriva y el gesto los traen al girar la esfera.
const MAX_FIT_SPAN_LNG_DEG = 100
const MAX_FIT_SPAN_LAT_DEG = 65

// Deriva del globo en reposo (grados de longitud por segundo): lento y aspiracional,
// como una Tierra que gira sola. Tan suave que no marea ni distrae de los pines, pero da
// vida al héroe. Se desactiva con `prefers-reduced-motion` y se pausa al interactuar / con
// la hoja subida.
const SPIN_DEG_PER_SEC = 3
// Tras una interacción del usuario, espera a reanudar la deriva (deja que termine de mirar).
const SPIN_RESUME_DELAY_MS = 4000

// Estilo base mínimo: sin sprite/glyphs; los rasters se añaden tras `load`.
const BASE_STYLE: StyleSpecification = { version: 8, sources: {}, layers: [] }

// Default ESTABLE de `routes` (issue #702): un default inline `routes = []` crearía
// un array NUEVO en cada render de HomeGlobe cuando el padre no pasa la prop, y ese
// array entra en las deps del efecto que repinta (`[pins, routes, repaint,
// fitToPins]`) — dispararía un repaint de más en CUALQUIER re-render (no solo
// cuando `routes` cambia de verdad), destruyendo y recreando los Markers sin que
// sus datos hubieran cambiado. Con esta constante compartida, sin `routes` la
// referencia es SIEMPRE la misma entre renders.
const EMPTY_ROUTES: GlobeRoute[] = []

type MapLibreModule = typeof import('maplibre-gl')

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Aplica atmósfera/cielo NOCHE al globo (colores de escena tokenizados en mapPresets;
// el paint WebGL no entiende var(--token), por eso vienen de SCENE_GLOBE). Feature-detect
// estricto: si la versión de maplibre no soporta la API, se omite sin romper el globo.
function applySky(map: MapLibreMap): void {
  const withSky = map as MapLibreMap & {
    setSky?: (sky: Record<string, unknown>) => unknown
    setFog?: (fog: Record<string, unknown>) => unknown
  }
  if (typeof withSky.setSky === 'function') {
    try {
      withSky.setSky({
        'sky-color': SCENE_GLOBE.skyColor,
        'horizon-color': SCENE_GLOBE.horizonColor,
        'sky-horizon-blend': 0.6,
        'atmosphere-blend': 0.7,
      })
    } catch {
      // Versión sin soporte real: omitir.
    }
  }
  if (typeof withSky.setFog === 'function') {
    try {
      withSky.setFog({ color: SCENE_GLOBE.fogColor, 'horizon-blend': 0.2 })
    } catch {
      // No disponible: ignorar.
    }
  }
}

/**
 * Anillos de sónar del pin "Te toca jugar" sin jugar (issue #776): 2 `<span>`
 * hermanos del disco, añadidos AQUÍ (no en `pinMarkers.ts`, fuera del área de esta
 * issue) para no tocar el markup compartido con el mapa de Viaje. Viven en el
 * WRAPPER del pin (`.lg-trip-pin`, sin `overflow` propio) y no en el disco
 * (`.lg-trip-pin__disc` recorta con `overflow: hidden`, ver tripPins.css) — así
 * pueden crecer más allá del círculo sin recortarse. Cada uno arranca desfasado a
 * mitad de su propio ciclo (ver `lg-home-sonar` en HomeGlobe.module.css) para leerse
 * como una onda continua, no dos anillos sincronizados. Solo transform/opacity: cero
 * layout shift.
 */
function appendSonarRings(el: HTMLElement): void {
  for (let i = 0; i < SONAR_RING_COUNT; i++) {
    const ring = document.createElement('span')
    ring.className = 'lg-home-pin__sonar'
    ring.setAttribute('aria-hidden', 'true')
    ring.style.setProperty('--sonar-delay', `${(i * SONAR_CYCLE_S) / SONAR_RING_COUNT}s`)
    el.appendChild(ring)
  }
}

/** Ids de fuente/capa de la ruta de un viaje (issue #702), únicos por `targetId`
 * para que las constelaciones de dos viajes nunca colisionen entre sí. */
function routeIds(targetId: string): { sourceId: string; layerId: string } {
  return { sourceId: `lg-home-route-${targetId}`, layerId: `lg-home-route-line-${targetId}` }
}

/**
 * Crea o actualiza una capa `line` de MapLibre con sus coordenadas — mismo patrón
 * que `upsertLine` en `TripMapGlobe.tsx`, DUPLICADO a propósito aquí: el área
 * declarada de la issue #702 es este fichero, y extraer un módulo compartido por
 * ~15 líneas habría tocado un fichero de otra feature (`features/trip`) sin
 * necesidad — más riesgo que beneficio para el tamaño del helper.
 */
function upsertLine(
  map: MapLibreMap,
  sourceId: string,
  layerId: string,
  coords: [number, number][],
  color: string,
): void {
  const data: GeoJSON.Feature<GeoJSON.LineString> = {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: coords },
  }
  const existing = map.getSource(sourceId)
  if (existing && 'setData' in existing) {
    ;(existing as { setData: (d: typeof data) => void }).setData(data)
    return
  }
  map.addSource(sourceId, { type: 'geojson', data })
  map.addLayer({
    id: layerId,
    type: 'line',
    source: sourceId,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': color, 'line-width': 3 },
  })
}

/**
 * Globo HÉROE de la home — patrón "globo + hoja" (referencia Polarsteps). Reutiliza
 * el motor MapLibre GL con el preset `diario` (satélite Esri + etiquetas) y la proyección
 * GLOBO, los mismos pines-foto del mapa de viaje y la paleta de escena tokenizada.
 *
 * Es INTERACTIVO (gira/zoom) y sus pines-foto son TOCABLES (abren su viaje). Vive en su
 * propia zona superior: los gestos de paneo/zoom quedan aquí y la hoja, encima, lleva su
 * propio scroll (separación de gestos, no pelean). Si no hay WebGL o el mapa revienta,
 * cae a un globo evocado en CSS que mantiene el héroe visual sin romper la home.
 */
export function HomeGlobe({
  pins,
  routes = EMPTY_ROUTES,
  onOpenPin,
  framing = 'pins',
  relaxed = false,
  activeTargetId = null,
  bottomObscuredPx = 0,
  topObscuredPx = 0,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const glRef = useRef<MapLibreModule | null>(null)
  const markersRef = useRef<MapLibreMarker[]>([])
  const readyRef = useRef(false)
  const [webgl] = useState(() => hasWebGL())
  // Un fallo de carga/creación ocurre en un callback async (fuera de render): lo
  // guardamos y caemos al globo evocado (no re-lanzamos: la home no debe romperse).
  const [failed, setFailed] = useState(false)
  // Crédito de tiles (Esri): plegado a un "ⓘ"; al tocar se despliega el texto.
  const [creditOpen, setCreditOpen] = useState(false)
  // Revelado del lienzo ("perf(cargas): entrada sin saltos"): el canvas arranca a
  // opacity 0 sobre el fondo de escena (`.globe` ya pinta `--scene-bg`) y FUNDE a 1
  // en el primer `idle` del mapa — teselas del viewport listas, cámara ya encuadrada
  // (el fit inicial corre con `duration: 0` en `load`, antes de esto). Un solo paso
  // visual limpio (fondo de escena → globo listo) en vez de negro → teselas a trozos
  // → paneo de cámara. El estado pinta la clase CSS; la ref deja que los callbacks
  // del mapa (async) y `frameRoute` lean el valor al día sin recrear nada.
  const [revealed, setRevealed] = useState(false)
  const revealedRef = useRef(false)
  // Entrada escalonada de los pines: SOLO en el primer pintado tras el revelado.
  // Los repintados posteriores (llega un momento nuevo, cambian las rutas) no deben
  // reproducir la coreografía de entrada — serían pop-ins en mitad del uso.
  const entranceDoneRef = useRef(false)
  // Timer de la red de seguridad del revelado (REVEAL_FALLBACK_MS).
  const revealFallbackRef = useRef<number | null>(null)

  // Props en refs: el handler `load` (async) lee siempre el último valor sin recrear.
  const pinsRef = useRef(pins)
  // Rutas doradas por viaje (issue #702), mismo motivo que `pinsRef`.
  const routesRef = useRef(routes)
  const onOpenRef = useRef(onOpenPin)
  const framingRef = useRef(framing)
  const activeTargetIdRef = useRef(activeTargetId)
  // Issue #693: alto medido del dock de HomeDashboard, en ref por el mismo motivo que
  // el resto (el handler `load`, async, siempre debe leer el último valor).
  const bottomObscuredRef = useRef(bottomObscuredPx)
  const topObscuredRef = useRef(topObscuredPx)
  // Fuentes/capas de línea YA creadas en el mapa, por `targetId` (issue #702): permite
  // (1) recolorear una ruta existente vía `setPaintProperty` sin recrearla
  // (`applyRouteEmphasis`) y (2) detectar rutas OBSOLETAS (un viaje que perdió su
  // 2º punto, o desapareció del todo) para retirar su fuente/capa en vez de dejarla
  // huérfana pintando una geometría vieja.
  const routeLayersRef = useRef(new Map<string, { sourceId: string; layerId: string }>())
  useEffect(() => {
    pinsRef.current = pins
    routesRef.current = routes
    onOpenRef.current = onOpenPin
    framingRef.current = framing
    relaxedRef.current = relaxed
    activeTargetIdRef.current = activeTargetId
    bottomObscuredRef.current = bottomObscuredPx
    topObscuredRef.current = topObscuredPx
  })

  // Gesto del usuario (arrastre) en curso: si `activeTargetId` cambia mientras el
  // dueño está girando el globo a mano, el vuelo de cámara NO le pelea el gesto. De
  // las dos formas "simples" posibles (cancelar el vuelo, o encolarlo para lanzarlo
  // al soltar) elegimos CANCELAR: encolarlo obligaría a recordar "hay un vuelo
  // pendiente" con más estado y un timing menos predecible (¿qué pasa si cambia de
  // destino otra vez antes de soltar?); cancelar es un no-op limpio y, si el usuario
  // sigue navegando, la práxima vez que cambie `activeTargetId` sí volará. El
  // resaltado del pin ("lead") NO se cancela: es gratis (solo CSS) y no compite con
  // el paneo.
  const interactingRef = useRef(false)

  // Deriva (auto-spin) del globo en reposo: hace que el héroe se sienta VIVO. La
  // gestiona el rAF de abajo; estos refs la pausan/reanudan sin recrear el mapa.
  const spinRafRef = useRef<number | null>(null)
  // Pausada (hoja subida = `relaxed`, o el usuario interactúa): NO derivar.
  const spinPausedRef = useRef(false)
  // Marca de tiempo del último frame, para que la velocidad sea constante (grados/seg)
  // independientemente del refresco de pantalla.
  const spinLastTsRef = useRef(0)
  // Valor de `relaxed` en ref: el handler `load` (async) y el montaje lo leen sin meter
  // `relaxed` en sus deps (recrear el mapa WebGL al arrastrar la hoja sería carísimo).
  const relaxedRef = useRef(relaxed)

  // Aplica la clase "lead" (aro dorado) según `activeTargetId`, EXCLUSIVA sobre los
  // markers ya creados: idempotente y sin animación propia (a diferencia de
  // `repaint`, no toca `background-image`/DOM de cada pin, solo `classList`), así
  // que se puede llamar en cada repintado de pines sin producir el parpadeo de
  // "vacío → foto" que causaría reconstruir los elementos. Sin override activo (o
  // sin pin cuyo `targetId` coincida) es un NO-OP: deja el `lead` que trajera el
  // propio dato (`pin.lead`, ya horneado en el elemento por `buildHomePinElement`).
  // Devuelve el índice encontrado (o -1) para que `flyToTarget` decida si vuela.
  const applyActiveLead = useCallback((): number => {
    const targetId = activeTargetIdRef.current
    if (targetId == null) return -1
    // El "lead" de un viaje es su momento MÁS RECIENTE (#700): los puntos de cada
    // viaje llegan en orden cronológico ASC (HomePage), así que buscamos el ÚLTIMO
    // pin del targetId, no el primero (con un pin por viaje, como antes, da igual).
    let idx = -1
    for (let i = pinsRef.current.length - 1; i >= 0; i--) {
      if (pinsRef.current[i].targetId === targetId) {
        idx = i
        break
      }
    }
    if (idx === -1) return -1
    // Recorremos TODOS los markers (no solo "el anterior recordado"): así también
    // sustituye limpio un `lead` que viniera del propio dato, sin refs extra.
    markersRef.current.forEach((marker, i) => {
      marker.getElement().classList.toggle('lg-home-pin--lead', i === idx)
    })
    return idx
  }, [])

  // Recolorea las rutas YA creadas (issue #702) según `activeTargetId`, sin tocar su
  // geometría ni recrear fuente/capa — `map.setPaintProperty` es barato, a diferencia
  // de reconstruir un GeoJSON source cada vez que el carrusel cambia de protagonista
  // (posiblemente varias veces por segundo al deslizar). Idempotente: recorre TODAS
  // las rutas registradas (no solo "la anterior"), igual que `applyActiveLead`.
  const applyRouteEmphasis = useCallback((): void => {
    const map = mapRef.current
    if (!map || !readyRef.current || routeLayersRef.current.size === 0) return
    const css = getComputedStyle(map.getContainer())
    // Fallback SOLO si el token faltara: el paint WebGL no entiende `var(--token)`,
    // así que resolvemos a un color concreto leyendo la variable computada (mismo
    // patrón que `TripMapGlobe.repaint`, ya grandfathered en el baseline de design-lint).
    const goldColor = css.getPropertyValue('--route-gold').trim() || '#d9b25a' // design-lint-allow: fallback de paint WebGL, no admite var(--token)
    const goldSoft = css.getPropertyValue('--route-gold-soft').trim() || 'rgba(217,178,90,0.5)' // design-lint-allow: fallback de paint WebGL, no admite var(--token)
    const activeId = activeTargetIdRef.current
    for (const [targetId, ids] of routeLayersRef.current) {
      map.setPaintProperty(ids.layerId, 'line-color', targetId === activeId ? goldColor : goldSoft)
    }
  }, [])

  // Repinta los marcadores (pines-foto) desde las refs.
  const repaint = useCallback(() => {
    const map = mapRef.current
    const gl = glRef.current
    if (!map || !gl || !readyRef.current) return

    for (const m of markersRef.current) m.remove()
    markersRef.current = []

    // Coreografía de entrada ("el mapa primero, los puntos después"): SOLO en el
    // primer pintado tras el revelado del lienzo, cada pin entra con un fade+scale
    // corto escalonado (clase `lg-pin-enter` + retardo por índice, CSS en
    // tripPins.css con tokens --motion-*; el retardo base espera al fundido del
    // lienzo). reduced-motion lo anula en CSS. Los repintados posteriores montan
    // los pines quietos, como siempre.
    const entering = revealedRef.current && !entranceDoneRef.current
    if (entering) entranceDoneRef.current = true

    pinsRef.current.forEach((pin, i) => {
      const el = buildHomePinElement(pin)
      el.title = pin.title
      el.addEventListener('click', () => onOpenRef.current?.(pin.targetId))
      if (pin.pending) {
        el.classList.add('lg-home-pin--pending')
        appendSonarRings(el)
      }
      if (entering) {
        el.classList.add('lg-pin-enter')
        // Stagger capado a 10 pasos (mismo criterio que `.lg-stagger` en index.css):
        // con muchos pines, los últimos entran juntos en vez de arrastrar la cola.
        el.style.setProperty(
          '--pin-enter-delay',
          `calc(var(--motion-duration-base) + var(--motion-stagger-step) * ${Math.min(i, 10)})`,
        )
      }
      // Ancla `'bottom'` (igual que el mapa de viaje, TripMapGlobe): la PUNTA del pin se
      // clava en la coordenada y el disco crece hacia arriba. Con el ancla por defecto
      // (`'center'`) el disco quedaba centrado en la coordenada y su mitad inferior + la
      // puntita caían por debajo, de modo que un pin cerca del borde inferior del globo
      // salía CORTADO (el globo recorta su overflow); anclar por la punta lo sube dentro
      // del encuadre y hace coherente el clavado con el resto de la app.
      //
      // `opacityWhenCovered: 0` — CULLING de la cara oculta del globo (#516). MapLibre
      // reposiciona el Marker con `map.project()` para CUALQUIER lngLat, incluida la cara
      // TRASERA de la esfera: esa proyección no tiene en cuenta la curvatura (no es un
      // recorte real), así que un pin oculto puede acabar dibujado en un punto sin
      // relación con su coordenada real —el "swap" que reportó el dueño (tranvía de
      // Lisboa sobre el Sáhara, Coliseo junto a la Antártida)— o fuera del disco visible,
      // sobre la costura con la hoja. Por defecto MapLibre solo ATENÚA esos pines ocultos
      // al 20% (`opacityWhenCovered` por defecto en Marker), pensado para terreno 3D, no
      // para el globo: se seguían viendo, mal proyectados. Forzando 0 se ocultan del todo
      // en cuanto `map.transform.isLocationOccluded` los marca como traseros; al girar el
      // globo (deriva o gesto) vuelven a aparecer solos, en su sitio real, al cruzar al
      // hemisferio visible.
      markersRef.current.push(
        new gl.Marker({ element: el, anchor: 'bottom', opacityWhenCovered: 0 })
          .setLngLat([pin.lng, pin.lat])
          .addTo(map),
      )
    })
    // Reaplica el override de `activeTargetId` sobre los markers RECIÉN creados: sin
    // esto, un cambio de `pins` (nuevo momento subido, etc.) con un target ya activo
    // perdería el aro dorado hasta el siguiente cambio de `activeTargetId` (los
    // elementos nuevos solo llevan el `lead` horneado desde el propio dato).
    applyActiveLead()

    // Rutas doradas por viaje (issue #702): una polyline por viaje con ≥2 puntos
    // visibles (el diario ya solo emite puntos VISIBLES vía `useWorldTrips`, así que
    // el reto EN JUEGO nunca puede entrar aquí). Primero retira las rutas OBSOLETAS
    // (un viaje que perdió su 2º punto, o que ya no está en `routes`) para no dejar
    // fuentes/capas huérfanas pintando una geometría vieja.
    const desiredRoutes = routesRef.current.filter((r) => r.points.length >= 2)
    const desiredIds = new Set(desiredRoutes.map((r) => r.targetId))
    for (const [targetId, ids] of routeLayersRef.current) {
      if (!desiredIds.has(targetId)) {
        map.removeLayer(ids.layerId)
        map.removeSource(ids.sourceId)
        routeLayersRef.current.delete(targetId)
      }
    }
    // Jerarquía visual: tenues primero, protagonista AL FINAL — el orden de
    // creación decide el apilado en MapLibre (capas añadidas después quedan
    // ENCIMA) y las actualizaciones posteriores vía `setData` no reordenan capas
    // ya creadas, así que basta fijar el orden la primera vez que aparecen juntas.
    const activeId = activeTargetIdRef.current
    const orderedRoutes = [
      ...desiredRoutes.filter((r) => r.targetId !== activeId),
      ...desiredRoutes.filter((r) => r.targetId === activeId),
    ]
    for (const route of orderedRoutes) {
      const ids = routeIds(route.targetId)
      // Color PROVISIONAL: `applyRouteEmphasis`, dos líneas más abajo, lo sobrescribe
      // en el mismo repintado con el token resuelto — el valor de aquí nunca llega a
      // pintarse en pantalla.
      upsertLine(map, ids.sourceId, ids.layerId, route.points, '#d9b25a') // design-lint-allow: color provisional, sobrescrito por applyRouteEmphasis abajo
      routeLayersRef.current.set(route.targetId, ids)
    }
    // Color definitivo (protagonista vs tenue) de TODAS las rutas, recién creadas o
    // ya existentes: `upsertLine` de arriba pinta un color provisional al crear, y
    // `applyRouteEmphasis` es la única fuente de verdad del color real — evita
    // duplicar aquí la lógica de qué es protagonista (ya vive allí).
    applyRouteEmphasis()
  }, [applyActiveLead, applyRouteEmphasis])

  // Encuadra un RECORRIDO: un conjunto de pines (los de UN viaje, o todos como
  // fallback). Reutiliza el padding del dock (#696) y decide el gesto de cámara:
  //  - 1 pin → `easeTo` a zoom de pin único (con `offset` a la banda visible; en
  //    reduced-motion `duration: 0` — nunca `jumpTo`, su tipo no admite `offset`,
  //    ver #693 — mismo salto instantáneo pero aterriza sobre el dock).
  //  - span intercontinental → política de protagonista (#699): `easeTo` al pin
  //    `lead` del conjunto o, en su defecto, a `fallbackLead`.
  //  - resto → `fitBounds` del recorrido, con span mínimo anti-amontonamiento.
  // `fallbackLead` distingue los dos llamadores: para el recorrido de UN viaje el
  // protagonista natural es su momento más reciente ('last', puntos en orden
  // cronológico ASC); para el fallback "todos los pines" se mantiene el contrato
  // de #699 ('first').
  const frameRoute = useCallback((route: GlobePin[], fallbackLead: 'first' | 'last') => {
    const map = mapRef.current
    const gl = glRef.current
    if (!map || !gl || route.length === 0) return
    // Antes del REVELADO del lienzo, toda cámara es instantánea ("perf(cargas):
    // entrada sin saltos"): el encuadre inicial (#700) aterriza con el globo aún
    // oculto y el usuario nunca ve un paneo de 700ms nada más entrar. La animación
    // queda para cambios provocados DESPUÉS (tocar tarjeta → activeTargetId, dock).
    const duration = prefersReducedMotion() || !revealedRef.current ? 0 : CAMERA_DURATION_MS
    // Alto real del lienzo (issue #693): el fit/vuelo necesita saber cuánto reservar
    // abajo para el dock de HomeDashboard — sin el contenedor montado (aún no debería
    // pasar aquí, pero por robustez) cae a 0 y el padding/offset quedan en su mínimo.
    const containerHeight = containerRef.current?.clientHeight ?? 0
    if (route.length === 1) {
      const offsetY = verticalFrameOffset(
        containerHeight,
        bottomObscuredRef.current,
        topObscuredRef.current,
      )
      map.easeTo({
        center: [route[0].lng, route[0].lat],
        zoom: SINGLE_ZOOM,
        duration,
        offset: [0, offsetY],
      })
      return
    }
    // Extensión real de los pines del recorrido.
    let minLng = route[0].lng
    let maxLng = route[0].lng
    let minLat = route[0].lat
    let maxLat = route[0].lat
    for (const { lng, lat } of route) {
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    }
    // Recorrido intercontinental: si los pines no caben en un encuadre continental,
    // NO se encuadran todos (centroide oceánico, ver MAX_FIT_SPAN_*). Manda el
    // protagonista (#699): el pin `lead` del dato o, en su defecto, `fallbackLead` —
    // mismo tratamiento que un pin único, misma banda visible.
    if (maxLng - minLng > MAX_FIT_SPAN_LNG_DEG || maxLat - minLat > MAX_FIT_SPAN_LAT_DEG) {
      const lead =
        route.find((p) => p.lead) ?? (fallbackLead === 'first' ? route[0] : route[route.length - 1])
      const offsetY = verticalFrameOffset(
        containerHeight,
        bottomObscuredRef.current,
        topObscuredRef.current,
      )
      map.easeTo({
        center: [lead.lng, lead.lat],
        zoom: SINGLE_ZOOM,
        duration,
        offset: [0, offsetY],
      })
      return
    }
    // Ensancha los bounds hasta un span mínimo alrededor de su centro: si todos los pines
    // caen casi en el mismo punto (una sola ciudad), evita el zoom "de aguja" que los
    // apilaría en columna; con el span mínimo el fit deja aire y los pines se separan.
    const midLng = (minLng + maxLng) / 2
    const midLat = (minLat + maxLat) / 2
    const half = MIN_FIT_SPAN_DEG / 2
    if (maxLng - minLng < MIN_FIT_SPAN_DEG) {
      minLng = midLng - half
      maxLng = midLng + half
    }
    if (maxLat - minLat < MIN_FIT_SPAN_DEG) {
      minLat = midLat - half
      maxLat = midLat + half
    }
    const bounds = new gl.LngLatBounds([minLng, minLat], [maxLng, maxLat])
    const { top, bottom } = computeFitPaddingY(
      containerHeight,
      bottomObscuredRef.current,
      topObscuredRef.current,
    )
    const padding = { top, bottom, left: FIT_PADDING_SIDE, right: FIT_PADDING_SIDE }

    map.fitBounds(bounds, { padding, maxZoom: FIT_MAX_ZOOM, duration })
  }, [])

  // Encuadre por defecto (#700, "globo poblado"): el RECORRIDO del viaje activo —
  // el protagonista que HomeDashboard pasa como `activeTargetId` desde el arranque
  // (el primer viaje del carrusel) — no el centroide de todos los viajes. Los pines
  // del RESTO de viajes quedan clavados por el globo, fuera del encuadre: el
  // "mapamundi poblado", visibles al girar la esfera. Sin viaje activo (o sin pines
  // suyos) cae al comportamiento clásico: todos los pines (contrato de #699). En
  // modo `'world'` (landing decorativa) NO encuadra: vista mundo, siempre esférica.
  const fitToPins = useCallback(() => {
    if (framingRef.current === 'world') return
    const activeId = activeTargetIdRef.current
    const route = activeId != null ? pinsRef.current.filter((p) => p.targetId === activeId) : []
    if (route.length > 0) frameRoute(route, 'last')
    else frameRoute(pinsRef.current, 'first')
  }, [frameRoute])

  // Vuela al viaje de `activeTargetId` (#567→#700) y le aplica el "lead" en
  // exclusiva (vía `applyActiveLead`, que también corrige el `classList`). Desde
  // #700 el vuelo ya no es "easeTo a SU pin" sino el FIT de su recorrido entero
  // (mismos bounds+padding que el encuadre por defecto; con 1 solo pin sigue
  // siendo el easeTo de siempre — ver `frameRoute`). `null`/`undefined` o un id
  // sin pin correspondiente: NO-OP total, ni clase ni cámara — deja intacto el
  // framing/deriva y el `lead` que ya hubiera (contrato de la prop, ver `Props`).
  const flyToTarget = useCallback(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const idx = applyActiveLead()
    if (idx === -1) return
    // `framing: 'world'` (landing decorativa) NUNCA reencuadra —ver `fitToPins`
    // arriba—, así que tampoco volamos ahí: mantenemos esa invariante también para
    // `activeTargetId` (el resaltado del pin, arriba, sí se aplica igualmente: no
    // reencuadra nada). El gesto del usuario manda igual de tajante: si está
    // arrastrando el globo, cancelamos el vuelo en vez de pelearle la cámara.
    if (framingRef.current === 'world' || interactingRef.current) return
    const targetId = activeTargetIdRef.current
    frameRoute(
      pinsRef.current.filter((p) => p.targetId === targetId),
      'last',
    )
  }, [applyActiveLead, frameRoute])

  // Bucle de deriva: empuja la longitud del centro a velocidad constante (grados/seg), de
  // modo que el globo gira solo. Solo en reposo (no pausado) y sin reduced-motion. Mover el
  // CENTRO (no el bearing) mantiene el norte arriba y la esfera viva sin desorientar.
  const stopSpin = useCallback(() => {
    if (spinRafRef.current != null) {
      cancelAnimationFrame(spinRafRef.current)
      spinRafRef.current = null
    }
  }, [])
  const startSpin = useCallback(() => {
    if (prefersReducedMotion() || spinRafRef.current != null) return
    spinLastTsRef.current = 0
    const step = (ts: number) => {
      const map = mapRef.current
      if (!map || !readyRef.current || spinPausedRef.current) {
        spinRafRef.current = null
        return
      }
      // Robustez: si el motor (o un doble de test) no expone get/setCenter, no derivamos
      // en vez de reventar el rAF. La home nunca debe romperse por el adorno del globo.
      if (typeof map.getCenter !== 'function' || typeof map.setCenter !== 'function') {
        spinRafRef.current = null
        return
      }
      // Delta de tiempo → grados a avanzar este frame (velocidad constante real).
      const last = spinLastTsRef.current || ts
      spinLastTsRef.current = ts
      const dLng = (SPIN_DEG_PER_SEC * (ts - last)) / 1000
      const c = map.getCenter()
      // Envolvemos la longitud en [-180, 180): jitterless al cruzar el antimeridiano.
      let lng = c.lng + dLng
      if (lng > 180) lng -= 360
      map.setCenter([lng, c.lat])
      spinRafRef.current = requestAnimationFrame(step)
    }
    spinRafRef.current = requestAnimationFrame(step)
  }, [])

  // ── Montaje: crea el mapa una sola vez (import dinámico de maplibre + su CSS). ──
  useEffect(() => {
    if (!webgl) return
    const container = containerRef.current
    if (!container) return
    let disposed = false

    // Al interactuar: pausa la deriva y programa su reanudación tras un respiro (solo en la
    // landing decorativa; en `pins` la deriva ni arranca, así que esto es no-op allí).
    let resumeTimer: ReturnType<typeof setTimeout> | null = null
    const pauseSpinThenResume = () => {
      spinPausedRef.current = true
      stopSpin()
      if (resumeTimer != null) clearTimeout(resumeTimer)
      resumeTimer = setTimeout(() => {
        if (disposed || framingRef.current !== 'world') return
        spinPausedRef.current = false
        startSpin()
      }, SPIN_RESUME_DELAY_MS)
    }

    void (async () => {
      try {
        const gl = await import('maplibre-gl')
        await import('maplibre-gl/dist/maplibre-gl.css')
        if (disposed) return
        glRef.current = gl

        const map = new gl.Map({
          container,
          style: BASE_STYLE,
          center: WORLD_CENTER,
          zoom: WORLD_ZOOM,
          minZoom: MIN_ZOOM,
          // Tope DURO: ni el fit ni un gesto del usuario pueden pasar de aquí, así la
          // esfera nunca se aplana (ver GLOBE_MAX_ZOOM).
          maxZoom: GLOBE_MAX_ZOOM,
          // SIN control de atribución de MapLibre: su modo compacto no ocultaba el texto
          // de Esri en prod (salía como banda, ver #363/#382). Sin control = imposible que
          // aparezca la banda; el crédito lo damos con nuestro propio "ⓘ" (ver render).
          attributionControl: false,
          fadeDuration: prefersReducedMotion() ? 0 : 300,
        })
        mapRef.current = map

        map.on('load', () => {
          if (disposed) return
          // Globo 3D (proyección que llegó en v4) + atmósfera noche tokenizada.
          map.setProjection({ type: 'globe' })
          applySky(map)
          // Satélite Esri (héroe) + etiquetas suaves encima (sitúan sin tapar la foto
          // aérea). Ambas capas vienen del preset `diario`: una sola fuente de verdad.
          // Sin `attribution` en las fuentes: no hay control de MapLibre que lo muestre
          // (el crédito sale de nuestro "ⓘ"). Así nada puede regenerar la banda.
          map.addSource('basemap', {
            type: 'raster',
            tiles: [SATELLITE.url],
            tileSize: 256,
            maxzoom: SATELLITE.maxNativeZoom,
          })
          map.addLayer({ id: 'basemap', type: 'raster', source: 'basemap' })
          if (LABELS) {
            map.addSource('labels', {
              type: 'raster',
              tiles: [LABELS.url],
              tileSize: 256,
              maxzoom: LABELS.maxNativeZoom,
            })
            map.addLayer({ id: 'labels', type: 'raster', source: 'labels' })
          }
          readyRef.current = true
          // Coreografía de entrada ("perf(cargas): entrada sin saltos"):
          //  1. CÁMARA YA: el encuadre del recorrido del protagonista (#700) corre
          //     AQUÍ, instantáneo (duration 0 vía `revealedRef`, aún false) y con
          //     el lienzo a opacity 0 — nadie ve el salto de mundo→recorrido.
          //  2. LIENZO EN FUNDIDO: al primer `idle` (teselas del viewport listas)
          //     el canvas funde de 0 → 1 sobre el fondo de escena.
          //  3. PINES DESPUÉS: los markers montan en ese mismo revelado, con
          //     entrada escalonada (ver `repaint`); las rutas doradas (#703) se
          //     trazan en el mismo pintado — nunca antes del revelado.
          fitToPins()
          const reveal = () => {
            if (disposed || revealedRef.current) return
            if (revealFallbackRef.current != null) {
              window.clearTimeout(revealFallbackRef.current)
              revealFallbackRef.current = null
            }
            revealedRef.current = true
            // `repaint` ya aplica el "lead" del `activeTargetId` inicial (vía
            // `applyActiveLead`), así que no hace falta un vuelo aparte: la cámara
            // quedó encuadrada en el paso 1.
            repaint()
            setRevealed(true)
          }
          map.once('idle', reveal)
          // Red de seguridad: si `idle` no llega, no dejamos el globo invisible.
          revealFallbackRef.current = window.setTimeout(reveal, REVEAL_FALLBACK_MS)

          // Deriva en reposo: solo en la landing decorativa (`world`); en la home con
          // viajes reales (`pins`) el globo queda encuadrado en los pines, sin girar. Si la
          // hoja ya arranca subida (`relaxed`), no derivamos (el efecto de `relaxed` la
          // reanudará al recogerse).
          if (framingRef.current === 'world' && !relaxedRef.current) {
            spinPausedRef.current = false
            startSpin()
          }
        })

        // Interacción del usuario: pausa la deriva y la reanuda tras un respiro. Así el
        // gesto manda (no peleamos con su paneo) pero el globo vuelve a sentirse vivo.
        map.on('mousedown', pauseSpinThenResume)
        map.on('touchstart', pauseSpinThenResume)
        map.on('wheel', pauseSpinThenResume)

        // Arrastre en curso (#567): mientras el dueño gira el globo a mano, un vuelo a
        // `activeTargetId` no le pelea el gesto (ver `interactingRef`/`flyToTarget`).
        // `dragstart`/`dragend` (no `mousedown`/`mouseup`) porque son los que MapLibre
        // dispara específicamente para el paneo del globo, en ratón y en touch por igual.
        map.on('dragstart', () => {
          interactingRef.current = true
        })
        map.on('dragend', () => {
          interactingRef.current = false
        })
      } catch {
        if (!disposed) setFailed(true)
      }
    })()

    return () => {
      disposed = true
      readyRef.current = false
      stopSpin()
      if (resumeTimer != null) clearTimeout(resumeTimer)
      if (revealFallbackRef.current != null) {
        window.clearTimeout(revealFallbackRef.current)
        revealFallbackRef.current = null
      }
      for (const m of markersRef.current) m.remove()
      markersRef.current = []
      mapRef.current?.remove()
      mapRef.current = null
      glRef.current = null
    }
    // `relaxed` NO va en las deps: cambia al arrastrar la hoja y recrear el mapa WebGL en
    // cada toque sería carísimo. Su efecto vive en el useEffect de abajo (pausa/reanuda la
    // deriva y el render sin recrear nada). El montaje lee su valor inicial vía `relaxedRef`.
  }, [webgl, repaint, fitToPins, startSpin, stopSpin])

  // Repinta + reencuadra cuando cambian los pines O las rutas (no recrea el mapa).
  // `routes` en las deps (issue #702): `repaint` lee de la ref, pero el EFECTO
  // necesita saber que el valor de la prop cambió para volver a dispararse.
  useEffect(() => {
    repaint()
    if (readyRef.current) fitToPins()
  }, [pins, routes, repaint, fitToPins])

  // Vuela/resalta al cambiar `activeTargetId` (no recrea nada; ver `flyToTarget`).
  // No hace falta comparar con el valor anterior: `flyToTarget` ya es un NO-OP total
  // si no hay id o no hay pin correspondiente, y el efecto solo se dispara cuando la
  // prop CAMBIA de valor (dependencia `[activeTargetId]`). `applyRouteEmphasis`
  // (issue #702) recolorea las rutas sin reconstruirlas — el "recoloreo barato" al
  // cambiar de protagonista (p.ej. al deslizar el carrusel de viajes).
  useEffect(() => {
    if (readyRef.current) {
      flyToTarget()
      applyRouteEmphasis()
    }
  }, [activeTargetId, flyToTarget, applyRouteEmphasis])

  // Issue #693: si el dock cambia de alto (aparece/desaparece el chip "Te toca jugar",
  // los chips de filtro, o el usuario cambia a un viaje con/sin fechas) el hueco visible
  // cambia — reencuadra para que los pines sigan aterrizando por encima del dock, no en
  // la banda que acaba de crecer o encogerse. Basta `fitToPins`: desde #700 ya encuadra
  // el recorrido del viaje activo (antes hacía falta `flyToTarget` aparte).
  useEffect(() => {
    if (!readyRef.current) return
    fitToPins()
  }, [bottomObscuredPx, fitToPins])

  // Rendimiento + deriva según la hoja. Con la hoja SUBIDA (`relaxed`) el globo queda casi
  // tapado: paramos la rotación de teselas (batería) y PAUSAMOS la deriva. Al RECOGERSE la
  // hoja (héroe a la vista de nuevo), reanudamos la deriva en la landing decorativa.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    if (relaxed) {
      spinPausedRef.current = true
      stopSpin()
      map.stop()
    } else if (framingRef.current === 'world') {
      spinPausedRef.current = false
      startSpin()
    }
  }, [relaxed, startSpin, stopSpin])

  const evoked = !webgl || failed

  return (
    <div className={[styles.globe, className].filter(Boolean).join(' ')} aria-hidden="true">
      {evoked ? (
        // Globo EVOCADO (sin tiles): red de seguridad cuando no hay WebGL. Mantiene
        // el héroe visual; los pines reales viven en el motor MapLibre.
        <div className={styles.evoked}>
          <div className={`${styles.evokedGlobe} lg-home-globe-breathe`} />
        </div>
      ) : (
        <>
          {/* Lienzo WebGL: arranca a opacity 0 sobre el fondo de escena y funde a 1
              en el primer `idle` (revelado; reduced-motion aparece sin fundir). */}
          <div
            ref={containerRef}
            className={[styles.map, revealed ? styles.mapRevealed : ''].filter(Boolean).join(' ')}
          />
          {/* Crédito propio (NO control de MapLibre): "ⓘ" discreto que despliega el texto
              de Esri al tocar. `title` nativo como mínimo + popover visible. Cumple la
              atribución sin banda. Se monta sobre el lienzo, captura su propio click. */}
          <div className={styles.credit}>
            {creditOpen && <span className={styles.creditText}>{MAP_CREDIT}</span>}
            <button
              type="button"
              className={[styles.creditButton, 'lg-press'].join(' ')}
              title={MAP_CREDIT}
              aria-label="Créditos del mapa"
              aria-expanded={creditOpen}
              onClick={() => setCreditOpen((v) => !v)}
            >
              <Icon icon={Info} size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
