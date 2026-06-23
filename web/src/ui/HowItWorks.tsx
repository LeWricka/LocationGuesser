import { Card } from './Card'
import styles from './HowItWorks.module.css'

interface Props {
  /** Compacto: para el usuario recurrente (tras el dashboard); menos peso visual. */
  compact?: boolean
  className?: string
}

// Los 3 pasos del bucle del producto, con su icono y color de marca. Texto
// directo, sin emojis sueltos en el copy (el icono ya es el guiño visual).
const STEPS = [
  {
    icon: '📷',
    title: 'Sube una foto',
    body: 'Estás en un sitio chulo: hazle una foto y guarda tu ubicación real.',
  },
  {
    icon: '🗺️',
    title: 'Adivinad en el mapa',
    body: 'Tus amigos marcan dónde creen que es, contrarreloj.',
  },
  {
    icon: '🏆',
    title: 'Gana quien más se acerca',
    body: 'Sumáis puntos por distancia. Hay clasificación y premios.',
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
