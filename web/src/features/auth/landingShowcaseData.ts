// Datos del showcase de la landing deslogueada (issue #462): en vez de recrear el
// producto con componentes vivos, enseñamos CAPTURAS REALES de pantallas de Tabide
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
// Las imágenes están versionadas y optimizadas (webp) en assets/landing/. Se generan
// con `npm run gallery:shots` (viewport móvil 390×844@2x, casos `showcase-*`) y se
// convierten a webp. Límite conocido: los mapas de la galería van stubeados (fondo
// oscuro plano, ver `gallery/stubs/maplibre-gl.ts`), así que elegimos composiciones
// que lucen SIN depender de tiles reales — el "reveal" en concreto recorta el mapa a
// 62svh del revelado real (un rectángulo liso que no aporta) y se queda solo con el
// anillo de puntos, que es SVG/CSS puro.

import homeShot from '../../assets/landing/home.webp'
import viajeShot from '../../assets/landing/viaje.webp'
import jugarShot from '../../assets/landing/jugar.webp'
import resultadoShot from '../../assets/landing/resultado.webp'

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
}

// Cuatro pantallas héroe, una por paso del bucle "comparte → adivina → gana → revive"
// (mismo orden que `SHOWCASE_LOOP`), cada una una captura real de la app: la home
// (globo + reto a jugar), el diario (momentos y fotos del viaje), la partida (la foto
// real a pantalla completa, colocando el pin) y el resultado (el anillo de puntos).
export const SHOWCASE_SHOTS: ShowcaseShot[] = [
  {
    id: 'home',
    image: homeShot,
    alt: 'Pantalla de inicio de Tabide: un globo con el pin del viaje y el reto pendiente de jugar.',
    eyebrow: 'Tu mundo',
    title: 'Todo el viaje en un globo',
    lede: 'Cada momento que compartes se clava en el mapa. Al abrir Tabide, tu gente ve dónde habéis estado y qué reto toca jugar.',
  },
  {
    id: 'viaje',
    image: viajeShot,
    alt: 'Pantalla del diario de un viaje en Tabide: los momentos del recorrido con sus fotos, en orden.',
    eyebrow: 'El recorrido',
    title: 'Cada momento, en su sitio',
    lede: 'Fotos y retos se clavan en el diario del viaje, en orden. Así vuestro grupo revive por dónde habéis pasado.',
  },
  {
    id: 'jugar',
    image: jugarShot,
    alt: 'Pantalla de jugar un reto en Tabide: la foto real a pantalla completa, lista para colocar el pin.',
    eyebrow: 'La partida',
    title: 'Adivina dónde es',
    lede: 'Marcas en el mapa dónde crees que es. Hay cuenta atrás: cuanto más rápido y más cerca, más puntos.',
  },
  {
    id: 'resultado',
    image: resultadoShot,
    alt: 'Pantalla de resultado de Tabide: los puntos de un intento y lo cerca que quedó del lugar real.',
    eyebrow: 'El resultado',
    title: 'Gana quien más se acerca',
    lede: 'Al revelar ves tus puntos y a qué distancia quedaste. Reto a reto, se llena el marcador del viaje.',
  },
]

// El relato de una línea del bucle (foto-first, cuatro pasos cortos, estilo
// Polarsteps Plan/Track/Relive pero en la voz de Tabide).
export const SHOWCASE_LOOP: string[] = [
  'Comparte un momento del viaje',
  'Tu gente adivina dónde es',
  'Gana quien más se acerca',
  'Revivís el viaje juntos',
]
