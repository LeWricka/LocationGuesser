import { Card } from './Card'
import styles from './HowItWorks.module.css'

interface Props {
  /** Compacto: para el usuario recurrente (tras el dashboard); menos peso visual. */
  compact?: boolean
  className?: string
}

// Los 3 pasos del bucle, alineados al relato nuevo: la identidad es COMPARTIR tus
// recuerdos y VIVIRLOS con los tuyos; adivinar en el mapa es el guiño que lo hace
// divertido, no el qué somos. Texto directo, sin emojis sueltos en el copy (el
// icono ya es el guiño visual).
const STEPS = [
  {
    icon: '📷',
    title: 'Comparte un momento',
    body: 'Una foto y/o Street View del sitio donde estuviste.',
  },
  {
    icon: '🗺️',
    title: 'Lo viven contigo',
    body: 'Los tuyos lo descubren y, de paso, adivinan dónde es.',
  },
  {
    icon: '💛',
    title: 'Guardáis el recuerdo',
    body: 'Cada momento queda en el viaje. Gana quien más se acerca.',
  },
] as const

// Bloque "Cómo funciona": explica el bucle en 3 pasos para que un recién
// llegado entienda el producto de un vistazo. Reutilizable: protagonista en el
// estado vacío y compacto tras el dashboard del usuario recurrente.
export function HowItWorks({ compact = false, className }: Props) {
  return (
    <section
      className={[styles.wrap, compact ? styles.compact : null, className]
        .filter(Boolean)
        .join(' ')}
      aria-labelledby="how-it-works-title"
    >
      <h2 id="how-it-works-title" className={styles.title}>
        Cómo funciona
      </h2>
      <ol className={styles.steps}>
        {STEPS.map((step, i) => (
          <li key={step.title} className={styles.item}>
            <Card padding={compact ? 'sm' : 'md'} className={styles.step}>
              <span className={styles.icon} aria-hidden="true">
                {step.icon}
              </span>
              <div className={styles.stepText}>
                <h3 className={styles.stepTitle}>
                  <span className={styles.stepNum} aria-hidden="true">
                    {i + 1}
                  </span>
                  {step.title}
                </h3>
                {!compact && <p className={styles.stepBody}>{step.body}</p>}
              </div>
            </Card>
          </li>
        ))}
      </ol>
    </section>
  )
}
