// Observabilidad (Sentry) — punto ÚNICO de acceso a la captura de errores. Igual
// que `analytics.ts`: el resto del código importa `reportError` desde aquí, nada
// del SDK directo fuera de esta lib.
//
// CARGA DIFERIDA (perf): `@sentry/react` se importaba de forma estática y entraba
// en el bundle inicial. Ahora se carga con `import()` dinámico tras el montaje
// (Vite lo separa en su propio chunk) y mientras tanto setUser/reportError se
// ENCOLAN y se reproducen al cargar. Así la captura de errores sigue intacta sin
// lastrar el camino crítico de la landing.
//
// Idempotente y a prueba de "no inicializado": todo lo público pasa por el guard
// `armed`, así llamar a reportError/setUser antes de cargar (o en tests, o sin
// DSN) es seguro.
//
// El DSN de Sentry es público (va en el cliente, como la publishable key de
// Supabase y el token de Mixpanel). Sin `VITE_SENTRY_DSN` la observabilidad
// queda DESACTIVADA (no-op), así la app arranca igual en local sin configurar.

type SentryApi = typeof import('@sentry/react')

const dsn = import.meta.env.VITE_SENTRY_DSN

// Apagamos Sentry cuando: no hay DSN, estamos en tests (unit/E2E no deben mandar
// errores) o el entorno desactiva la analítica (mismo interruptor que Mixpanel).
const disabledByEnv = import.meta.env.VITE_ANALYTICS_DISABLED === 'true'
const isTest = import.meta.env.MODE === 'test'

// `armed` = activa (DSN presente, no test, no desactivada) y hemos pedido cargar
// el SDK. `sentry` = la API ya cargada e inicializada (null hasta entonces).
let armed = false
let sentry: SentryApi | null = null

// Cola de operaciones pendientes hasta que el SDK cargue (setUser, captura). Se
// reproducen en orden al estar listo, así no se pierde ningún error temprano.
const queue: ((s: SentryApi) => void)[] = []

function enqueue(op: (s: SentryApi) => void): void {
  if (sentry) {
    op(sentry)
    return
  }
  if (armed) queue.push(op)
  // Si no está armado (sin DSN / test / desactivado), es un no-op silencioso.
}

// Carga e inicializa el SDK real una sola vez; al estar listo, vacía la cola.
async function loadSentry(): Promise<void> {
  if (sentry) return
  const Sentry = await import('@sentry/react')
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // No enviamos datos personales por defecto (ni IP ni cabeceras del usuario).
    sendDefaultPii: false,
    // No activamos Session Replay de Sentry: ya tenemos el de Mixpanel. Con la
    // captura de errores basta para el dashboard.
    // Ruido conocido del navegador, jamás accionable (LOCATIONGUESSER-12): el
    // navegador salta una View Transition si la pestaña pasa a segundo plano en
    // pleno cruce. No es un fallo nuestro y le pasará a cualquier usuario que
    // minimice a mitad de animación — fuera del dashboard.
    ignoreErrors: ['View transition was skipped because document visibility state is hidden'],
    // Ruido ambiental de Safari/iOS (LOCATIONGUESSER-4): "NotReadableError: The
    // I/O read operation failed" como REJECTION sin capturar y sin stack — el
    // almacenamiento del navegador (Cache API/IndexedDB del SW) falla al leer
    // tras una expulsión de iOS. No accionable. Se filtra SOLO el caso sin
    // capturar: los fallos de lectura de fotos del pipeline de subida se
    // reportan aparte con contexto propio (reportAndThrow) y siguen entrando.
    beforeSend(event, hint) {
      const original = hint?.originalException
      const esNotReadable = original instanceof DOMException && original.name === 'NotReadableError'
      const sinCapturar = event.exception?.values?.[0]?.mechanism?.handled === false
      if (esNotReadable && sinCapturar) return null
      return event
    },
  })
  sentry = Sentry
  for (const op of queue.splice(0)) op(Sentry)
}

/**
 * Activa la observabilidad (idempotente). No-op si no hay DSN, en tests
 * (MODE === 'test') o si VITE_ANALYTICS_DISABLED === 'true'. Llamar desde
 * main.tsx: NO carga el SDK de inmediato, lo difiere con `import()` dinámico
 * para no lastrar el camino crítico. Hasta entonces, setUser/reportError se
 * encolan (no se pierde nada).
 */
