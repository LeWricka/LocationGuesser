// Contenido de los tutoriales de onboarding (slideshow saltable, primera vez).
// Separado de la UI para que el componente sea presentacional puro y el copy se
// edite sin tocar lógica. Texto en español, claro y breve (sin i18n hoy).
//
// Visual-first: la gente no lee. Cada slide es un icono lucide + un titular corto
// + una frase. Iconos del set lucide (los pinta el slideshow con el wrapper Icon;
// sin assets externos ni emojis de chrome).

import {
  Camera,
  Heart,
  Link as LinkIcon,
  Map as MapIcon,
  MapPin,
  MapPinned,
  Pin,
  Search,
  Send,
  Sparkles,
  Target,
  Timer,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { OnboardingContext } from '../../lib/onboardingFlags'

export interface OnboardingSlide {
  /** Icono de Lucide (lo pinta el slideshow con el wrapper Icon; sin assets externos). */
  icon: LucideIcon
  title: string
  body: string
}

/** Parámetros opcionales para personalizar slides (p.ej. la bienvenida del receptor). */
export interface SlideParams {
  /** Nombre del viaje, para personalizar la bienvenida del receptor. */
  tripName?: string
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

// Crear viaje: el viaje es el contenedor social del plan. Antes de montar nada,
// que entienda que es el sitio donde vivirá el plan con los suyos.
const CREATE_TRIP_SLIDES: OnboardingSlide[] = [
  {
    icon: MapPinned,
    title: 'Crea tu viaje',
    body: 'El sitio donde guardas el plan y lo vives con los tuyos.',
  },
  {
    icon: Users,
    title: 'Invita a tu gente',
    body: 'Les pasas un enlace y entran sin complicarse.',
  },
  {
    icon: Camera,
    title: 'Y empieza a compartir',
    body: 'Cada parada, una foto. El recuerdo queda para todos.',
  },
]

// Añadir momento (recuerdo): el camino feliz. Subir una foto/lugar, sin montar un
// juego. El reto es una capa opcional, así que aquí el foco es el recuerdo.
const ADD_MOMENT_SLIDES: OnboardingSlide[] = [
  {
    icon: Camera,
    title: 'Guarda un momento',
    body: 'Una foto del sitio donde estás. Sin más.',
  },
  {
    icon: MapPin,
    title: 'Pon dónde fue',
    body: 'El lugar en el mapa: así tus recuerdos cuentan el viaje.',
  },
  {
    icon: Heart,
    title: 'Los tuyos lo viven',
    body: 'Aparece en el viaje al instante para todos.',
  },
]

// Crear reto: el guiño de adivinar. Un momento se puede convertir en reto para
// que los demás adivinen dónde es. Cierra con la idea de COMPARTIR el enlace.
const CREATE_CHALLENGE_SLIDES: OnboardingSlide[] = [
  {
    icon: Target,
    title: 'Lánzales un reto',
    body: 'Sube un sitio y rétales a adivinar dónde es.',
  },
  {
    icon: Timer,
    title: 'Pon cuenta atrás',
    body: 'Tienen un tiempo para acertar. Cuanto más cerca, más puntos.',
  },
  {
    icon: Send,
    title: 'Comparte el enlace',
    body: 'Al crearlo te damos el enlace para pasarlo por el chat.',
  },
]

const SLIDES: Record<OnboardingContext, OnboardingSlide[]> = {
  group: GROUP_SLIDES,
  challenge: CHALLENGE_SLIDES,
  'create-trip': CREATE_TRIP_SLIDES,
  'add-moment': ADD_MOMENT_SLIDES,
  'create-challenge': CREATE_CHALLENGE_SLIDES,
  // El welcome es dinámico (lleva el nombre del viaje); se construye en getSlides.
  welcome: [],
}

// Bienvenida del RECEPTOR (lo clave): el recién llegado por un enlace debe pillar
// en 3 segundos qué es y por qué unirse. Si sabemos el nombre del viaje, lo usamos
// para que el saludo sea suyo ("Estás invitado a <viaje>").
function welcomeSlides(tripName?: string): OnboardingSlide[] {
  const trip = tripName?.trim()
  return [
    {
      icon: Sparkles,
      title: trip ? `Te invitan a vivir ${trip}` : 'Te invitan a un viaje',
      body: 'Te comparten dónde estuvieron para que lo vivas con ellos.',
    },
    {
      icon: MapIcon,
      title: 'Mira cada parada',
      body: 'Una foto de cada sitio. Tú adivinas en el mapa dónde es.',
    },
    {
      icon: LinkIcon,
      title: 'Únete y juega',
      body: 'Ya estás dentro. Abre el viaje y empieza a adivinar.',
    },
  ]
}

export function getSlides(context: OnboardingContext, params?: SlideParams): OnboardingSlide[] {
  if (context === 'welcome') return welcomeSlides(params?.tripName)
  return SLIDES[context]
}
