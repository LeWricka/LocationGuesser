// Sección "Notificaciones" del perfil (PWA). Vive en el perfil; gobierna DOS
// cosas relacionadas pero distintas:
//   1. la suscripción Web Push del DISPOSITIVO actual (activar/desactivar) —
//      diseño original: docs/estrategia/pwa-push.md §3.
//   2. QUÉ TIPOS de aviso quiere recibir la CUENTA (jsonb `profiles.push_prefs`,
//      lib/pushPrefs.ts) — issue de "gestión de notificaciones por tipo": Reto
//      nuevo, Momento nuevo, Fin de reto, Fin de viaje.
//
// (2) depende de (1): sin suscripción activa en ESTE dispositivo no hay avisos
// que filtrar, así que los cuatro interruptores se muestran siempre (la
// preferencia es de la CUENTA, no del dispositivo) pero DESHABILITADOS hasta
// que el permiso esté concedido — evita la falsa promesa de "activé esto y no
// pasa nada" cuando en realidad falta el paso 1.
//
// Estados del bloque de permiso, en orden de prioridad:
//   · navegador SIN APIs de push (iOS Safari sin instalar, etc.) → aviso de que
//     este dispositivo no puede recibir avisos (sin botón: no hay nada que
//     activar aquí).
//   · navegador capaz pero SIN clave VAPID en el bundle → "avisos no disponibles
//     todavía" (informativo; el operador aún no ha configurado el envío).
//   · soportado + configurado → toggle real (denegado / activar / desactivar).
// El ENVÍO real de notificaciones lo hace la Edge Function send-push (Fase 2).

import { useState } from 'react'
import { Button, Stack, useToast } from '../../ui'
import { subscribeToPush, unsubscribeFromPush, type PushStatus } from '../../lib/push'
import { isPushKindEnabled, setPushPref, type PushKind } from '../../lib/pushPrefs'
import { track } from '../../lib/analytics'
import { usePushAvailability } from './usePushAvailability'
import type { Profile } from '../../lib/database.types'
import styles from './PushNotificationsControl.module.css'

interface Props {
  userId: string
  /** Perfil actual — de aquí sale `push_prefs` (jsonb, puede venir `undefined`
   * si la migración del backend aún no está aplicada: se trata como `{}`). */
  profile: Profile | null
}

// Estado de UI derivado del permiso + si hay suscripción activa en este dispositivo.
type UiState = 'loading' | 'denied' | 'on' | 'off'

// Los cuatro tipos de aviso gestionables, en el orden que pide el diseño.
const PUSH_KIND_ITEMS: Array<{ kind: PushKind; label: string; hint: string }> = [
  { kind: 'created', label: 'Reto nuevo', hint: 'Cuando alguien lanza un reto.' },
  { kind: 'memory', label: 'Momento nuevo', hint: 'Cuando alguien comparte un momento.' },
  {
    kind: 'closed',
    label: 'Fin de reto',
    hint: 'Cuando un reto se cierra: resultados y ganador.',
  },
  {
    kind: 'trip_closed',
    label: 'Fin de viaje',
    hint: 'Cuando se cierra un viaje: clasificación final y resumen.',
  },
]

