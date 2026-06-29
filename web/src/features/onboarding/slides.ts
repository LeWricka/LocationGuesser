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
    title: 'Que los que más quieres lo vivan contigo',
    body: 'Comparte tus viajes y guarda esos recuerdos con los tuyos.',
  },
  {
    icon: '📷',
    title: 'Guarda el recuerdo',
    body: 'Una foto y/o Street View del sitio donde estuviste.',
  },
  {
    icon: '💛',
    title: 'Compártelo con los tuyos',
    body: 'Tu grupo lo abre y vive el momento contigo.',
  },
  {
    icon: '🗺️',
    title: 'Y, de paso, lo adivinan',
    body: 'El guiño divertido: marcan en el mapa dónde es. Gana quien más se acerca.',
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
