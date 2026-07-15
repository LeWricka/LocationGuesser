// Barril de la feature de auth/onboarding. App.tsx consume desde aquí.
export { Landing } from './Landing'
export { LoginFlow } from './LoginFlow'
export { ProfileGate } from './ProfileGate'
export { useDeepLinkJoin } from './useDeepLinkJoin'
export { needsProfileStep } from './profileStep'
// Receptor sin cuenta (issue #758): "guárdate" vincula el anónimo a un email.
export { AccountUpgradeModal } from './AccountUpgradeModal'
export { useAccountUpgrade } from './useAccountUpgrade'