export function initObservability(): void {
  if (armed) return
  if (!dsn || isTest || disabledByEnv) return
  armed = true
  void loadSentry()
}

/**
 * Asocia los errores al usuario autenticado (id estable de Supabase Auth). Se
 * encola si el SDK aún no cargó. No-op si la observabilidad no está activa.
 * Engancharlo donde se identifica a Mixpanel.
 */
export function setObservabilityUser(id: string): void {
  enqueue((s) => s.setUser({ id }))
}

/** Limpia el usuario asociado (logout). Se encola si el SDK aún no cargó. No-op si no está activa. */
export function clearObservabilityUser(): void {
  enqueue((s) => s.setUser(null))
}

/**
 * Normaliza cualquier valor a un `Error` REAL para Sentry. Motivo (LOCATIONGUESSER-1A):
 * Sentry titula/agrupa/busca por el `message` de un `Error`; los errores de
 * Supabase/PostgREST son OBJETOS PLANOS (`{ message, code, details, hint }`), no
 * `Error`, así que `captureException(objeto)` los guardaba como "Object captured as
 * exception with keys: …" — irreconocibles y NO searchable (así se ocultó el RLS
 * 42501 de `moment_images`). Convertimos a un `Error` con el `message` y el `code`
 * en el nombre; devolvemos `code/details/hint` como extra para no perderlos.
 * Un `Error` de verdad se devuelve tal cual (comportamiento intacto).
 */
export function toReportableError(error: unknown): {
  error: Error
  extra?: Record<string, unknown>
} {
  if (error instanceof Error) return { error }
  if (error && typeof error === 'object') {
    const o = error as Record<string, unknown>
    const message = typeof o.message === 'string' && o.message.length > 0 ? o.message : null
    if (message) {
      const normalized = new Error(message)
      if (typeof o.code === 'string' && o.code.length > 0) {
        // p.ej. 'SupabaseError(42501)': distingue la CLASE sin ensuciar el message.
        normalized.name = `SupabaseError(${o.code})`
      }
      const extra: Record<string, unknown> = {}
      for (const key of ['code', 'details', 'hint'] as const) {
        if (o[key] != null) extra[key] = o[key]
      }
      return { error: normalized, extra: Object.keys(extra).length > 0 ? extra : undefined }
    }
  }
  // Primitivo u objeto sin `message`: preserva algo legible sin arriesgar circulares.
  const fallback = typeof error === 'string' ? error : safeStringify(error)
  return { error: new Error(fallback) }
}

function safeStringify(value: unknown): string {
  try {
    return `Non-Error: ${JSON.stringify(value)}`
  } catch {
    return `Non-Error: ${String(value)}`
  }
}

/**
 * Captura manual de un error con contexto opcional (área, ids…). Se encola si el
 * SDK aún no cargó. No-op si la observabilidad no está activa. Útil en `catch`
 * donde queremos registrar el fallo aunque la UI lo maneje con un toast. Normaliza
 * los no-`Error` (p.ej. errores de Supabase) para que salgan legibles en Sentry.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  const { error: normalized, extra } = toReportableError(error)
  const merged = { ...extra, ...context }
  const hasExtra = Object.keys(merged).length > 0
  enqueue((s) => s.captureException(normalized, hasExtra ? { extra: merged } : undefined))
}

/**
 * Deja constancia de un evento ESPERABLE (issue #760: recurso borrado entre que
 * se abrió la pantalla y se actuó) sin mandarlo como excepción — así no infla el
 * dashboard de errores con algo que no es un fallo, pero sigue siendo rastreable
 * si aparece justo antes de una excepción real. Se encola si el SDK aún no
 * cargó. No-op si la observabilidad no está activa.
 */
export function addBreadcrumb(message: string, data?: Record<string, unknown>): void {
  enqueue((s) => s.addBreadcrumb({ message, level: 'info', data }))
}

/**
 * Deja constancia de un fallo NO crítico (mejora progresiva: registro/
 * actualización del service worker, precarga de un chunk…) sin mandarlo a
 * Sentry como error — solo un breadcrumb, visible en el timeline de la
 * siguiente captura real (`reportError`) pero sin generar una alerta por algo
 * transitorio (red, ventana de deploy). Se encola si el SDK aún no cargó.
 * No-op si la observabilidad no está activa.
 */
export function reportSilentWarning(message: string, data?: Record<string, unknown>): void {
  enqueue((s) => s.addBreadcrumb({ category: 'silent-warning', level: 'warning', message, data }))
}
