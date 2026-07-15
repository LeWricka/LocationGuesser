// Barril de la feature de auth/onboarding. App.tsx consume desde aquí.
export { Landing } from './Landing'
export { LoginFlow } from './LoginFlow'
export { ProfileGate } from './ProfileGate'
export { useDeepLinkJoin } from './useDeepLinkJoin'
export { needsProfileStep } from './profileStep'
// Receptor sin cuenta (issue #758): "guárdate" vincula el anónimo a un email.
export { AccountUpgradeModal } from './AccountUpgradeModal'
export { useAccountUpgrade } from './useAccountUpgrade'
// Identidad del receptor durante todo el viaje (issue #756): nombre repetido →
// puerta de recuperación en vez de duplicado en el marcador.
export { RecoverIdentityModal } from './RecoverIdentityModal'
// Capacidad/config/permiso/suscripción de push (issue #769): compartido entre
// `PushNotificationsControl` (gestión, en el perfil) y los pre-prompts de
// descubrimiento (`PushOptInPrompt`, en features/trip).
export { usePushAvailability } from './usePushAvailability'
export type { PushAvailability } from './usePushAvailability'
