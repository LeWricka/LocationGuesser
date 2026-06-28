// Contenido de los tutoriales de onboarding (slideshow saltable, primera vez).
// Separado de la UI para que el componente sea presentacional puro y el copy se
// edite sin tocar lógica. Texto en español, claro y breve (sin i18n hoy).

import type { OnboardingContext } from '../../lib/onboardingFlags'

export interface OnboardingSlide {
  /** Emoji como icono ligero (sin assets externos; encaja con el resto del UI). */
  icon: string
  title: string
  body: string
}

const GROUP_SLIDES: OnboardingSlide[] = [
  {
    icon: '📍',
    title: 'Comparte tus momentos de una forma diferente',
    body: 'Compartes dónde estás y tus amigos lo adivinan.',
  },
  {
    icon: '📷',
    title: 'Comparte tu sitio',
    body: 'Una foto y/o Street View, con tu ubicación.',
  },
  {
    icon: '🗺️',
    title: 'Adivinan en el mapa',
    body: 'Tus amigos marcan dónde creen que es.',
  },
  {
    icon: '🏆',
    title: 'Gana quien más se acerca',
    body: 'Puntos por distancia. Clasificación y premios.',
  },
]

const CHALLENGE_SLIDES: OnboardingSlide[] = [
  {
    icon: '🔎',
    title: 'Mira las pistas',
    body: 'Carteles, paisaje, detalles… todo cuenta.',
  },
  {
    icon: '📌',
    title: 'Coloca tu pin',
    body: 'Toca el mapa donde crees que es.',
  },
  {
    icon: '⏱️',
    title: 'Confirma a tiempo',
    body: 'Hay cuenta atrás. Cuanto más cerca, más puntos.',
  },
]

const SLIDES: Record<OnboardingContext, OnboardingSlide[]> = {
  group: GROUP_SLIDES,
  challenge: CHALLENGE_SLIDES,
}

export function getSlides(context: OnboardingContext): OnboardingSlide[] {
  return SLIDES[context]
}
