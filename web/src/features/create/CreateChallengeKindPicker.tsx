import { Hash, MapPin } from 'lucide-react'
import { AppHeader, Icon } from '../../ui'
import type { ChallengeKind } from '../../lib/challenges'
import styles from './CreateChallengeKindPicker.module.css'

interface Props {
  /** Nombre del viaje para el contexto de cabecera. */
  groupName?: string | null
  /** Cancela y vuelve atrás sin elegir. */
  onBack: () => void
  /** Elige el tipo de reto: location (¿Dónde?) o number (¿Adivinas?). */
  onPick: (kind: ChallengeKind) => void
}

// Selector de TIPO a la ENTRADA de crear reto (issue #323). Dos caminos, no dos
// flujos en la misma hoja: location (¿Dónde?, flujo de mapa intacto) y number
// (¿Adivinas?, adivinar una cifra; la pregunta concreta la pone el creador, por
// eso la etiqueta del TIPO es genérica). Visual-first: dos tarjetas grandes con
// icono lucide, sin emojis de chrome. El elegido entra en su asistente propio.
export function CreateChallengeKindPicker({ groupName, onBack, onPick }: Props) {
  return (
    <div className={styles.root}>
      {/* Cabecera ÚNICA del producto (variante papel): mismo título serif y
          back-disco de 44px que el resto del flujo de crear. El contexto del
          viaje vive en el eyebrow del cuerpo (la cabecera es de una sola línea). */}
      <AppHeader lead="back" onLead={onBack} leadLabel="Atrás" title="Nuevo reto" />

      <div className={styles.body}>
        <header className={styles.lede}>
          <span className={styles.eyebrow}>
            {groupName ? `Viaje · ${groupName} · Elige el tipo` : 'Elige el tipo'}
          </span>
          <h1 className={styles.h}>¿A qué jugamos?</h1>
          <p className={styles.sub}>Dos formas de retar al grupo. Eliges una y a por ello.</p>
        </header>

        <div className={styles.options}>
          <button
            type="button"
            className={styles.option}
            onClick={() => onPick('location')}
            aria-label="Crear reto ¿Dónde?: adivinar el lugar en el mapa"
          >
            <span className={`${styles.optIco} ${styles.optIcoLocation}`}>
              <Icon icon={MapPin} size={28} />
            </span>
            <span className={styles.optTxt}>
              <b>¿Dónde?</b>
              <span>Comparte un sitio; adivinan dónde es en el mapa.</span>
            </span>
            <ArrowRight />
          </button>

          <button
            type="button"
            className={styles.option}
            onClick={() => onPick('number')}
            aria-label="Crear reto ¿Adivinas?: adivinar una cifra"
          >
            <span className={`${styles.optIco} ${styles.optIcoNumber}`}>
              <Icon icon={Hash} size={28} />
            </span>
            <span className={styles.optTxt}>
              <b>¿Adivinas?</b>
              <span>Lanza una pregunta de cifra; adivinan el número.</span>
            </span>
            <ArrowRight />
          </button>
        </div>
      </div>
    </div>
  )
}

function ArrowRight() {
  return (
    <svg
      className={styles.optArrow}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
