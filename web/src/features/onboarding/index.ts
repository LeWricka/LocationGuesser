// Barril de la feature de onboarding. App.tsx consume desde aquí.
export { OnboardingGate } from './OnboardingGate'
export { OnboardingSlideshow } from './OnboardingSlideshow'
export { OnboardingVisual } from './OnboardingVisual'
export { ReceptorWelcomeGate } from './ReceptorWelcomeGate'
export { useOnboarding } from './useOnboarding'
export { useReceptorWelcome } from './useReceptorWelcome'
export { getSlides } from './slides'
export type { OnboardingSlide, OnboardingVisualKind } from './slides'
// Marco de bienvenida del invitado (una pantalla) + registro post-valor
// (onboarding nuevo, pieza 1/4).
export { GuestWelcomeFrame } from './GuestWelcomeFrame'
export type { Props as GuestWelcomeFrameProps } from './GuestWelcomeFrame'
export { GuestRegisterPrompt } from './GuestRegisterPrompt'
export { useGuestRegisterPrompt } from './useGuestRegisterPrompt'
// Entrada por RETO COMPARTIDO (onboarding nuevo, pieza 2/4): intro mínima antes
// de jugar.
export { RetoShareIntro } from './RetoShareIntro'
// Guía tras el resultado del reto compartido (rediseño #891): UN coach-mark que
// señala el resultado real; "Siguiente" lleva al viaje real y arranca allí el
// tour (Diario → Bitácora → Marcador), "Saltar" cae en el Marcador.
export { RetoShareGuide } from './RetoShareGuide'
export { useRetoShareOnboarding } from './useRetoShareOnboarding'
// Onboarding del CREADOR — aprender-haciendo (onboarding nuevo, pieza 3/4):
// intro de una pantalla, coach-mark reutilizable anclado a un elemento REAL (lo
// usan tanto el "+" como la sugerencia de convertir el primer momento en reto y
// el remate sobre la barra de pestañas) y el aviso de compartir. Enganchado en
// TripPage.
export { CreadorIntroFrame } from './CreadorIntroFrame'
// Marco de bienvenida del usuario NUEVO (issue #905): "Esto es Momentu" en la
// home vacía; "Ver cómo funciona" arranca el recorrido del viaje de ejemplo.
export { NuevoBienvenidaFrame } from './NuevoBienvenidaFrame'
export type { Props as NuevoBienvenidaFrameProps } from './NuevoBienvenidaFrame'
export { CoachMark } from './CoachMark'
export type { CoachMarkProps } from './CoachMark'
export { CreadorNudge } from './CreadorNudge'
export { useCreadorOnboarding } from './useCreadorOnboarding'
export type { CreadorStage, UseCreadorOnboarding } from './useCreadorOnboarding'
// Guía CONDUCIDA del viaje de ejemplo (onboarding nuevo, pieza 4/4): recorre
// Diario → un momento → Bitácora → Marcador/Retos → La liga → un reto,
// encadenando `CoachMark` sobre elementos reales. Enganchada en TripPage.
export { GuidedTour } from './GuidedTour'
export type { TourStep } from './GuidedTour'
