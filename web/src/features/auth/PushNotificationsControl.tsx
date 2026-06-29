// Control "Avisos del viaje" (PWA). Vive en el perfil; gobierna la suscripción Web
// Push del dispositivo actual. Diseño: docs/estrategia/pwa-push.md §3.
//
// Estados que cubre, en orden de prioridad:
//   · navegador SIN APIs de push (iOS Safari sin instalar, etc.) → el control NO se
//     renderiza (null): no tiene sentido ofrecer algo que el navegador no puede.
//   · navegador capaz pero SIN clave VAPID en el bundle → "avisos no disponibles
//     todavía" (informativo; el operador aún no ha configurado el envío). Así el
//     usuario sabe que la opción existe pero no está montada, en vez de no ver nada.
//   · soportado + configurado → toggle real (denegado / activar / desactivar).
// El ENVÍO real de notificaciones lo hace la Edge Function send-push (Fase 2).

import { useEffect, useState } from 'react'
import { Button, Stack, useToast } from '../../ui'
import {
  getPermission,
  isBrowserPushCapable,
  isPushConfigured,
  subscribeToPush,
  unsubscribeFromPush,
  type PushStatus,
} from '../../lib/push'
import styles from './PushNotificationsControl.module.css'

interface Props {
  userId: string
}

// Estado de UI derivado del permiso + si hay suscripción activa en este dispositivo.
type UiState = 'loading' | 'denied' | 'on' | 'off'

export function PushNotificationsControl({ userId }: Props) {
  const toast = useToast()
  const [capable] = useState(() => isBrowserPushCapable())
  const [configured] = useState(() => isPushConfigured())
  const supported = capable && configured
  const [uiState, setUiState] = useState<UiState>('loading')
  const [busy, setBusy] = useState(false)

  // Estado inicial: si ya está denegado lo marcamos; si está concedido, miramos si
  // hay una suscripción activa en este dispositivo (permiso concedido pero sin
  // suscripción cuenta como "off", la ofreceremos activar).
  useEffect(() => {
    if (!supported) return
    let cancelled = false
    async function resolveInitial() {
      const permission = getPermission()
      if (permission === 'denied') {
        if (!cancelled) setUiState('denied')
        return
      }
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (!cancelled) setUiState(permission === 'granted' && subscription ? 'on' : 'off')
    }
    void resolveInitial()
    return () => {
      cancelled = true
    }
  }, [supported])

  // Navegador sin APIs de push: el control no existe (la app no ofrece la opción).
  if (!capable) return null

  // Navegador capaz pero la app aún no tiene VAPID configurada: informamos en vez
  // de ofrecer un toggle que no haría nada (cumple "no configurado" del diseño).
  if (!configured) {
    return (
      <Stack gap={2} className={styles.control}>
        <span className={styles.label}>Avisos del viaje</span>
        <p className={styles.hint}>Los avisos aún no están disponibles. Llegarán pronto.</p>
      </Stack>
    )
  }

  function applyStatus(status: PushStatus) {
    if (status === 'subscribed') {
      setUiState('on')
      toast.show('Avisos activados', { tone: 'success' })
    } else if (status === 'unsubscribed') {
      setUiState('off')
      toast.show('Avisos desactivados')
    } else if (status === 'denied') {
      setUiState('denied')
    } else {
      // 'default' (cerró el prompt sin decidir) o 'unsupported' inesperado.
      setUiState('off')
    }
  }

  async function handleEnable() {
    setBusy(true)
    try {
      applyStatus(await subscribeToPush(userId))
    } catch {
      toast.show('No pudimos activar los avisos', { tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  async function handleDisable() {
    setBusy(true)
    try {
      applyStatus(await unsubscribeFromPush(userId))
    } catch {
      toast.show('No pudimos desactivar los avisos', { tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack gap={2} className={styles.control}>
      <span className={styles.label}>Avisos del viaje</span>

      {uiState === 'loading' && <p className={styles.hint}>Comprobando el estado de los avisos…</p>}

      {uiState === 'denied' && (
        <p className={styles.hint}>
          Has bloqueado los avisos en este navegador. Actívalos desde sus ajustes para volver a
          recibirlos.
        </p>
      )}

      {uiState === 'off' && (
        <>
          <p className={styles.hint}>
            Te avisamos cuando haya un reto nuevo o esté por cerrar. Sin spam.
          </p>
          <Button variant="secondary" size="sm" onClick={handleEnable} loading={busy}>
            Activar avisos
          </Button>
        </>
      )}

      {uiState === 'on' && (
        <>
          <p className={styles.hint}>Avisos activados en este dispositivo.</p>
          <Button variant="ghost" size="sm" onClick={handleDisable} loading={busy}>
            Desactivar avisos
          </Button>
        </>
      )}
    </Stack>
  )
}
