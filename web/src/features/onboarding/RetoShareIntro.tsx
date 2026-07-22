// Intro MÍNIMA de la entrada por RETO COMPARTIDO (onboarding nuevo, pieza 2/4):
// lo primero que ve quien abre un enlace de UN reto suelto sin cuenta y por
// primera vez, ANTES de jugar. A propósito no explica nada de Momentu todavía
// (eso llega DESPUÉS del resultado, ver RetoShareExplainSequence) — aquí solo
// se orienta lo justo para jugar: "te han retado, así se juega, adelante".
// Copy y jerarquía del prototipo (`#reto-intro`), mismo lenguaje visual que
// `GuestWelcomeFrame` (foto del reto a sangre + marco de texto abajo).
//
// Presentacional puro: PlayChallenge decide CUÁNDO se monta (fase `idle`,
// primera vez) y qué pasa al pulsar "Jugar" (deja paso al flujo normal de
// jugar: overlay "Empezar" → cuenta atrás → jugar).

import { ArrowRight } from 'lucide-react'
import { Button, Icon } from '../../ui'
import styles from './RetoShareIntro.module.css'

export interface Props {
  /** Foto del propio reto, para el fondo (null → degradado de escena). */
  photoUrl?: string | null
  /** "Jugar": cierra la intro y da paso al flujo normal de jugar. */
  onPlay: () => void
}

export function RetoShareIntro({ photoUrl, onPlay }: Props) {
  return (
    <div
      className={styles.screen}
      role="dialog"
      aria-modal="true"
      aria-label="¿Adivinas dónde es esta foto?"
    >
      <div className={styles.backdrop}>
        {photoUrl ? (
          <img src={photoUrl} alt="" className={styles.photo} decoding="async" />
        ) : (
          <div className={styles.photoFallback} />
        )}
        <div className={styles.scrim} />
      </div>

      <div className={styles.frame}>
        <span className={`t-label ${styles.eyebrow}`}>Te han retado</span>
        <h1 className={`t-display ${styles.title}`}>¿Adivinas dónde es esta foto?</h1>
        <p className={`t-body ${styles.body}`}>
          Marca en el mapa antes de que se acabe el tiempo.{' '}
          <strong>Gana quien más se acerca.</strong>
        </p>

        <Button fullWidth onClick={onPlay} className={styles.cta}>
          <span className={styles.ctaLabel}>
            Jugar
            <Icon icon={ArrowRight} size={18} />
          </span>
        </Button>
      </div>
    </div>
  )
}
