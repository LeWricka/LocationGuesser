import { useEffect, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { Banner, Button, Icon } from '../../ui'
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
  /** Para insertarlo en el flujo de una tarjeta (post_play) en vez de flotar. */
  className?: string
}

/**
 * Pre-prompt visual propio (issue #769): "¿Te avisamos cuando haya un reto
 * nuevo?" ANTES de disparar el prompt NATIVO del navegador — el nativo
 * denegado es irreversible, así que solo se llama a `subscribeToPush` (que lo
 * dispara) tras pulsar "Sí, avisadme" aquí. Mismo componente, mismo copy,
 * misma analítica y el MISMO snooze en las dos superficies del diseño:
 *  - `trip_banner`: banner flotante en TripPage (cubre invitado nuevo y
 *    miembro existente, con o sin cuenta).
 *  - `post_play`: tras revelar un reto, SOLO para cuentas — el receptor
 *    anónimo ya tiene ahí el CTA "no pierdas tus puntos" y nunca se apilan
 *    dos prompts en la misma vista (lo decide el llamador).
 *
 * Visibilidad (`shouldShowPushPrompt`, lib/pushPrompt.ts): configurado +
 * navegador capaz + permiso 'default' + sin suscripción + sin snooze. La X
 * snoozea 7 días en una clave COMPARTIDA: descartarlo en una superficie calla
 * también la otra (no naggear en ninguna).
 */
export function PushOptInPrompt({ surface, groupId, className }: Props) {
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
      // consentimiento informado (el usuario pulsó "Sí" en NUESTRO aviso, no
      // en el del navegador).
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
    <Banner
      tone="oferta"
      icon={Bell}
      className={className}
      action={
        <div className={styles.actions}>
          <Button size="sm" onClick={() => void handleEnable()} loading={busy}>
            Sí, avisadme
          </Button>
          <Button variant="ghost" iconButton aria-label="Ahora no" onClick={handleDismiss}>
            <Icon icon={X} size={18} />
          </Button>
        </div>
      }
    >
      ¿Te avisamos cuando haya un reto nuevo?
    </Banner>
  )
}