export function PushNotificationsControl({ userId, profile }: Props) {
  const toast = useToast()
  // Capacidad/config/permiso/suscripción (issue #769): antes se resolvía aquí
  // mismo; ahora vive en `usePushAvailability`, compartido con los pre-prompts
  // de descubrimiento (banner del viaje y post-reveal) para no duplicar la
  // resolución "¿qué estado tiene el push en este dispositivo?".
  const { capable, configured, supported, permission, subscribed, loading } = usePushAvailability()
  // Derivado del gate compartido: denegado se marca tal cual; concedido pero
  // sin suscripción cuenta como "off" (se ofrece activar). `override` manda
  // tras una acción LOCAL (activar/desactivar): el hook no sabe que este mismo
  // componente acaba de suscribir/desuscribir, así que la respuesta de
  // subscribeToPush/unsubscribeFromPush (`applyStatus`) toma el mando hasta que
  // el componente se desmonte — sin esto, derivedState no reflejaría el cambio
  // (usePushAvailability solo resuelve una vez al montar).
  const derivedState: UiState = loading
    ? 'loading'
    : permission === 'denied'
      ? 'denied'
      : subscribed
        ? 'on'
        : 'off'
  const [override, setOverride] = useState<UiState | null>(null)
  const uiState = override ?? derivedState
  const [busy, setBusy] = useState(false)

  // Preferencias por tipo: estado local (optimista) sembrado del perfil. La
  // clave ausente = activada (isPushKindEnabled), y `push_prefs` puede venir
  // `undefined` mientras la migración del backend no esté aplicada — se trata
  // como "sin preferencias guardadas", nunca rompe.
  const [prefs, setPrefs] = useState(profile?.push_prefs ?? {})
  const [prefBusy, setPrefBusy] = useState<PushKind | null>(null)

  // Los interruptores necesitan navegador capaz + VAPID configurada (`supported`)
  // Y permiso concedido + suscripción activa en este dispositivo (`uiState ===
  // 'on'`): sin eso no hay nada que filtrar en el envío.
  const devicePushOn = supported && uiState === 'on'

  async function handleToggle(kind: PushKind) {
    const next = !isPushKindEnabled(prefs, kind)
    // Optimista: refleja el cambio al instante, revierte si falla la persistencia.
    setPrefs((current) => ({ ...current, [kind]: next }))
    setPrefBusy(kind)
    try {
      await setPushPref(userId, kind, next, prefs)
      track('push_pref_changed', { kind, enabled: next })
    } catch {
      setPrefs((current) => ({ ...current, [kind]: !next }))
      toast.show('No pudimos guardar tu preferencia', { tone: 'danger' })
    } finally {
      setPrefBusy(null)
    }
  }

  function renderPrefs() {
    return (
      <div className={styles.prefsList}>
        {PUSH_KIND_ITEMS.map(({ kind, label, hint }) => {
          const enabled = isPushKindEnabled(prefs, kind)
          const id = `push-pref-${kind}`
          return (
            <div key={kind} className={styles.toggleRow}>
              <div>
                <label htmlFor={id} className={styles.prefLabel}>
                  {label}
                </label>
                <p className={styles.hint}>{hint}</p>
              </div>
              <button
                type="button"
                id={id}
                role="switch"
                aria-checked={enabled}
                aria-label={label}
                disabled={!devicePushOn || prefBusy === kind}
                className={`${styles.toggle} ${enabled ? styles.toggleOn : ''}`}
                onClick={() => void handleToggle(kind)}
              >
                <span className={styles.toggleThumb} />
              </button>
            </div>
          )
        })}
        {!devicePushOn && (
          <p className={styles.hint}>
            Activa los avisos para elegir qué tipo de avisos quieres recibir.
          </p>
        )}
      </div>
    )
  }

  // Navegador sin APIs de push: no hay nada que activar aquí, pero las
  // preferencias siguen siendo de la CUENTA (deshabilitadas, con su hint).
  if (!capable) {
    return (
      <Stack gap={2} className={styles.control}>
        <span className={styles.label}>Notificaciones</span>
        <p className={styles.hint}>Este dispositivo no admite avisos push.</p>
        {renderPrefs()}
      </Stack>
    )
  }

  // Navegador capaz pero la app aún no tiene VAPID configurada: informamos en vez
  // de ofrecer un toggle que no haría nada (cumple "no configurado" del diseño).
  if (!configured) {
    return (
      <Stack gap={2} className={styles.control}>
        <span className={styles.label}>Notificaciones</span>
        <p className={styles.hint}>Los avisos aún no están disponibles. Llegarán pronto.</p>
        {renderPrefs()}
      </Stack>
    )
  }

  function applyStatus(status: PushStatus) {
    if (status === 'subscribed') {
      setOverride('on')
      toast.show('Avisos activados', { tone: 'success' })
    } else if (status === 'unsubscribed') {
      setOverride('off')
      toast.show('Avisos desactivados')
    } else if (status === 'denied') {
      setOverride('denied')
    } else {
      // 'default' (cerró el prompt sin decidir) o 'unsupported' inesperado.
      setOverride('off')
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
      <span className={styles.label}>Notificaciones</span>

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

      {renderPrefs()}
    </Stack>
  )
}
