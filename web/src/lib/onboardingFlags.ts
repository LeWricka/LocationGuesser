// Persistencia "ya visto" de los tutoriales de onboarding, por usuario y por
// contexto, en localStorage. Lógica de datos pura (sin React): el hook
// useOnboarding la consume. Cada tutorial debe verse UNA sola vez por usuario.
//
// Clave por usuario para que dos cuentas en el mismo navegador no se pisen el
// estado de "visto". Sin sesión usamos una clave global (mejor que nada: si el
// usuario aún no tiene id, igual no queremos repetir el tutorial en cada visita).

export type OnboardingContext = 'group' | 'challenge'

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
