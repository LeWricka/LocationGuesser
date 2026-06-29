// Control "Activar avisos del grupo" (PWA Fase 1). Vive en el perfil; gobierna la
// suscripción Web Push del dispositivo actual. Diseño: docs/estrategia/pwa-push.md §3.
//
// Si el navegador no soporta push o no hay clave VAPID configurada, este control
// NO se renderiza (devuelve null): la app va exactamente igual sin la opción.
// El ENVÍO real de notificaciones es la Fase 2; aquí solo nos suscribimos.

import { useEffect, useState } from 'react'
import { Button, Stack, useToast } from '../../ui'
import {
  getPermission,
  isPushSupported,
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
  const [supported] = useState(() => isPushSupported())
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

  // No soportado o sin VAPID: el control no existe (la app no ofrece la opción).
  if (!supported) return null

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
