// Persistencia "ya visto" de los tutoriales de onboarding, por usuario y por
// contexto, en localStorage. Lógica de datos pura (sin React): el hook
// useOnboarding la consume. Cada tutorial debe verse UNA sola vez por usuario.
//
// Clave por usuario para que dos cuentas en el mismo navegador no se pisen el
// estado de "visto". Sin sesión usamos una clave global (mejor que nada: si el
// usuario aún no tiene id, igual no queremos repetir el tutorial en cada visita).

// Contextos de onboarding. Cada uno tiene su tutorial y su flag "ya visto":
//  - group / challenge: pantallas de viaje y de jugar (ya existían).
//  - welcome: bienvenida del RECEPTOR que llega por un enlace compartido la
//    primera vez (lo más importante: entender en 3 s qué es y por qué unirse).
//  - create-trip / add-moment / create-challenge: intro de cada flujo de
//    creación la primera vez que se entra en él.
export type OnboardingContext =
  | 'group'
  | 'challenge'
  | 'welcome'
  | 'create-trip'
  | 'add-moment'
  | 'create-challenge'

// Construye la clave de localStorage para un contexto y usuario dados. Sin
// userId caemos a 'anon' (clave global de navegador).
function flagKey(context: OnboardingContext, userId?: string | null): string {
  return `lg:onboarding:${context}:seen:${userId ?? 'anon'}`
}

/** ¿Ya vio este usuario el tutorial de este contexto? */
export function hasSeenOnboarding(context: OnboardingContext, userId?: string | null): boolean {
  try {
    return localStorage.getItem(flagKey(context, userId)) === '1'
  } catch {
    // En modo privado o con storage bloqueado, no bloqueamos la app: tratamos
    // como "no visto" (a lo sumo el tutorial reaparece, nunca rompe).
    return false
  }
}

/** Marca el tutorial de este contexto como visto para este usuario. */
export function markOnboardingSeen(context: OnboardingContext, userId?: string | null): void {
  try {
    localStorage.setItem(flagKey(context, userId), '1')
  } catch {
    // Si el storage no está disponible, lo dejamos pasar en silencio.
  }
}
