// Snooze + gate de visibilidad del pre-prompt de push (issue #769). Puro: NO
// toca Notification/pushManager (eso vive en lib/push.ts) ni React (eso vive en
// features/auth/usePushAvailability.ts) — así el cálculo "¿toca mostrarlo?" es
// testeable sin jsdom con APIs de navegador ni montar componentes.

const SNOOZE_KEY = 'lg.pushPrompt.snoozeUntil'
const SNOOZE_DAYS = 7

/** ¿Está el pre-prompt en snooze ahora mismo? (se descartó hace menos de `days` días). */
export function isPushPromptSnoozed(now: number = Date.now()): boolean {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY)
    if (!raw) return false
    const until = Number(raw)
    return Number.isFinite(until) && now < until
  } catch {
    // Sin storage (modo privado, etc.): no se puede recordar el snooze — no
    // bloqueamos, el prompt podría reofrecerse (aceptable, nunca rompe la app).
    return false
  }
}

/**
 * Descarta el pre-prompt durante `days` días (por defecto 7, "no naggear").
 * Comparte UNA sola clave entre las dos superficies (banner del viaje y
 * post-reveal): descartarlo en una calla también la otra.
 */
export function snoozePushPrompt(days: number = SNOOZE_DAYS, now: number = Date.now()): void {
  try {
    localStorage.setItem(SNOOZE_KEY, String(now + days * 24 * 60 * 60 * 1000))
  } catch {
    // Sin storage: no se puede snoozear; no bloqueamos el descarte visual (X).
  }
}

/** Entradas mínimas para decidir si el pre-prompt debe mostrarse (issue #769). */
export interface PushPromptGate {
  /** ¿Hay clave VAPID configurada en el bundle? (isPushConfigured). */
  configured: boolean
  /** ¿Tiene este navegador las APIs de Web Push? (isBrowserPushCapable). */
  capable: boolean
  /** Permiso actual de Notification, o 'unsupported' si no aplica. */
  permission: 'default' | 'granted' | 'denied' | 'unsupported'
  /** ¿Hay ya una PushSubscription activa en este dispositivo? */
  subscribed: boolean
  /** ¿Aún resolviendo el estado inicial (permiso/suscripción)? */
  loading: boolean
}

/**
 * Condición de mostrar el pre-prompt (issue #769): configurado + navegador
 * capaz + permiso 'default' (nunca preguntado) + sin suscripción activa + sin
 * snooze. En iOS sin instalar (`capable` false) esto es SIEMPRE false — la
 * invitación a instalar la PWA es #237/Fase 4, fuera de alcance aquí. Con
 * permiso 'granted'/'denied' tampoco se muestra: ya se decidió (activado en
 * otra pantalla, o denegado — reofrecerlo ahí sería inútil e insistente).
 */
export function shouldShowPushPrompt(gate: PushPromptGate): boolean {
  if (gate.loading) return false
  if (!gate.configured || !gate.capable) return false
  if (gate.permission !== 'default') return false
  if (gate.subscribed) return false
  return !isPushPromptSnoozed()
}
