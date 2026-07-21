// Registro POST-VALOR del invitado (onboarding nuevo, pieza 1/4): pantalla
// suave que se ofrece la primera vez que el receptor anónimo del enlace ya
// jugó un reto — nunca antes (ver `useGuestRegisterPrompt`). Copy y jerarquía
// del prototipo (`#invitado-registro`). "Crear cuenta" NO monta su propio
// motor de email/código: delega en `AccountUpgradeModal`/`useAccountUpgrade`
// (issue #758), ya validado — esta pantalla es solo el "porqué" antes de esos
// dos pasos. "Ahora no" es un cierre real, sin culpa: no vuelve a aparecer.

import { Bookmark } from 'lucide-react'
import { Button, Icon } from '../../ui'
import styles from './GuestRegisterPrompt.module.css'

interface Props {
  /** "Crear cuenta": abre el alta real (AccountUpgradeModal, fuera de aquí). */
  onCreateAccount: () => void
  /** "Ahora no": cierra sin crear cuenta. Nunca vuelve a mostrarse tras esto. */
  onDismiss: () => void
}

export function GuestRegisterPrompt({ onCreateAccount, onDismiss }: Props) {
  return (
    <div
      className={styles.screen}
      role="dialog"
      aria-modal="true"
      aria-label="Sigue el viaje desde tu cuenta"
    >
      <div className={styles.badge}>
        <Icon icon={Bookmark} size={26} />
      </div>
      <span className={`t-label ${styles.eyebrow}`}>Guárdalo</span>
      <h1 className={`t-display ${styles.title}`}>Sigue el viaje desde tu cuenta</h1>
      <p className={`t-body ${styles.body}`}>Crea una cuenta para vivir toda la experiencia.</p>
      <div className={styles.actions}>
        <Button fullWidth onClick={onCreateAccount}>
          Crear cuenta
        </Button>
        <Button variant="ghost" fullWidth onClick={onDismiss}>
          Ahora no
        </Button>
      </div>
    </div>
  )
}
