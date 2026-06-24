// Observabilidad (Sentry) — punto ÚNICO de acceso a la captura de errores. Igual
// que `analytics.ts`: el resto del código importa `reportError` desde aquí, nada
// del SDK directo fuera de esta lib.
//
// Idempotente y a prueba de "no inicializado": todo lo público pasa por el guard
// `enabled`, así llamar a reportError/setUser antes de init (o en tests, o sin
// DSN) es un no-op seguro en vez de petar.
//
// El DSN de Sentry es público (va en el cliente, como la publishable key de
// Supabase y el token de Mixpanel). Sin `VITE_SENTRY_DSN` la observabilidad
// queda DESACTIVADA (no-op), así la app arranca igual en local sin configurar.

import * as Sentry from '@sentry/react'

const dsn = import.meta.env.VITE_SENTRY_DSN

// Apagamos Sentry cuando: no hay DSN, estamos en tests (unit/E2E no deben mandar
// errores) o el entorno desactiva la analítica (mismo interruptor que Mixpanel).
const disabledByEnv = import.meta.env.VITE_ANALYTICS_DISABLED === 'true'
const isTest = import.meta.env.MODE === 'test'

// Estado de inicialización: solo arrancamos una vez y solo entonces las funciones
// públicas hacen algo real.
let enabled = false

/**
 * Inicializa Sentry una sola vez (idempotente). No-op si no hay DSN, en tests
 * (MODE === 'test') o si VITE_ANALYTICS_DISABLED === 'true'. Llamar desde
 * main.tsx antes de montar la app.
 */
export function initObservability(): void {
  if (enabled) return
  if (!dsn || isTest || disabledByEnv) return

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // No enviamos datos personales por defecto (ni IP ni cabeceras del usuario).
    sendDefaultPii: false,
    // No activamos Session Replay de Sentry: ya tenemos el de Mixpanel. Con la
    // captura de errores basta para el dashboard.
  })
  enabled = true
}

/**
 * Asocia los errores al usuario autenticado (id estable de Supabase Auth). No-op
 * si la observabilidad no está activa. Engancharlo donde se identifica a Mixpanel.
 */
export function setObservabilityUser(id: string): void {
  if (!enabled) return
  Sentry.setUser({ id })
}

/** Limpia el usuario asociado (logout). No-op si no está activa. */
export function clearObservabilityUser(): void {
  if (!enabled) return
  Sentry.setUser(null)
}

/**
 * Captura manual de un error con contexto opcional (área, ids…). No-op si la
 * observabilidad no está activa. Útil en `catch` donde queremos registrar el
 * fallo aunque la UI lo maneje con un toast.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return
  Sentry.captureException(error, context ? { extra: context } : undefined)
}
