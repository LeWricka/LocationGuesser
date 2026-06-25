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
    body: 'Compartes dónde estás y tus amigos lo adivinan en el mapa. Cuanto más cerca, más puntos.',
  },
  {
    icon: '📷',
    title: 'Así funciona un grupo',
    body: 'Alguien comparte su sitio (una foto y/o Street View) y guarda su ubicación. Los demás colocáis un pin en el mapa donde creéis que es. Gana quien más se acerca.',
  },
  {
    icon: '🏆',
    title: 'Clasificación y premios',
    body: 'Cada reto suma puntos a la clasificación del grupo. Las primeras posiciones se llevan los premios: pelead por el podio.',
  },
  {
    icon: '🔗',
    title: 'Invita a tu gente',
    body: 'Comparte el enlace del grupo para que se unan. Cuantos más juguéis, más divertido. ¡A por el primer reto!',
  },
]

const CHALLENGE_SLIDES: OnboardingSlide[] = [
  {
    icon: '🔎',
    title: 'Observa el reto',
    body: 'Mira bien la foto o el Street View del reto: detalles, carteles, paisaje… todo da pistas de dónde es.',
  },
  {
    icon: '📌',
    title: 'Coloca tu pin',
    body: 'Toca el mapa en el punto donde crees que es. Puedes ajustarlo todas las veces que quieras antes de confirmar.',
  },
  {
    icon: '⏱️',
    title: 'Confirma antes de que acabe',
    body: 'Hay cuenta atrás: confirma tu respuesta a tiempo. Cuanto más cerca quedes, más puntos sumas.',
  },
]

const SLIDES: Record<OnboardingContext, OnboardingSlide[]> = {
  group: GROUP_SLIDES,
  challenge: CHALLENGE_SLIDES,
}

export function getSlides(context: OnboardingContext): OnboardingSlide[] {
  return SLIDES[context]
}
