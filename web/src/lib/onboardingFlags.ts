// Persistencia "ya visto" de los tutoriales de onboarding, por usuario y por
// contexto, en localStorage. Lógica de datos pura (sin React): el hook
// useOnboarding la consume. Cada tutorial debe verse UNA sola vez por usuario.
//
// Clave por usuario para que dos cuentas en el mismo navegador no se pisen el
// estado de "visto". Sin sesión usamos una clave global (mejor que nada: si el
// usuario aún no tiene id, igual no queremos repetir el tutorial en cada visita).
//
// DIAGNÓSTICO (issue #625, "los tutoriales saltan CADA login"):
//  - La clave YA incluye el user.id (línea de abajo) desde el primer commit de
//    esta feature (#137); `useOnboarding.test.ts` ya cubre "cada usuario es
//    independiente". NO es un flag global sin clave de usuario, y ningún código
//    de signOut (lib/auth.ts) borra estas claves: se descartó esa hipótesis.
//  - Causa real nº 1 (puntual, no en cada login): `clearLegacyAnonymousSession`
//    (lib/auth.ts) fuerza `signOut()` sobre cualquier sesión anónima heredada del
//    modelo pre-#507. Ese usuario re-entra con una cuenta PERMANENTE nueva → un
//    `user.id` DISTINTO al de su sesión anónima → su flag antiguo nunca casa con
//    el nuevo id y ve el tutorial una vez más. Es un reseteo de una sola vez para
//    esa cohorte de migración, no una repetición perpetua.
//  - Causa real nº 2 (la que explica "cada vez"): el canal de distribución del
//    producto es el enlace compartido en WhatsApp. El navegador embebido de
//    WhatsApp (sobre todo en iOS) puede abrir cada enlace en un contexto de
//    almacenamiento EFÍMERO: ni la sesión de Supabase ni este flag (ambos en
//    localStorage) sobreviven entre aperturas separadas del mismo enlace. Por eso
//    el dueño ve tanto el login repetido (hay que repetir el código OTP) como el
//    tutorial repetido: no es que la clave esté mal, es que el propio storage no
//    persiste en ese contexto. localStorage por user.id es "lo mejor que hay" en
//    ese entorno, pero no puede resolverlo del todo.
//  - Mejora futura (fuera de alcance de #625, sin migración aquí): una columna
//    `profiles.onboarded_at` (o una por contexto) persistiría en servidor y
//    sobreviviría a cualquier storage de cliente, incl. el navegador embebido de
//    WhatsApp y el multi-dispositivo. localStorage por user.id queda como capa
//    inmediata; el server-side es la solución de fondo.

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
