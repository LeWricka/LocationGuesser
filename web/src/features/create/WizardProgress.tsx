import styles from './WizardProgress.module.css'

interface Props {
  /** Etiquetas de los pasos, en orden. */
  steps: string[]
  /** Índice (0-based) del paso actual. */
  current: number
}

// Barra de progreso del asistente de crear reto: una pastilla por paso,
// resaltando el actual y marcando los ya superados. Presentacional puro; el
// estado del paso lo gobierna CreateChallenge.
export function WizardProgress({ steps, current }: Props) {
  return (
    <ol className={styles.bar} aria-label="Progreso de creación del reto">
      {steps.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'upcoming'
        return (
          <li
            key={label}
            className={styles.step}
            data-state={state}
            aria-current={i === current ? 'step' : undefined}
          >
            <span className={styles.dot}>{i + 1}</span>
            <span className={styles.label}>{label}</span>
          </li>
        )
      })}
    </ol>
  )
}
