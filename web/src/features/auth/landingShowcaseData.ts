// Datos de la NARRATIVA en dos partes de la landing deslogueada (issue #731): tras el
// héroe, la portada cuenta el producto en DOS BLOQUES —guardar el viaje (la esencia,
// primero) y, luego, compartirlo para que tu gente sea parte (jugar es solo UNA
// forma de estarlo, no el objetivo, ver la reorientación de la Parte 2 en #733)— en
// vez del carrusel plano de 4 capturas + lista de pasos del diseño anterior (#652/#695).
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
// diario. Antes se repetía este texto bajo el marco de móvil de la captura que lo
// necesitaba (issue #695); el dueño pidió sacarlo de las capturas del todo (issue
// #733): ahora vive UNA vez, como pie de página discreto de toda la landing (ver
// `LANDING_MAP_CREDIT`, consumido por `Landing.tsx`), nunca dentro de una tarjeta.
const { base: ESRI_SATELLITE, labels: ESRI_LABELS } = MAP_PRESETS.diario
export const LANDING_MAP_CREDIT = [ESRI_SATELLITE.attribution, ESRI_LABELS?.attribution]
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
  // Kicker vacío (feedback landing): el "Guarda los momentos" redundaba con el
  // eyebrow; el eyebrow "Tu viaje, para siempre" hace de encabezado del bloque.
  kicker: '',
  eyebrow: 'Tu viaje, para siempre',
  title: 'Guarda el viaje mientras lo vives',
  lede: 'Foto, clip, audio, un sitio en el mapa. Todo lo del viaje, guardado como lo vivís.',
  items: [
    {
      icon: 'camara',
      title: 'Foto, clip o audio',
      body: 'Sube lo que quieras del día. Una foto, un vídeo corto, una nota de voz.',
    },
    {
      icon: 'pin',
      title: 'Cada momento, en un lugar',
      body: 'Se guarda en el mapa donde pasó. Queda grabado ahí para siempre.',
    },
    {
      icon: 'calendario',
      title: 'Bitácora de viaje',
      body: 'Aquí se reúne todo: fotos, momentos, en orden. Para volver cuando queráis.',
    },
  ],
  shot: {
    image: viajeShot,
    alt: 'Bitácora de un viaje bien llena: varios momentos con sus fotos, en orden, y el recorrido sobre el mapa.',
  },
}

// PARTE 2 — REORIENTACIÓN (issue #733): el objetivo NO es jugar, es COMPARTIR y que
// tu gente sea parte de la experiencia — jugar es solo UNA forma de estar dentro (la
// otra es simplemente mirar el diario). El diseño anterior (#731) enmarcaba toda la
// parte como "un juego" (kicker "jugad", título "de paso, un juego", cierre en
// "pique"): el dueño pidió reescribirla alrededor de compartir, con jugar como el
// segundo de tres escalones (Comparte → Reta → Clasificación), de lo más básico
// (mirar) a lo más comprometido (competir por un premio).
const JUGAR: LandingStoryPart = {
  id: 'jugar',
  tone: 'jugar',
  // Kicker vacío (feedback landing): igual que la Parte 1, el eyebrow hace de
  // encabezado y ENLAZA arriba con abajo — "Tu viaje, para siempre" (guardar) /
  // "Tu viaje, con tu gente" (compartir).
  kicker: '',
  eyebrow: 'Tu viaje, con tu gente',
  title: 'Y lo viven contigo',
  lede: 'Comparte el viaje: viéndolo o jugando a adivinar dónde es cada foto.',
  items: [
    {
      icon: 'globo',
      title: 'Comparte el viaje',
      body: 'Un enlace y están dentro. Ven el diario, las fotos y los momentos, sin instalar nada.',
    },
    {
      icon: 'reto',
      title: 'Reta a tus amigos',
      body: 'Crea retos con tus fotos: ¿dónde es? Siguen el viaje adivinando en el mapa.',
    },
    {
      icon: 'trofeo',
      title: 'Clasificación y premios',
      body: 'Puntos, ranking y los premios que tú pongas. Para que lo sigan hasta el final.',
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
