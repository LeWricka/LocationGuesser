// Contenido de los tutoriales de onboarding (slideshow saltable, primera vez).
// Separado de la UI para que el componente sea presentacional puro y el copy se
// edite sin tocar lógica. Texto en español, claro y breve (sin i18n hoy).
//
// Visual-first: la gente no lee. Cada slide es un icono lucide animado dentro de
// un escenario CSS (mini-simulación de la acción, ver OnboardingVisual) + un
// titular corto + una frase. Sin capturas ni assets externos: todo se dibuja con
// CSS y los iconos de lucide (issue #625).

import {
  Camera,
  Link as LinkIcon,
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

// Mini-simulaciones disponibles (OnboardingVisual.tsx pinta la animación según
// el kind; el icono de la slide es el protagonista de la coreografía). Vocabulario
// acotado a propósito: cada kind se reutiliza en varios contextos para que el
// gesto visual sea reconocible en toda la app, no una animación distinta por slide.
//  - tap:   el icono "se pulsa" (presión + eco) — interactuar/capturar.
//  - card:  el icono asciende y se posa — algo se guarda/aparece.
//  - pin:   el icono cae y aterriza con un eco — ubicar/adivinar en el mapa.
//  - link:  el icono entra desde el lateral — compartir/invitar por enlace.
//  - timer: el icono queda fijo con un eco doble — cuenta atrás.
//  - spark: el icono aparece con un rebote suave — bienvenida/sorpresa.
export type OnboardingVisualKind = 'tap' | 'card' | 'pin' | 'link' | 'timer' | 'spark'

export interface OnboardingSlide {
  /** Icono de Lucide (protagonista de la mini-simulación, ver OnboardingVisual). */
  icon: LucideIcon
  /** Mini-simulación CSS que coreografía el icono (ver OnboardingVisual). */
  visual: OnboardingVisualKind
  title: string
  body: string
}

/** Parámetros opcionales para personalizar slides (p.ej. la bienvenida del receptor). */
export interface SlideParams {
  /** Nombre del viaje, para personalizar la bienvenida del receptor. */
  tripName?: string
}

// Tutorial del viaje (issue #625): los 3 GESTOS clave de Tabide, ni uno más.
// Sustituye a la versión de 4 slides (más genérica); el dueño pidió recortar al
// hueso: compartir un momento, invitar al grupo, jugar un reto.
const GROUP_SLIDES: OnboardingSlide[] = [
  {
    icon: Camera,
    visual: 'card',
    title: 'Comparte un momento',
    body: 'Una foto y/o Street View del sitio donde estuviste.',
  },
  {
    icon: LinkIcon,
    visual: 'link',
    title: 'Invita a tu grupo',
    body: 'Les pasas el enlace del viaje y entran sin complicarse.',
  },
  {
    icon: MapPin,
    visual: 'pin',
    title: 'Juega un reto',
    body: 'El guiño divertido: adivinar en el mapa dónde es. Gana quien más se acerca.',
  },
]

const CHALLENGE_SLIDES: OnboardingSlide[] = [
  {
    icon: Search,
    visual: 'card',
    title: 'Mira las pistas',
    body: 'Carteles, paisaje, detalles… todo cuenta.',
  },
  {
    icon: Pin,
    visual: 'pin',
    title: 'Coloca tu pin',
    body: 'Toca el mapa donde crees que es.',
  },
  {
    icon: Timer,
    visual: 'timer',
    title: 'Confirma a tiempo',
    body: 'Hay cuenta atrás. Cuanto más cerca, más puntos.',
  },
]

// Crear viaje: el viaje es el contenedor social del plan. Antes de montar nada,
// que entienda que es el sitio donde vivirá el plan con los suyos.
const CREATE_TRIP_SLIDES: OnboardingSlide[] = [
  {
    icon: MapPinned,
    visual: 'card',
    title: 'Crea tu viaje',
    body: 'El sitio donde guardas el plan y lo vives con los tuyos.',
  },
  {
    icon: Users,
    visual: 'link',
    title: 'Invita a tu gente',
    body: 'Les pasas un enlace y entran sin complicarse.',
  },
  {
    icon: Camera,
    visual: 'tap',
    title: 'Y empieza a compartir',
    body: 'Cada parada, una foto. El recuerdo queda para todos.',
  },
]

// Añadir momento (recuerdo): el camino feliz. Subir una foto/lugar, sin montar un
// juego. El reto es una capa opcional, así que aquí el foco es el recuerdo.
const ADD_MOMENT_SLIDES: OnboardingSlide[] = [
  {
    icon: Camera,
    visual: 'tap',
    title: 'Guarda un momento',
    body: 'Una foto del sitio donde estás. Sin más.',
  },
  {
    icon: MapPin,
    visual: 'pin',
    title: 'Pon dónde fue',
    body: 'El lugar en el mapa: así tus recuerdos cuentan el viaje.',
  },
  {
    icon: Sparkles,
    visual: 'spark',
    title: 'Los tuyos lo viven',
    body: 'Aparece en el viaje al instante para todos.',
  },
]

// Crear reto: el guiño de adivinar. Un momento se puede convertir en reto para
// que los demás adivinen dónde es. Cierra con la idea de COMPARTIR el enlace.
const CREATE_CHALLENGE_SLIDES: OnboardingSlide[] = [
  {
    icon: Target,
    visual: 'pin',
    title: 'Lánzales un reto',
    body: 'Sube un sitio y rétales a adivinar dónde es.',
  },
  {
    icon: Timer,
    visual: 'timer',
    title: 'Pon cuenta atrás',
    body: 'Tienen un tiempo para acertar. Cuanto más cerca, más puntos.',
  },
  {
    icon: Send,
    visual: 'link',
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
// para que el saludo sea suyo ("Estás invitado a <viaje>"). Solo el PRIMER paso se
// adapta al contexto de invitación; los otros dos son el mismo cierre "mira y
// juega" que el resto de tutoriales (issue #625).
function welcomeSlides(tripName?: string): OnboardingSlide[] {
  const trip = tripName?.trim()
  return [
    {
      icon: Sparkles,
      visual: 'spark',
      title: trip ? `Te invitan a vivir ${trip}` : 'Te invitan a un viaje',
      body: 'Te comparten dónde estuvieron para que lo vivas con ellos.',
    },
    {
      icon: Camera,
      visual: 'card',
      title: 'Mira cada parada',
      body: 'Una foto de cada sitio. Tú adivinas en el mapa dónde es.',
    },
    {
      icon: MapPin,
      visual: 'pin',
      title: 'Únete y juega',
      body: 'Ya estás dentro. Abre el viaje y empieza a adivinar.',
    },
  ]
}

export function getSlides(context: OnboardingContext, params?: SlideParams): OnboardingSlide[] {
  if (context === 'welcome') return welcomeSlides(params?.tripName)
  return SLIDES[context]
}
