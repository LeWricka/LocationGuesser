// Contenido de los tutoriales de onboarding (slideshow saltable, primera vez).
// Separado de la UI para que el componente sea presentacional puro y el copy se
// edite sin tocar lógica. Texto en español, claro y breve (sin i18n hoy).
//
// Visual-first: la gente no lee. Cada slide es un icono lucide animado (mini-
// simulación de la acción, ver OnboardingVisual) sobre una imagen REAL de fondo
// (issue #636: los marcos con lienzo vacío quedaban tristes) + un titular corto +
// una frase. La imagen es la captura de producto de LandingShowcase cuando existe
// una que encaja con el gesto (p.ej. "jugar" ↔ la pantalla de resultado real); si
// no hay una captura que encaje, cae a una foto de viaje bonita de homeDemoPins.
// Todo empaquetado en el bundle (imports estáticos), sin red.

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
import homeShot from '../../assets/landing/home.webp'
import resultadoShot from '../../assets/landing/resultado.webp'
import viajeShot from '../../assets/landing/viaje.webp'
import lisboaPhoto from '../home/assets/lisboa.webp'
import tokioPhoto from '../home/assets/tokio.webp'
import nuevaYorkPhoto from '../home/assets/nueva-york.webp'
import sidneyPhoto from '../home/assets/sidney.webp'
import ciudadDelCaboPhoto from '../home/assets/ciudad-del-cabo.webp'
import romaPhoto from '../home/assets/roma.webp'

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
  /** Imagen real de fondo del marco (issue #636): captura de producto o foto de
   * viaje, empaquetada (import estático). Nunca vacía: sustituye al lienzo liso. */
  image: string
}

// Tutorial del viaje (issue #625): los 3 GESTOS clave de Momentu, ni uno más.
// Sustituye a la versión de 4 slides (más genérica); el dueño pidió recortar al
// hueso: compartir un momento, invitar al grupo, jugar un reto.
const GROUP_SLIDES: OnboardingSlide[] = [
  {
    icon: Camera,
    visual: 'card',
    title: 'Sube una foto',
    body: 'Del viaje, del finde, de donde sea. Con el sitio si te apetece.',
    // Sin captura real de "añadir momento" en LandingShowcase: foto de viaje bonita.
    image: lisboaPhoto,
  },
  {
    icon: LinkIcon,
    visual: 'link',
    title: 'Invita a tu gente',
    body: 'Les pasas el enlace del viaje y entran sin complicarse.',
    // Sin captura real del share: foto de viaje bonita.
    image: sidneyPhoto,
  },
  {
    icon: MapPin,
    visual: 'pin',
    title: 'Juega un reto',
    body: '¿Dónde es? Marca en el mapa a contrarreloj. Gana quien más se acerca.',
    // Captura REAL de la pantalla de resultado (puntos + cercanía): es, literalmente,
    // jugar un reto.
    image: resultadoShot,
  },
]

