import { type Difficulty, DIFFICULTY_BLURB, DIFFICULTY_LABEL } from '../../lib/difficulty'
import { Stack } from '../../ui'
import styles from './DifficultyPicker.module.css'

interface Props {
  /** Elige una dificultad y arranca su flujo enfocado. */
  onPick: (difficulty: Difficulty) => void
}

// Orden de presentación: de más pistas (Fácil) a menos (Difícil).
const ORDER: Difficulty[] = ['facil', 'medio', 'dificil']

// Paso 1 del flujo de crear reto: elegir la DIFICULTAD primero. La dificultad =
// qué medios verán los participantes (foto y/o Street View). Cada tarjeta dice
// la dificultad y una frase de qué verán; al pulsar entramos en el flujo de esa
// dificultad. Reemplaza al flujo antiguo que obligaba a empezar por Street View.
export function DifficultyPicker({ onPick }: Props) {
  return (
    <Stack gap={3}>
      <p className={styles.intro}>
        Elige la dificultad. Define qué verán los demás: cuanta menos información, más difícil.
      </p>
      <div className={styles.grid}>
        {ORDER.map((difficulty) => (
          <button
            key={difficulty}
            type="button"
            className={styles.card}
            onClick={() => onPick(difficulty)}
          >
            <span className={styles.cardLabel}>{DIFFICULTY_LABEL[difficulty]}</span>
            <span className={styles.cardBlurb}>{DIFFICULTY_BLURB[difficulty]}</span>
          </button>
        ))}
      </div>
    </Stack>
  )
}
