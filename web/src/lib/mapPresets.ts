/**
 * Configuración CENTRAL de los mapas de Tabide — una sola fuente de verdad para
 * tiles, etiquetas, encuadre y colores de escena. Antes había Leaflet, MapLibre y
 * Google con URLs y estilos sueltos por toda la app; aquí se reduce a DOS PRESETS,
 * cada uno con un trabajo claro (diseño "Mapas — dos lienzos con función clara"):
 *
 *  - `diario` (Ver): satélite Esri a sangre + ETIQUETAS suaves (nombres de ciudad)
 *    + pines-foto de los recuerdos. El satélite es para mirar tu viaje desde arriba;
 *    las etiquetas sitúan dónde estás sin tapar la foto aérea.
 *  - `jugar`: mapa ETIQUETADO tipo GeoGuessr (calles y nombres) para colocar el pin
 *    navegando. La dificultad la pone la foto, no el mapa ciego.
 *
 * Cada motor (Leaflet, MapLibre, Google) consume estas constantes y las traduce a
 * su API, pero el "qué tile / qué etiquetas / qué color" se decide una sola vez aquí.
 */

export type MapPreset = 'diario' | 'jugar'

/** Definición de una capa de teselas raster (URL + atribución + zooms). */
export interface TileLayerSpec {
  /** Plantilla de URL con placeholders {z}/{x}/{y} (y {s} si la capa los usa). */
  url: string
  attribution: string
  /** Último zoom con teselas nativas; por encima se reescalan (sin huecos grises). */
  maxNativeZoom: number
  /** Zoom máximo navegable. */
  maxZoom: number
}

// ── Satélite Esri World Imagery (sin API key). Foto aérea a sangre: el "héroe" del
// diario. Sin etiquetas por sí solo; las pone la capa de referencia de abajo. ──
export const ESRI_SATELLITE: TileLayerSpec = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution:
    'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  maxNativeZoom: 19,
  maxZoom: 20,
}

// ── Capa de ETIQUETAS de Esri (transparente): fronteras + nombres de lugares para
// superponer al satélite. Es lo que convierte el satélite mudo en un mapa que
// "sitúa": ciudades y países sobre la foto aérea, sin tapar el terreno. ──
export const ESRI_REFERENCE_LABELS: TileLayerSpec = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Labels &copy; Esri',
  maxNativeZoom: 19,
  maxZoom: 20,
}

// ── Callejero ETIQUETADO tipo GeoGuessr (sin API key): CARTO Voyager, raster claro
// con calles y topónimos legibles. El preset "jugar" navega sobre esto para colocar
// el pin; el mapa NO es ciego, la dificultad la da la foto. ──
export const CARTO_VOYAGER: TileLayerSpec = {
  url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  maxNativeZoom: 20,
  maxZoom: 20,
}

// ── Plano claro minimalista (CARTO Positron): papel gris sobrio. Capa OPT-IN del
// diario para quien prefiera el plano al satélite (toggle del chrome). ──
export const CARTO_POSITRON: TileLayerSpec = {
  url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  maxNativeZoom: 20,
  maxZoom: 20,
}

/**
 * Capas de cada preset. `diario` apila satélite + etiquetas; `jugar` es el callejero
 * etiquetado. `labels` es null cuando el basemap ya trae sus propios topónimos
 * (Voyager) — solo el satélite necesita la capa de etiquetas superpuesta.
 */
export const MAP_PRESETS: Record<MapPreset, { base: TileLayerSpec; labels: TileLayerSpec | null }> =
  {
    diario: { base: ESRI_SATELLITE, labels: ESRI_REFERENCE_LABELS },
    jugar: { base: CARTO_VOYAGER, labels: null },
  }

// ── Encuadre de pines (compartido por el plano y el globo del diario para que se
// vean igual sea cual sea el motor). ──
/** Un solo punto → zoom de ciudad (ni continente ni calle). */
export const SINGLE_ZOOM = 11
/** Techo al encuadrar varios pines: no acercarse de más si están muy juntos. */
export const FIT_MAX_ZOOM = 12
/** Zoom mínimo al volar a un pin seleccionado: ciudad. */
export const SELECT_ZOOM = 11

// ── Colores de ESCENA del globo (MapLibre paint, NO CSS → no admiten var(--token)).
// El diseño pide tokenizar la paleta oscura inmersiva; como el paint no resuelve
// variables CSS, exponemos los valores aquí con NOMBRES de escena para que nadie
// vuelva a escribir `#0d1722` suelto en un componente. Si más adelante hay tokens
// `--scene-*` en CSS, este módulo es el único punto a sincronizar. ──
export const SCENE_GLOBE = {
  /** Cielo: noche profunda (espacio tras el globo). */
  skyColor: '#0d1722',
  /** Horizonte: pizarra que ilumina el borde del globo. */
  horizonColor: '#21384e',
  /** Niebla atmosférica azul noche hacia el horizonte (refuerza la curvatura). */
  fogColor: '#152838',
} as const