const CHALLENGE_SLIDES: OnboardingSlide[] = [
  {
    icon: Search,
    visual: 'card',
    title: 'Mira las pistas',
    body: 'Carteles, paisaje, detalles… todo cuenta.',
    image: tokioPhoto,
  },
  {
    icon: Pin,
    visual: 'pin',
    title: 'Coloca tu pin',
    body: 'Toca el mapa donde crees que es.',
    image: nuevaYorkPhoto,
  },
  {
    icon: Timer,
    visual: 'timer',
    title: 'Confirma a tiempo',
    body: 'Hay cuenta atrás. Cuanto más cerca, más puntos.',
    // Captura REAL de la pantalla de resultado: encaja con "cuanto más cerca, más puntos".
    image: resultadoShot,
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
    // Captura REAL de la home: es, literalmente, el sitio donde vive el viaje.
    image: homeShot,
  },
  {
    icon: Users,
    visual: 'link',
    title: 'Invita a tu gente',
    body: 'Les pasas un enlace y entran sin complicarse.',
    image: ciudadDelCaboPhoto,
  },
  {
    icon: Camera,
    visual: 'tap',
    title: 'Y empieza a compartir',
    body: 'Cada parada, una foto. El recuerdo queda para todos.',
    image: romaPhoto,
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
    image: romaPhoto,
  },
  {
    icon: MapPin,
    visual: 'pin',
    title: 'Pon dónde fue',
    body: 'El lugar en el mapa: así tus recuerdos cuentan el viaje.',
    // Captura REAL de la home (globo + pin): el lugar en el mapa.
    image: homeShot,
  },
  {
    icon: Sparkles,
    visual: 'spark',
    title: 'Los tuyos lo viven',
    body: 'Aparece en el viaje al instante para todos.',
    // Captura REAL del diario: el momento ya clavado en el viaje compartido.
    image: viajeShot,
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
    image: sidneyPhoto,
  },
  {
    icon: Timer,
    visual: 'timer',
    title: 'Pon cuenta atrás',
    body: 'Tienen un tiempo para acertar. Cuanto más cerca, más puntos.',
    // Captura REAL de la pantalla de resultado: encaja con "cuanto más cerca, más puntos".
    image: resultadoShot,
  },
  {
    icon: Send,
    visual: 'link',
    title: 'Comparte el enlace',
    body: 'Al crearlo te damos el enlace para pasarlo por el chat.',
    image: ciudadDelCaboPhoto,
  },
]

// Tutorial ÚNICO de entrada (issue #742): un solo tutorial que cuenta el BUCLE
// completo de una pasada —guardar un momento → verlo en la bitácora → compartir el
// viaje → crear un reto y compartirlo—, una idea por slide. Sustituye a los
// tutoriales por-pantalla que saltaban de más (al crear viaje, al compartir). No
// reescribe copy: REUTILIZA las slides ya validadas de los flujos, ensartadas en el
// arco pedido por el dueño (así el gesto/copy/imagen de cada paso ya está probado).
const ENTRY_SLIDES: OnboardingSlide[] = [
  ADD_MOMENT_SLIDES[0], // Guarda un momento
  ADD_MOMENT_SLIDES[2], // Aparece en el viaje: verlo en la bitácora
  CREATE_TRIP_SLIDES[1], // Invita a tu gente: comparte el viaje
  CREATE_CHALLENGE_SLIDES[0], // Lánzales un reto: crear el reto
  CREATE_CHALLENGE_SLIDES[2], // Comparte el enlace del reto
]

// Contextos que YA NO usan slides: `welcome` pinta el marco de una pantalla
// `GuestWelcomeFrame` (onboarding nuevo, pieza 1/4; ver `OnboardingGate`),
// `guest-register` es el registro post-valor del invitado (`GuestRegisterPrompt`),
// `reto_share` es la entrada por reto suelto (onboarding nuevo, pieza 2/4:
// RetoShareIntro/RetoShareExplainSequence), y `creador` es el aprender-haciendo
// del creador (onboarding nuevo, pieza 3/4: CreadorIntroFrame/CoachMark/
// MomentChallengeSuggestion/CreadorNudge, ver useCreadorOnboarding) — ninguno
// de los cuatro pasa por `OnboardingGate`. Se excluyen del mapa de slides para
// no arrastrar copy muerto — `getSlides` los cubre con un array vacío.
type SlideContext = Exclude<
  OnboardingContext,
  'welcome' | 'guest-register' | 'reto_share' | 'creador'
>

const SLIDES: Record<SlideContext, OnboardingSlide[]> = {
  entry: ENTRY_SLIDES,
  group: GROUP_SLIDES,
  challenge: CHALLENGE_SLIDES,
  'create-trip': CREATE_TRIP_SLIDES,
  'add-moment': ADD_MOMENT_SLIDES,
  'create-challenge': CREATE_CHALLENGE_SLIDES,
}

export function getSlides(context: OnboardingContext): OnboardingSlide[] {
  if (
    context === 'welcome' ||
    context === 'guest-register' ||
    context === 'reto_share' ||
    context === 'creador'
  )
    return []
  return SLIDES[context]
}
