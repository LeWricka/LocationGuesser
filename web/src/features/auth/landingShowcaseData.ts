// Datos del showcase de la landing deslogueada (issue #462): en vez de recrear el
// producto con componentes vivos, enseñamos CAPTURAS REALES de pantallas de Tabide
// —fotografiadas con el sistema de galería (fixtures deterministas + Playwright)—
// dentro de marcos de móvil, al estilo Polarsteps (imagen de producto real sobre una
// composición editorial). El dueño lo pidió así: "capturas reales, tipo la home de
// Polarsteps". Sustituye al showcase de componentes de la #452/#454.
//
// Las imágenes están versionadas y optimizadas (webp) en assets/landing/. Se generan
// con `npm run gallery:shots` (viewport móvil 390×844@2x) y se convierten a webp.
// Límite conocido: los mapas de la galería van stubeados (fondo oscuro plano), así que
// elegimos pantallas que lucen SIN depender de tiles reales (globo héroe, resultado,
// podio del marcador).

import homeShot from '../../assets/landing/home.webp'
import resultadoShot from '../../assets/landing/resultado.webp'
import marcadorShot from '../../assets/landing/marcador.webp'

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

// Tres pantallas héroe que cierran el bucle "comparte → adivina → gana", cada una una
// captura real de la app: la home (globo + reto a jugar), el resultado (cercanía en
// puntos) y el marcador (podio del viaje). Ninguna depende de tiles de mapa reales.
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
    id: 'resultado',
    image: resultadoShot,
    alt: 'Pantalla de resultado de Tabide: los puntos de un intento y lo cerca que quedó del lugar real.',
    eyebrow: 'La partida',
    title: 'Gana quien más se acerca',
    lede: 'Marcas en el mapa dónde crees que es. Cuanto más cerca del lugar real, más puntos. Con cuenta atrás.',
  },
  {
    id: 'marcador',
    image: marcadorShot,
    alt: 'Pantalla de marcador de Tabide: el podio del viaje con los tres primeros y sus puntos.',
    eyebrow: 'El recuerdo',
    title: 'Un marcador que os une',
    lede: 'Reto a reto se llena el podio del viaje. Al final revivís juntos por dónde pasasteis y quién ganó.',
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
