// Web Push (PWA Fase 1) — suscripción del cliente. Punto ÚNICO de acceso a la
// API de notificaciones: la UI importa de aquí, nunca llama a Notification /
// pushManager directamente. Diseño: docs/estrategia/pwa-push.md §1.2/§3.
//
// ADITIVO Y A PRUEBA DE "NO CONFIGURADO": si falta VITE_VAPID_PUBLIC_KEY (o en
// tests), TODO queda no-op: isPushSupported() devuelve false y la UI no ofrece la
// opción. Así la app funciona EXACTAMENTE igual en el navegador sin push.
//
// El ENVÍO real de notificaciones (Edge Function + VAPID privada) es la Fase 2.

import { supabase } from './supabase'

// Clave pública VAPID (va en el bundle por diseño, como la publishable de
// Supabase). Sin ella no hay suscripción posible → push desactivado.
const vapidPublicKey = (import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').trim()

// En tests no tocamos APIs del navegador ni red: todo no-op (igual que analytics).
const isTest = import.meta.env.MODE === 'test'

/** Estado resultante de intentar suscribir/desuscribir, para que la UI decida qué mostrar. */
export type PushStatus = 'unsupported' | 'denied' | 'default' | 'subscribed' | 'unsubscribed'

/**
 * ¿Puede este navegador recibir Web Push Y está la app configurada para ello?
 * Exige service worker + PushManager + Notification en window Y una clave VAPID.
 * No-op (false) en tests o sin clave: la UI entonces ni ofrece la opción.
 */
export function isPushSupported(): boolean {
  if (isTest || !vapidPublicKey) return false
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** Permiso actual de notificaciones, o 'unsupported' si no aplica. */
export function getPermission(): 'default' | 'granted' | 'denied' | 'unsupported' {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission
}

/**
 * Pide permiso (si hace falta), suscribe contra el push service del navegador con
 * la VAPID pública y PERSISTE la suscripción en `push_subscriptions` (upsert por
 * endpoint, para no duplicar al re-suscribir el mismo dispositivo). Devuelve el
 * estado para que la UI reaccione. No-op si no hay soporte/clave.
 */
export async function subscribeToPush(userId: string): Promise<PushStatus> {
  if (!isPushSupported()) return 'unsupported'

  // El permiso es irreversible por API si se deniega: la UI debe pre-preguntar
  // antes de llamar aquí (ver pwa-push.md §3). Aquí solo lo solicitamos.
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return permission === 'denied' ? 'denied' : 'default'
  }

  // El SW lo registra vite-plugin-pwa (injectRegister 'auto'); esperamos a que
  // esté activo antes de suscribir.
  const registration = await navigator.serviceWorker.ready

  // Reutiliza la suscripción existente si la hay (no re-suscribe en balde).
  const existing = await registration.pushManager.getSubscription()
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      // Obligatorio: todo push muestra notificación visible (no push silencioso).
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }))

  const { endpoint, keys } = toStoredSubscription(subscription)
  const { error } = await supabase
    .from('push_subscriptions')
    // Upsert por endpoint (unique): refresca claves sin crear filas basura.
    .upsert(
      { user_id: userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      { onConflict: 'endpoint' },
    )
  if (error) throw error

  return 'subscribed'
}

/**
 * Desuscribe del push service y borra la fila de `push_subscriptions`. Idempotente:
 * si no había suscripción, simplemente devuelve 'unsubscribed'. No-op sin soporte.
 */
export async function unsubscribeFromPush(userId: string): Promise<PushStatus> {
  if (!isPushSupported()) return 'unsupported'

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return 'unsubscribed'

  const { endpoint } = toStoredSubscription(subscription)
  await subscription.unsubscribe()

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
  if (error) throw error

  return 'unsubscribed'
}

/** Normaliza la PushSubscription a los campos que guardamos (endpoint + claves). */
function toStoredSubscription(subscription: PushSubscription): {
  endpoint: string
  keys: { p256dh: string; auth: string }
} {
  const json = subscription.toJSON()
  return {
    endpoint: json.endpoint ?? subscription.endpoint,
    keys: {
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
    },
  }
}

/**
 * Convierte la clave VAPID pública (base64url) al Uint8Array que exige
 * `pushManager.subscribe({ applicationServerKey })`. Exportada para poder testear
 * la conversión sin tocar APIs del navegador.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  // base64url → base64 estándar + padding a múltiplo de 4.
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  // Respaldamos el array por un ArrayBuffer explícito: `applicationServerKey`
  // exige un BufferSource sobre ArrayBuffer (no SharedArrayBuffer) y así satisface
  // el tipado estricto de lib.dom en TS 6.
  const buffer = new ArrayBuffer(rawData.length)
  const outputArray = new Uint8Array(buffer)
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}
