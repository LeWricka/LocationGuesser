import styles from './BackHomeButton.module.css'

interface Props {
  /** Vuelve a la home. Lo cablea #4 (routing). */
  onClick?: () => void
  label?: string
  className?: string
}

// Control "← Inicio" para cabeceras de grupo y de jugar (§3.4). Hoy la app
// empieza en el hash y no hay "inicio"; este control da el camino de vuelta.
export function BackHomeButton({ onClick, label = 'Inicio', className }: Props) {
  return (
    <button
      type="button"
      className={[styles.back, className].filter(Boolean).join(' ')}
      onClick={onClick}
    >
      <span className={styles.arrow} aria-hidden="true">
        ←
      </span>
      {label}
    </button>
  )
}
