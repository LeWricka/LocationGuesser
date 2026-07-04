// Barril del UI kit. Importa desde aquí: `import { Button, Card } from '../ui'`.
//
// Fase 1 del rediseño añade:
//   - Paleta Grafito+teal en tokens.css (propagada automáticamente a toda la app).
//   - Iconos custom de marca (web/src/ui/icons/).
//   - 3 shells de pantalla (web/src/ui/shells/).
// Las pantallas de feature no se tocan todavía (Fase 2).

export { Button } from './Button'
export { FileButton } from './FileButton'
export { Input } from './Input'
export { DatePicker } from './DatePicker'
export { Field } from './Field'
export { Card } from './Card'
export { Modal } from './Modal'
export { Lightbox } from './Lightbox'
export { Badge } from './Badge'
export { Spinner } from './Spinner'
export { Skeleton } from './Skeleton'
export { CountUp } from './CountUp'
export { ScoreRing } from './ScoreRing'
export { CountdownRing } from './CountdownRing'
export { Stack } from './Stack'
export { Row } from './Row'
export { ToastProvider } from './ToastProvider'
export { useToast } from './toast-context'
export type { ToastApi, ToastOptions, ToastTone } from './toast-context'
export { withViewTransition, useReducedMotion } from './motion'
export { Icon } from './Icon'
// Reproductor mínimo de audio (nota de voz, #648): play/pausa + progreso +
// duración. Presentacional (recibe una URL ya resuelta); lo usan el preview de
// `VoiceRecorder` (features/create) y la vista de `MomentSheet` (features/trip).
export { AudioPlayer } from './AudioPlayer'

// Fundamentos del rediseño (Oleada 0): cabecera única, hoja inferior formal,
// control segmentado, número+unidad, chip y banner. Antes existían pero no se
// exportaban; los flujos de crear (Oleada 3) los consumen desde aquí.
export { AppHeader } from './AppHeader'
export { BottomSheet } from './BottomSheet'
export { SegmentedControl } from './SegmentedControl'
export type { SegmentedOption } from './SegmentedControl'
export { UnitInput } from './UnitInput'
export type { Unit } from './UnitInput'
export { Chip } from './Chip'
export { Banner } from './Banner'

// Pantallas y piezas de "Cuentas + Home" (presentacionales; las cablean #3/#4/#5).
export { Avatar } from './Avatar'
// Fila de avatares solapados del grupo del viaje (issue #543): la usa la tarjeta
// de la home; reutilizable por cualquier otra pantalla que necesite "aquí está
// tu grupo" sin repetir el patrón de solape/chip "+N".
export { AvatarStack } from './AvatarStack'
export type { AvatarStackMember } from './AvatarStack'
export { GroupCard } from './GroupCard'
export type { GroupStatus } from './GroupCard'
export { CreateGroupFab } from './CreateGroupFab'
export { BackHomeButton } from './BackHomeButton'
export { ChallengePhoto } from './ChallengePhoto'
export { PhotoStrip } from './PhotoStrip'
export type { PhotoStripItem } from './PhotoStrip'
export { HomeEmptyState } from './HomeEmptyState'
export { HowItWorks } from './HowItWorks'
export { HowItWorksImmersive } from './HowItWorksImmersive'
export { HomeDashboard } from './HomeDashboard'
export type { HomeGroup, HomeGroupMember, HomePinned } from './HomeDashboard'
// Patrón globo + hoja (Home deslogueada y logueada): globo héroe + hoja blanca (#343).
export { GlobeSheet } from './GlobeSheet'
export { HomeGlobe } from './HomeGlobe'
export type { GlobePin } from './HomeGlobe'
export { AuthScreen } from './AuthScreen'
export { LoginScreen } from './LoginScreen'
export { EnterCode } from './EnterCode'
export { ProfileStep } from './ProfileStep'

// Estados vacíos y de carga reutilizables (issue #156).
export { EmptyState } from './EmptyState'
export { SkeletonCard } from './SkeletonCard'

// Estado de carga de los mapas: cubre el lienzo mientras cargan las teselas
// (globo del viaje, plano de fallback y mapa de jugar) — issue #433.
export { MapSkeleton } from './MapSkeleton'

// Skeletons de fallback de <Suspense> por familia de ruta (viaje/jugar/
// utilitario), en vez del spinner genérico único — issue #526.
export { TripRouteSkeleton, PlayRouteSkeleton, UtilityRouteSkeleton } from './RouteSkeletons'

// Aviso "hay versión nueva" tras un deploy PWA (#549). Se monta en su propio root
// desde main.tsx, no dentro de `<App/>`; se exporta igual para poder testearlo
// como cualquier otro componente del kit.
export { UpdateBanner } from './UpdateBanner'

// ── Fase 1 del rediseño ────────────────────────────────────────────────────

// Iconos custom de marca Momentu. Set propio con carácter (pin, globo, diana,
// trofeo, cámara, reto, medalla, candado, confeti, GPS, calendario). Acento teal
// en detalles con significado semántico. Fase 2 (issue #686): ya sustituye a
// lucide en varios sitios de cara al usuario (ver `IconCalendario`).
export {
  IconPin,
  IconGlobe,
  IconDiana,
  IconTrofeo,
  IconCamara,
  IconReto,
  IconMedalla,
  IconCandado,
  IconConfeti,
  IconGps,
  IconCalendario,
  LogoMomentu,
  WordmarkMomentu,
} from './icons'

// Shells de pantalla: la capa de composición que codifica las reglas duras de
// backdrop+hoja+caption para que los bugs de vacío negro y caption huérfano
// no puedan reaparecer en ninguna pantalla nueva.
//   ShellInmersivo  → protagonista visual a sangre (mapa, SV, foto)
//   ShellUtilitario → hoja limpia sin protagonista (formularios, auth)
//   ShellFeed       → cabecera fija + lista/feed con scroll
export { ShellInmersivo, ShellUtilitario, ShellFeed } from './shells'
