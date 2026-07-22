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
// de jugar + explicación de Momentu/puente al viaje/registro tras el resultado.
export { RetoShareIntro } from './RetoShareIntro'
export { RetoShareExplainSequence } from './RetoShareExplainSequence'
export { useRetoShareOnboarding } from './useRetoShareOnboarding'
