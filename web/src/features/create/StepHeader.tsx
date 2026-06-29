import type { ReactNode } from 'react'
import { Button } from '../../ui'
import styles from './StepHeader.module.css'

interface Props {
  /** Eyebrow editorial sobre el título (p.ej. «La respuesta»). */
  eyebrow: string
  /** Título serif del paso (p.ej. «¿Dónde es?»). */
  title: string
  /** Subtítulo breve que explica el paso (una frase, opcional). */
  hint?: string
  /** Ilustración SVG propia que acompaña al título (opcional). */
  icon?: ReactNode
  /** Posición del paso actual (1-based) y total, para el progreso por puntos. */
  current: number
  total: number
  /** Vuelve al paso anterior (o cancela en el primero). */
  onBack: () => void
}

// Cabecera editorial de cada paso del asistente. Sustituye a la barra de pasos
// por: un atajo «Atrás» discreto + progreso por puntos (1 · 2 · 3), un eyebrow
// en mayúsculas y un título serif grande con un icono propio del paso. La
// jerarquía la lleva la tipografía (tamaño/peso/familia), no una caja de color.
export function StepHeader({ eyebrow, title, hint, icon, current, total, onBack }: Props) {
  return (
    <header className={styles.header}>
      <div className={styles.topRow}>
        <Button variant="ghost" size="sm" onClick={onBack} aria-label="Volver al paso anterior">
          ← Atrás
        </Button>
        <ol className={styles.progress} aria-label={`Paso ${current} de ${total}`}>
          {Array.from({ length: total }, (_, i) => {
            const n = i + 1
            const state = n < current ? 'done' : n === current ? 'active' : 'idle'
            return <li key={n} className={styles.dot} data-state={state} aria-hidden />
          })}
        </ol>
      </div>
      <div className={styles.titleRow}>
        {icon && <span className={styles.icon}>{icon}</span>}
        <div className={styles.titleText}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1 className={styles.title}>{title}</h1>
        </div>
      </div>
      {hint && <p className={styles.hint}>{hint}</p>}
    </header>
  )
}
