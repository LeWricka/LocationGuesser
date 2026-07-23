// Marco de bienvenida del usuario NUEVO (issue #905): lo PRIMERO que ve quien
// se acaba de registrar y aterriza en su home vacía. Una sola pantalla que
// explica Momentu a alto nivel y ofrece VER cómo funciona — sin tarjetas
// abstractas: el CTA lleva al recorrido REAL del viaje de ejemplo (la home
// cablea `onSeeHow` a `#g=ejemplo&tour=1&nuevo=1`). Mismo lenguaje visual que
// CreadorIntroFrame/GuestWelcomeFrame (escena oscura a pantalla completa, marco
// de texto, CTA), reutilizando su CSS — pero con un segundo botón para SALTAR
// (esto se auto-muestra una vez, así que tiene que poder cerrarse sin recorrer
// nada). Presentacional puro: la home decide CUÁNDO se monta (una vez por
// cuenta) y marca "visto" al cerrar por cualquiera de las dos vías.

import { ArrowRight } from 'lucide-react'
import { Button, Icon } from '../../ui'
import styles from './CreadorIntroFrame.module.css'

export interface Props {
  /** "Ver cómo funciona": marca visto y arranca el recorrido del viaje de ejemplo. */
  onSeeHow: () => void
  /** "Ahora no": marca visto y deja al usuario en su home vacía. */
  onSkip: () => void
}

export function NuevoBienvenidaFrame({ onSeeHow, onSkip }: Props) {
  return (
    <div className={styles.screen} role="dialog" aria-modal="true" aria-label="Esto es Momentu">
      <div className={styles.backdrop} />

      <div className={styles.frame}>
        <span className={`t-label ${styles.eyebrow}`}>Momentu</span>
        <h1 className={`t-display ${styles.title}`}>Esto es Momentu</h1>
        <p className={`t-body ${styles.body}`}>
          La forma de guardar tus viajes y compartirlos con quien más quieres.
        </p>

        <Button fullWidth onClick={onSeeHow} className={styles.cta}>
          <span className={styles.ctaLabel}>
            Ver cómo funciona
            <Icon icon={ArrowRight} size={18} />
          </span>
        </Button>
        <Button fullWidth variant="ghost" onClick={onSkip} className={styles.skip}>
          Ahora no
        </Button>
      </div>
    </div>
  )
}
