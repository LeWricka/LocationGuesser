// Contenido de los tutoriales de onboarding (slideshow saltable, primera vez).
// Separado de la UI para que el componente sea presentacional puro y el copy se
// edite sin tocar lógica. Texto en español, claro y breve (sin i18n hoy).

import { Camera, Heart, Map as MapIcon, MapPin, Pin, Search, Timer } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { OnboardingContext } from '../../lib/onboardingFlags'

export interface OnboardingSlide {
  /** Icono de Lucide (lo pinta el slideshow con el wrapper Icon; sin assets externos). */
  icon: LucideIcon
  title: string
  body: string
}

const GROUP_SLIDES: OnboardingSlide[] = [
  {
    icon: MapPin,
    title: 'Que los que más quieres lo vivan contigo',
    body: 'Comparte tus viajes y guarda esos recuerdos con los tuyos.',
  },
  {
    icon: Camera,
    title: 'Guarda el recuerdo',
    body: 'Una foto y/o Street View del sitio donde estuviste.',
  },
  {
    icon: Heart,
    title: 'Compártelo con los tuyos',
    body: 'Los tuyos lo abren y viven el momento contigo.',
  },
  {
    icon: MapIcon,
    title: 'Y, de paso, lo adivinan',
    body: 'El guiño divertido: marcan en el mapa dónde es. Gana quien más se acerca.',
  },
]

const CHALLENGE_SLIDES: OnboardingSlide[] = [
  {
    icon: Search,
    title: 'Mira las pistas',
    body: 'Carteles, paisaje, detalles… todo cuenta.',
  },
  {
    icon: Pin,
    title: 'Coloca tu pin',
    body: 'Toca el mapa donde crees que es.',
  },
  {
    icon: Timer,
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
