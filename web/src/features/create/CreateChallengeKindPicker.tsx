import { Hash } from 'lucide-react'
import { AppHeader, Icon, IconPin } from '../../ui'
import { ShellUtilitario } from '../../ui/shells'
import type { ChallengeKind } from '../../lib/challenges'
import styles from './CreateChallengeKindPicker.module.css'

interface Props {
  /** Nombre del viaje para el contexto de cabecera. */
  groupName?: string | null
  /** Cancela y vuelve atrás sin elegir. */
  onBack: () => void
  /** Elige el tipo de reto: location (¿Dónde estamos?) o number (¿Adivinas?). */
  onPick: (kind: ChallengeKind) => void
}

// Selector de TIPO a la ENTRADA de crear reto (issue #323). Dos caminos, no dos
// flujos en la misma hoja: location (¿Dónde estamos?, flujo de mapa intacto) y
// number (¿Adivinas?, adivinar una cifra; la pregunta concreta la pone el
// creador, por eso la etiqueta del TIPO es genérica). Visual-first: dos
// tarjetas grandes con icono lucide, sin emojis de chrome. El elegido entra en
// su asistente propio.
//
// Label del tipo "¿Dónde estamos?" (antes "¿Dónde?", decisión de producto): es
// un viaje en GRUPO, "¿Dónde?" a secas no encajaba. Solo cambia el LABEL — el
// id interno del tipo (`challenge_kind: 'location'`) no se toca.
export function CreateChallengeKindPicker({ groupName, onBack, onPick }: Props) {
  return (
    <div className={styles.root}>
      <ShellUtilitario
        header={
          // Cabecera SOLO con el atrás (issue #705): con la cabecera 5B
          // compactada, un título "Nuevo reto" aquí quedaba redundante con el
          // heading "¿A qué jugamos?" de abajo (dos títulos consecutivos). El
          // texto "Nuevo reto" pasa a ser el kicker del heading del cuerpo —
          // sigue estando, pero una sola vez.
          <AppHeader variant="dense" lead="back" onLead={onBack} leadLabel="Atrás" />
        }
      >
        {/* ShellUtilitario ancla el cuerpo ARRIBA (sin centrado vertical): en
            viewports altos un `justify-content: center` propio dejaba más de
            media pantalla vacía entre la cabecera y las tarjetas (#502). */}
        <div className={styles.body}>
          <header className={styles.lede}>
            <span className={styles.eyebrow}>
              {groupName ? `Nuevo reto · ${groupName}` : 'Nuevo reto'}
            </span>
            <h1 className={styles.h}>¿A qué jugamos?</h1>
            <p className={styles.sub}>Dos formas de retar al grupo. Eliges una y a por ello.</p>
          </header>

          <div className={styles.options}>
            <button
              type="button"
              className={styles.option}
              onClick={() => onPick('location')}
              aria-label="Crear reto ¿Dónde estamos?: adivinar el lugar en el mapa"
            >
              <span className={`${styles.optIco} ${styles.optIcoLocation}`}>
                <IconPin size={28} />
              </span>
              <span className={styles.optTxt}>
                <b>¿Dónde estamos?</b>
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
      </ShellUtilitario>
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
