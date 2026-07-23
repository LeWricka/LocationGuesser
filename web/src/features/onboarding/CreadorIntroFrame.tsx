// Intro de UNA pantalla del onboarding del CREADOR (pieza 3/4, aprender-
// haciendo): lo primero que ve quien acaba de crear un viaje, ANTES de caer en
// su Diario vacío. A propósito no explica nada más que el "porqué" del
// producto — el "cómo" (guardar un momento, lanzar un reto) se aprende
// HACIENDO, con el coach-mark sobre el "+" real y la sugerencia contextual que
// vienen después (ambos son `CoachMark`, ver ese fichero). Copy y jerarquía
// del prototipo (`#cintro`), mismo lenguaje visual que GuestWelcomeFrame/
// RetoShareIntro (escena oscura a pantalla completa, marco de texto, un único
// CTA) pero SIN foto de fondo: aquí no hay recuerdo real todavía que enseñar,
// así que el fondo es el degradado de escena (nunca lienzo vacío).
//
// Presentacional puro: `useCreadorOnboarding` decide CUÁNDO se monta.

import { ArrowRight } from 'lucide-react'
import { Button, Icon } from '../../ui'
import styles from './CreadorIntroFrame.module.css'

export interface Props {
  /** "Empezar": cierra la intro y da paso al coach-mark sobre el "+". */
  onStart: () => void
}

export function CreadorIntroFrame({ onStart }: Props) {
  return (
    <div
      className={styles.screen}
      role="dialog"
      aria-modal="true"
      aria-label="Tu viaje, compartido con tu gente."
    >
      <div className={styles.backdrop} />

      <div className={styles.frame}>
        <span className={`t-label ${styles.eyebrow}`}>Momentu</span>
        <h1 className={`t-display ${styles.title}`}>Tu viaje, compartido con tu gente.</h1>
        <p className={`t-body ${styles.body}`}>
          Guarda cada momento con todo: varias fotos, un vídeo, hasta una nota de voz. Compártelo
          con tu gente y rétales a adivinar dónde estás.
        </p>

        <Button fullWidth onClick={onStart} className={styles.cta}>
          <span className={styles.ctaLabel}>
            Empezar
            <Icon icon={ArrowRight} size={18} />
          </span>
        </Button>
      </div>
    </div>
  )
}
