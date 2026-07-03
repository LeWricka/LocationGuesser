/// <reference lib="webworker" />

// Service worker propio (vite-plugin-pwa en modo injectManifest). Hace dos cosas:
//
//   1. PRECACHE del app-shell — `precacheAndRoute(self.__WB_MANIFEST)`. El plugin
//      inyecta ahí la lista de assets revisionados en build; mantiene el mismo
//      comportamiento offline/instalable que el SW autogenerado de Workbox.
//   2. WEB PUSH — los eventos `push` y `notificationclick`, que Workbox NO cubre
//      y son la razón de tener SW propio. El push llega aquí aunque la pestaña
//      esté cerrada; al tocar la notificación abrimos el deep-link al reto.
//
// Diseño: docs/estrategia/pwa-push.md §1.1/§1.3. El ENVÍO de los push lo hace la
// Edge Function `supabase/functions/send-push`; aquí solo los RECIBIMOS y pintamos.
//
// Este fichero NO entra en `tsconfig.app.json` (corre en contexto worker, no DOM):
// tiene su propio `tsconfig.sw.json` con la lib `webworker`. Por eso `self` es un
// ServiceWorkerGlobalScope y existen `clients`, `registration`, etc.

import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare let self: ServiceWorkerGlobalScope

// El plugin sustituye `self.__WB_MANIFEST` por la lista de assets a precachear.
precacheAndRoute(self.__WB_MANIFEST)
// Borra precachés de despliegues anteriores (equivale al `cleanupOutdatedCaches`
// del SW autogenerado): un deploy nuevo no queda servido desde caché obsoleta.
cleanupOutdatedCaches()

// SPA navigation fallback: toda navegación se sirve con el index.html precacheado
// (la app es un SPA con rutas en el cliente). En modo generateSW esto lo hacía el
// plugin con `navigateFallback`; en injectManifest lo registramos nosotros.
//
// DENYLIST (= el navigateFallbackDenylist del modo generateSW): NO interceptar las
// funciones serverless de previsualización (`/api/*`) ni las rutas limpias `/v/*` y
// `/j/*`. Esas las sirve Vercel (la función `share` con las metas OG); si el fallback
// las capturara, devolvería el index.html cacheado y se perdería la tarjeta OG.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//, /^\/v\//, /^\/j\//],
  }),
)

// prompt (#549): el SW nuevo se queda EN ESPERA (`waiting`) — NO llama a
// `skipWaiting()` al instalar. Antes (#498) lo hacía incondicionalmente: cualquier
// deploy tomaba el control y recargaba de golpe TODAS las pestañas abiertas,
// incluso con un formulario a medias. Ahora solo activa cuando main.tsx lo pide
// explícitamente (banner "Actualizar" o, en silencio, al ocultarse la pestaña),
// mandando `{ type: 'SKIP_WAITING' }` — es el mensaje que envía
// `Workbox#messageSkipWaiting()` de vite-plugin-pwa/workbox-window.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
// clientsClaim en el activate no cambia: una vez decidido aplicar la
// actualización, el SW nuevo toma el control de los clientes ya abiertos sin
// esperar a que naveguen (irrelevante en un SPA, que no navega entre páginas).
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// ────────────────────────────────────────────────────────────────────────────
// Web Push
// ────────────────────────────────────────────────────────────────────────────

// Forma del payload que envía la Edge Function `send-push`. Todo opcional para ser
// tolerantes: si llega un push con JSON raro (o sin cuerpo), mostramos algo seguro
// en vez de romper. NUNCA lleva la respuesta del reto (lat/lng) — solo "hay reto".
interface PushPayload {
  title?: string
  body?: string
  // Deep-link relativo al que navegar al tocar la notificación (p.ej. `/#g=ABC&c=<uuid>`).
  url?: string
  tag?: string
}

const FALLBACK_TITLE = 'Tabide'
const FALLBACK_BODY = 'Tienes novedades en tu viaje.'

self.addEventListener('push', (event) => {
  // Parseo defensivo: el push podría no traer cuerpo o traer texto no-JSON.
  let payload: PushPayload = {}
  try {
    payload = event.data?.json() ?? {}
  } catch {
    const text = event.data?.text()
    if (text) payload = { body: text }
  }

  const title = payload.title ?? FALLBACK_TITLE
  const url = payload.url ?? '/'

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body ?? FALLBACK_BODY,
      // Iconos del propio manifest (ya en dist/). Badge monocromo para Android.
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      // `tag` colapsa notificaciones del mismo reto (no apilar duplicados).
      tag: payload.tag,
      // Guardamos la URL para abrirla en notificationclick.
      data: { url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const data = event.notification.data as { url?: string } | undefined
  const targetUrl = data?.url ?? '/'

  // Si ya hay una ventana de la app abierta, la enfocamos y la navegamos al
  // deep-link en vez de abrir otra pestaña. Si no, abrimos una nueva.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if ('focus' in client) {
          void client.focus()
          if ('navigate' in client) void client.navigate(targetUrl)
          return
        }
      }
      return self.clients.openWindow(targetUrl).then(() => undefined)
    }),
  )
})
