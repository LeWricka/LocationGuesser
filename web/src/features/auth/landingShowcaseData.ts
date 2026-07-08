// Datos de la NARRATIVA en dos partes de la landing deslogueada (issue #731): tras el
// héroe, la portada cuenta el producto en DOS BLOQUES —guardar el viaje (la esencia,
// primero) y, luego, jugarlo con tu gente (el gancho social, después)— en vez del
// carrusel plano de 4 capturas + lista de pasos del diseño anterior (#652/#695).
// Estructura y copy validados por el dueño.
//
// Reutiliza los MISMOS assets reales del diseño anterior (`assets/landing/*.webp`,
// generados con `npm run landing:assets`/`GALLERY_REAL_MAP=1`, ver #695/#698): la
// "Bitácora bien llena" de la Parte 1 ES la captura `showcase-viaje` (el diario con
// varios momentos, fotos y el recorrido en el mapa) y el "reto con cuenta atrás" de la
// Parte 2 ES `showcase-jugar` (la foto real a pantalla completa + el temporizador). No
// hizo falta generar assets nuevos: las capturas existentes ya enseñan justo lo que
// pide cada parte.

import viajeShot from '../../assets/landing/viaje.webp'
import jugarShot from '../../assets/landing/jugar.webp'
import { MAP_PRESETS } from '../../lib/mapPresets'

// Mismo crédito de tiles que pintan HomeGlobe/TripMapGlobe (issue #695): la captura de
// la bitácora (viaje.webp) tapa el propio botón "ⓘ" con el carril de tarjetas del
// diario, así que el crédito de Esri se repite aquí, pequeño, bajo el marco.
const { base: ESRI_SATELLITE, labels: ESRI_LABELS } = MAP_PRESETS.diario
const ESRI_CREDIT = [ESRI_SATELLITE.attribution, ESRI_LABELS?.attribution]
  .filter(Boolean)
  .join(' · ')
  .replace(/&copy;/g, '©')

/** Icono custom de marca (`ui/icons`) por clave: mantiene este fichero como datos
 * puros (sin JSX) — el componente resuelve la clave al componente de icono real. */
export type LandingStoryIcon = 'camara' | 'pin' | 'calendario' | 'reto' | 'globo' | 'trofeo'

export interface LandingStoryItem {
  icon: LandingStoryIcon
  title: string
  body: string
}

export interface LandingStoryShot {
  /** Captura real (webp empaquetado), mostrada dentro del marco de móvil. */
  image: string
  alt: string
  /** Crédito del mapa satélite (issue #695), solo cuando no queda legible en la
   * propia captura (ver el mismo campo en el diseño anterior de este fichero). */
  mapCredit?: string
}

// Una de las dos partes de la narrativa: separador + eyebrow + título + lede + tres
// puntos con icono, cerrando con una captura real en marco de móvil.
export interface LandingStoryPart {
  id: string
  /** Tono del separador de parte: teal (guardar) o dorado (jugar). */
  tone: 'guardar' | 'jugar'
  kicker: string
  eyebrow: string
  title: string
  lede: string
  items: LandingStoryItem[]
  shot: LandingStoryShot
}

// PARTE 1 — la esencia primero: guardar el viaje es tan fácil como mandarlo al grupo
// de WhatsApp, pero se queda para siempre. Jugar es la Parte 2, el gancho — no el qué
// somos (frase ancla de producto, ver CLAUDE.md).
const GUARDAR: LandingStoryPart = {
  id: 'guardar',
  tone: 'guardar',
  kicker: 'Parte 1 · Guarda el viaje',
  eyebrow: 'Tu viaje, para siempre',
  title: 'Guarda el viaje mientras lo vives',
  lede: 'Fotos, clips, audios, un sitio en el mapa. Igual de fácil que mandarlo al grupo — pero se queda para siempre, no se pierde en el chat.',
  items: [
    {
      icon: 'camara',
      title: 'Foto, clip o audio',
      body: 'Sube lo que quieras del día. Una foto, un vídeo corto, una nota de voz.',
    },
    {
      icon: 'pin',
      title: 'Cada momento, en su sitio',
      body: 'Se guarda en el mapa donde pasó. El viaje va dejando su rastro.',
    },
    {
      icon: 'calendario',
      title: 'Todo en el diario',
      body: 'Fotos y momentos en orden, en la bitácora. Para volver cuando queráis.',
    },
  ],
  shot: {
    image: viajeShot,
    alt: 'Bitácora de un viaje bien llena: varios momentos con sus fotos, en orden, y el recorrido sobre el mapa.',
    mapCredit: ESRI_CREDIT,
  },
}

// PARTE 2 — el gancho social: cada sitio guardado se convierte en un reto para que tu
// gente entre, mire el viaje y se pique.
const JUGAR: LandingStoryPart = {
  id: 'jugar',
  tone: 'jugar',
  kicker: 'Parte 2 · Y luego, jugad',
  eyebrow: 'Con tu gente',
  title: 'Y de paso, un juego',
  lede: 'Cada sitio es un reto: los tuyos adivinan dónde es. El gancho para que el grupo entre, mire el viaje y se pique.',
  items: [
    {
      icon: 'reto',
      title: 'Reta a tus amigos',
      body: '¿Dónde tomé esta foto? Marcan en el mapa a contrarreloj. El que más se acerca, gana.',
    },
    {
      icon: 'globo',
      title: 'Comparte el viaje',
      body: 'Un enlace y ya están dentro. Ven el diario y juegan, sin instalar nada.',
    },
    {
      icon: 'trofeo',
      title: 'Clasificación',
      body: 'Puntos, ranking y pique sano. Que participen todos.',
    },
  ],
  shot: {
    image: jugarShot,
    alt: 'Pantalla de jugar un reto en Momentu: la foto real a pantalla completa y la cuenta atrás para marcar en el mapa dónde crees que es.',
  },
}

export const LANDING_STORY_PARTS: LandingStoryPart[] = [GUARDAR, JUGAR]

// Pie de cierre tras la Parte 2, justo antes del CTA final. NO meta-discurso de
// marca ("lo que somos" hablándole al usuario, un tic que el dueño pidió erradicar
// en #729): un lema concreto de lo que la app ES.
export const LANDING_STORY_FOOT = 'Un diario de viaje que se juega.'
