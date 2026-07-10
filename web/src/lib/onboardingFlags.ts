// Persistencia "ya visto" de los tutoriales de onboarding, por usuario y por
// contexto. Lógica de datos pura (sin React): el hook useOnboarding la
// consume. Cada tutorial debe verse UNA sola vez por usuario.
//
// DIAGNÓSTICO (issue #625, "los tutoriales saltan CADA login") Y ARREGLO DE
// RAÍZ (issue #717, "los tutoriales aparecen muchas veces en vez de una sola"):
//  - La clave de localStorage YA incluye el user.id desde el primer commit de
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
//    tutorial repetido: no es que la clave esté mal, es que el propio storage NO
//    PERSISTE en ese contexto. Ninguna de las dos causas se arregla desde el
//    cliente puro: hace falta que el "visto" viaje con la CUENTA, no con el
//    navegador.
//  - ARREGLO DE RAÍZ (#717): `profiles.onboarding` (jsonb, migración 0039)
//    persiste el "visto" en SERVIDOR, por cuenta — sobrevive a cualquier storage
//    efímero de cliente y al multi-dispositivo. `hasSeenOnboarding` acepta ahora
//    el mapa del perfil como fuente de la verdad (ver lib/profile.ts,
//    `persistOnboardingSeen`); localStorage pasa a ser SOLO una caché rápida
//    anti-parpadeo (y la única fuente para el receptor anónimo pre-login, que
//    aún no tiene fila de perfil).

// Contextos de onboarding. Cada uno tiene su tutorial y su flag "ya visto":
//  - entry: tutorial ÚNICO de entrada (issue #742). Cubre el bucle completo
//    (guardar un momento → verlo en la bitácora → compartir el viaje → crear un
//    reto y compartirlo) y se muestra una sola vez al aterrizar en la home vacía;
//    reabrible con "Ver tutorial". Sustituye a los tutoriales por-pantalla que
//    saltaban de más al crear viaje/reto (gates retirados de App.tsx).
//  - welcome: bienvenida del RECEPTOR que llega por un enlace compartido la
//    primera vez (lo más importante: entender en 3 s qué es y por qué unirse).
//  - group / challenge / create-trip / add-moment / create-challenge: contextos
//    de los tutoriales por-pantalla ANTIGUOS (issue #742: ya no se disparan desde
//    App.tsx). Se conservan para el flag "visto" del receptor (ReceptorWelcomeGate
//    marca `group`) y para no romper histórico; el único tutorial en vivo es
//    `entry` (+ `welcome` para el invitado).
export type OnboardingContext =
  | 'entry'
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

/**
 * ¿Ya vio este usuario el tutorial de este contexto? Combina las dos fuentes
 * (#717): si el PERFIL (servidor) dice visto, es definitivo — nunca se vuelve
 * a mostrar aunque el localStorage de este navegador esté vacío (otro
 * dispositivo, storage efímero de WhatsApp, modo privado…). Si el perfil no
 * dice nada (columna recién migrada, sin sesión, o aún no ha llegado), cae al
 * caché local — así un "visto" ya registrado antes de esta migración no
 * revive el tutorial para nadie.
 */
export function hasSeenOnboarding(
  context: OnboardingContext,
  userId?: string | null,
  profileOnboarding?: Record<string, string> | null,
): boolean {
  if (profileOnboarding?.[context]) return true
  try {
    return localStorage.getItem(flagKey(context, userId)) === '1'
  } catch {
    // En modo privado o con storage bloqueado, no bloqueamos la app: tratamos
    // como "no visto" (a lo sumo el tutorial reaparece, nunca rompe).
    return false
  }
}

/**
 * Marca el tutorial de este contexto como visto para este usuario, SOLO en la
 * caché local (inmediata, anti-parpadeo). El "visto" de fondo en el perfil lo
 * escribe `persistOnboardingSeen` (lib/profile.ts), que llama a esta función
 * además de escribir en servidor.
 */
export function markOnboardingSeen(context: OnboardingContext, userId?: string | null): void {
  try {
    localStorage.setItem(flagKey(context, userId), '1')
  } catch {
    // Si el storage no está disponible, lo dejamos pasar en silencio.
  }
}
