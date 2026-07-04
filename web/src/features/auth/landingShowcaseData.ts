// Datos del showcase de la landing deslogueada (issue #462): en vez de recrear el
// producto con componentes vivos, enseñamos CAPTURAS REALES de pantallas de Momentu
// —fotografiadas con el sistema de galería (fixtures deterministas + Playwright)—
// dentro de marcos de móvil, al estilo Polarsteps (imagen de producto real sobre una
// composición editorial). El dueño lo pidió así: "capturas reales, tipo la home de
// Polarsteps". Sustituye al showcase de componentes de la #452/#454.
//
// Refresco #652: las capturas de #462 (junio) enseñaban el diseño VIEJO de esas
// pantallas y, encima, fotos-stub grises (el gradiente con el nombre del archivo en
// texto): no vendían "app viva de verdad". Ahora las 4 diapositivas —una por paso del
// bucle (ver `SHOWCASE_LOOP`)— son capturas de las pantallas ACTUALES con FOTOS REALES
// (fixtures dedicados en `web/src/gallery/showcaseFixtures.ts`, casos `showcase-*`).
//
// Las imágenes están versionadas y optimizadas (webp) en assets/landing/. `jugar.webp`/
// `resultado.webp` se generan con `npm run gallery:shots` (galería hermética, viewport
// móvil 390×844@2x) — ninguna de las dos lleva mapa satélite protagonista, así que el
// stub de mapas no las afecta. `home.webp`/`viaje.webp` SÍ enseñan el globo satélite y
// se generan con el modo híbrido `npm run landing:assets` (issue #695): la galería
// hermética normal solo tiene el stub plano oscuro de `gallery/stubs/maplibre-gl.ts`
// (sin red → sin teselas), así que esas dos usan el paquete REAL de mapas para que las
// fotos-pin queden clavadas sobre satélite de verdad.

import homeShot from '../../assets/landing/home.webp'
import viajeShot from '../../assets/landing/viaje.webp'
import jugarShot from '../../assets/landing/jugar.webp'
import resultadoShot from '../../assets/landing/resultado.webp'
import { MAP_PRESETS } from '../../lib/mapPresets'

// Mismo crédito de tiles que pintan HomeGlobe/TripMapGlobe (issue #695): construido
// aquí en vez de importado porque es una tira presentacional de UNA sola diapositiva,
// no una responsabilidad del propio mapa — pero se apoya en las MISMAS constantes de
// `mapPresets.ts`, así que un cambio de proveedor de tiles no puede desincronizarse.
const { base: ESRI_SATELLITE, labels: ESRI_LABELS } = MAP_PRESETS.diario
const ESRI_CREDIT = [ESRI_SATELLITE.attribution, ESRI_LABELS?.attribution]
  .filter(Boolean)
  .join(' · ')
  .replace(/&copy;/g, '©')

// Una diapositiva del showcase: un texto editorial (eyebrow + título + lede) junto a
// una captura real montada en un marco de móvil. El orden cuenta el bucle del producto.
export interface ShowcaseShot {
  id: string
  /** Captura real (webp empaquetado), mostrada dentro del marco de móvil. */
  image: string
  /** Texto alternativo descriptivo de la pantalla. */
  alt: string
  /** Versalita editorial sobre el título. */
  eyebrow: string
  /** Título serif de la diapositiva. */
  title: string
  /** Frase de apoyo que explica qué se ve. */
  lede: string
  /**
   * Crédito del mapa satélite (issue #695), SOLO cuando el crédito propio del mapa
   * (el botón "ⓘ" de HomeGlobe/TripMapGlobe, ya desplegado al capturar) no queda
   * legible en la foto congelada — p.ej. el diario le superpone el carril de
   * tarjetas justo donde cae el crédito. Requisito de licencia de Esri: si no se ve
   * en la captura, lo repetimos aquí, pequeño, bajo el marco.
   */
  mapCredit?: string
}

// Cuatro pantallas héroe, una por paso del bucle "comparte → adivina → gana → revive"
// (mismo orden que `SHOWCASE_LOOP`), cada una una captura real de la app: la home
// (globo + reto a jugar), el diario (momentos y fotos del viaje), la partida (la foto
// real a pantalla completa, colocando el pin) y el resultado (el anillo de puntos).
export const SHOWCASE_SHOTS: ShowcaseShot[] = [
  {
    id: 'home',
    image: homeShot,
    alt: 'Pantalla de inicio de Momentu: un globo con el pin del viaje y el reto pendiente de jugar.',
    eyebrow: 'Tus viajes',
    title: 'Cada viaje deja su camino',
    lede: 'Cada momento se guarda en su sitio del mapa. Al abrir Momentu, tu gente ve dónde habéis estado y qué toca jugar.',
  },
  {
    id: 'viaje',
    image: viajeShot,
    alt: 'Pantalla del diario de un viaje en Momentu: los momentos del recorrido con sus fotos, en orden.',
    eyebrow: 'El recorrido',
    title: 'Cada momento, en su sitio',
    lede: 'Fotos y retos se guardan en el diario del viaje, en orden. Así tu gente revive por dónde habéis pasado.',
    mapCredit: ESRI_CREDIT,
  },
  {
    id: 'jugar',
    image: jugarShot,
    alt: 'Pantalla de jugar un reto en Momentu: la foto real a pantalla completa, lista para colocar el pin.',
    eyebrow: 'La partida',
    title: 'Adivina dónde es',
    lede: 'Marcas en el mapa dónde crees que es. Hay cuenta atrás: cuanto más rápido y más cerca, más puntos.',
  },
  {
    id: 'resultado',
    image: resultadoShot,
    alt: 'Pantalla de resultado de Momentu: los puntos de un intento y lo cerca que quedó del lugar real.',
    eyebrow: 'El resultado',
    title: 'Gana quien más se acerca',
    lede: 'Al revelar ves tus puntos y a qué distancia quedaste. Reto a reto, se llena el marcador del viaje.',
  },
]

// El relato de una línea del bucle (foto-first, cuatro pasos cortos, estilo
// Polarsteps Plan/Track/Relive pero en la voz de Momentu).
export const SHOWCASE_LOOP: string[] = [
  'Comparte un momento del viaje',
  'Tu gente adivina dónde es',
  'Gana quien más se acerca',
  'Revivís el viaje juntos',
]
