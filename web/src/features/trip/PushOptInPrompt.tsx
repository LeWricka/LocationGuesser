import { useEffect, useState } from 'react'
import { Bell, CalendarCheck, Camera, Target, TimerReset } from 'lucide-react'
import { Button, Icon, Modal, Stack } from '../../ui'
import { usePushAvailability } from '../auth'
import { shouldShowPushPrompt, snoozePushPrompt } from '../../lib/pushPrompt'
import { subscribeToPush } from '../../lib/push'
import { track } from '../../lib/analytics'
import { useSession } from '../../lib/session-context'
import styles from './PushOptInPrompt.module.css'

/** Dónde vive el pre-prompt (issue #769): mismo componente, dos superficies. */
export type PushPromptSurface = 'trip_banner' | 'post_play'

interface Props {
  surface: PushPromptSurface
  groupId: string
}

// Qué avisos gana el usuario al activar (issue #886): explicarlo es el punto
// del pop-up — antes era un banner de una línea que no decía para qué sirve.
const PERKS: { icon: typeof Bell; text: string }[] = [
  { icon: Target, text: 'Cuando hay un reto nuevo para jugar' },
  { icon: Camera, text: 'Cuando alguien comparte un momento' },
  { icon: TimerReset, text: 'Cuando un reto está a punto de cerrar' },
  { icon: CalendarCheck, text: 'Cuando el viaje llega a su fin' },
]

/**
 * Pre-prompt visual propio (issue #769, ampliado en #886): explica el VALOR de
 * las notificaciones ANTES de disparar el prompt NATIVO del navegador — el
 * nativo denegado es irreversible, así que solo se llama a `subscribeToPush`
 * (que lo dispara) tras pulsar "Activar avisos" aquí. Pasó de banner de una
 * línea a POP-UP centrado (`Modal`) que enumera los avisos: el usuario decide
 * informado, no a ciegas. Mismo componente, misma analítica y el MISMO snooze
 * en las dos superficies del diseño:
 *  - `trip_banner`: en TripPage (cubre invitado nuevo y miembro existente).
 *  - `post_play`: tras revelar un reto, SOLO para cuentas — el receptor
 *    anónimo ya tiene ahí su propio CTA y nunca se apilan dos prompts en la
 *    misma vista (lo decide el llamador).
 *
 * Visibilidad (`shouldShowPushPrompt`, lib/pushPrompt.ts): configurado +
 * navegador capaz + permiso 'default' + sin suscripción + sin snooze. Cerrar
 * ("Ahora no", la X o Escape) snoozea 7 días en una clave COMPARTIDA:
 * descartarlo en una superficie calla también la otra (no naggear en ninguna).
 * La gestión REAL vive en el perfil (`PushNotificationsControl`).
 */
export function PushOptInPrompt({ surface, groupId }: Props) {
  const { user } = useSession()
  const availability = usePushAvailability()
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)
  const visible = Boolean(user) && !dismissed && shouldShowPushPrompt(availability)

  // Impresión (issue #769): una vez por cada vez que pasa a visible, no en
  // cada render (busy/dismissed cambian sin que sea una impresión nueva).
  useEffect(() => {
    if (visible) track('push_prompt_shown', { surface, group_id: groupId })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  if (!visible || !user) return null
  const userId = user.id

  async function handleEnable() {
    setBusy(true)
    try {
      // El permiso nativo es irreversible si se deniega: llegar aquí YA es el
      // consentimiento informado (el usuario pulsó "Activar" en NUESTRO aviso,
      // no en el del navegador).
      const status = await subscribeToPush(userId)
      track('push_prompt_accepted', {
        surface,
        group_id: groupId,
        // Outcome del prompt NATIVO: 'granted' (activado), 'denied' (bloqueado
        // explícitamente) o 'default' (lo cerró sin decidir).
        outcome: status === 'subscribed' ? 'granted' : status === 'denied' ? 'denied' : 'default',
      })
    } finally {
      setBusy(false)
      // Concedido, denegado o cerrado sin decidir: no reaparece en ESTA vista
      // (evita el "flash" de volver a verlo tras responder).
      setDismissed(true)
    }
  }

  function handleDismiss() {
    snoozePushPrompt()
    track('push_prompt_dismissed', { surface, group_id: groupId })
    setDismissed(true)
  }

  return (
    <Modal
      open={visible}
      onClose={handleDismiss}
      title={
        <span className={styles.title}>
          <span className={styles.titleIcon}>
            <Icon icon={Bell} size={20} />
          </span>
          No te pierdas ningún reto
        </span>
      }
      footer={
        <div className={styles.footer}>
          <Button fullWidth onClick={() => void handleEnable()} loading={busy}>
            Activar avisos
          </Button>
          <Button variant="ghost" fullWidth onClick={handleDismiss}>
            Ahora no
          </Button>
        </div>
      }
    >
      <Stack gap={4}>
        <p className={styles.lede}>Actívalas y te avisamos de lo que pasa en tu viaje:</p>
        <ul className={styles.perks}>
          {PERKS.map((perk) => (
            <li key={perk.text} className={styles.perk}>
              <span className={styles.perkIcon}>
                <Icon icon={perk.icon} size={18} />
              </span>
              <span>{perk.text}</span>
            </li>
          ))}
        </ul>
        <p className={styles.manage}>Puedes gestionarlas cuando quieras desde tu perfil.</p>
      </Stack>
    </Modal>
  )
}
