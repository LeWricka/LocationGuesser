import { useEffect, useState } from 'react'
import { getPermission, isBrowserPushCapable, isPushConfigured } from '../../lib/push'

/** Permiso actual + estado de suscripción del dispositivo, para que la UI decida qué ofrecer. */
export interface PushAvailability {
  /** ¿Tiene este navegador las APIs de Web Push? (independiente de la config). */
  capable: boolean
  /** ¿Hay clave VAPID configurada en el bundle? */
  configured: boolean
  /** `capable && configured`: el gate real de subscribe/unsubscribe. */
  supported: boolean
  /** Permiso de Notification, o 'unsupported' si no aplica. */
  permission: 'default' | 'granted' | 'denied' | 'unsupported'
  /** ¿Hay una PushSubscription activa en ESTE dispositivo? */
  subscribed: boolean
  /** ¿Aún resolviendo el estado inicial (permiso + suscripción)? */
  loading: boolean
}

/**
 * Resuelve capacidad + config + permiso + suscripción actual del dispositivo.
 * Extraído de `PushNotificationsControl` (issue #769): esa resolución vivía
 * solo dentro del control de "Editar perfil"; ahora la comparten también los
 * pre-prompts de descubrimiento (`PushOptInPrompt`, banner del viaje y
 * post-reveal) sin duplicar la lógica de "¿qué estado tiene el push aquí?".
 *
 * `capable`/`configured` se calculan UNA vez (no cambian durante la sesión).
 * `permission`/`subscribed` se resuelven de forma asíncrona: con el permiso
 * distinto de 'granted' no hace falta preguntar al service worker (sin permiso
 * no hay suscripción válida posible), así que se resuelven al instante; solo
 * con 'granted' se espera a `serviceWorker.ready` para saber si YA hay una
 * suscripción activa en este dispositivo. Arranca en `loading` mientras
 * `supported` es true (si no, no hay nada que resolver).
 */
export function usePushAvailability(): PushAvailability {
  const [capable] = useState(() => isBrowserPushCapable())
  const [configured] = useState(() => isPushConfigured())
  const supported = capable && configured
  const [permission, setPermission] = useState<PushAvailability['permission']>(() =>
    getPermission(),
  )
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(supported)

  useEffect(() => {
    let cancelled = false
    // Todo el trabajo (incluida la rama síncrona "no soportado") vive dentro de
    // esta función async: así ningún setState corre directo en el cuerpo del
    // efecto (evita cascadas de render — regla react-hooks/set-state-in-effect).
    async function resolve() {
      if (!supported) {
        if (!cancelled) setLoading(false)
        return
      }
      const perm = getPermission()
      if (perm !== 'granted') {
        if (!cancelled) {
          setPermission(perm)
          setSubscribed(false)
          setLoading(false)
        }
        return
      }
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (!cancelled) {
        setPermission(perm)
        setSubscribed(Boolean(subscription))
        setLoading(false)
      }
    }
    void resolve()
    return () => {
      cancelled = true
    }
  }, [supported])

  return { capable, configured, supported, permission, subscribed, loading }
}
