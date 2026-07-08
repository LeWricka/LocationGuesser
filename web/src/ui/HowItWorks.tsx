import { Camera, Heart, Map as MapIcon } from 'lucide-react'
import { Card } from './Card'
import { Icon } from './Icon'
import styles from './HowItWorks.module.css'

interface Props {
  /** Compacto: para el usuario recurrente (tras el dashboard); menos peso visual. */
  compact?: boolean
  className?: string
}

// Los 3 pasos del bucle. Mismo copy que HowItWorksImmersive (issue #729): las
// dos versiones del bloque contaban el mismo bucle con palabras distintas y
// una de ellas arrastraba los tics de IA — ahora una sola voz para ambas.
const STEPS = [
  {
    icon: Camera,
    title: 'Sube una foto',
    body: 'Del viaje, del finde, de donde sea. Con el sitio si te apetece.',
  },
  {
    icon: MapIcon,
    title: 'Los tuyos adivinan',
    body: '¿Dónde es? Marcan en el mapa a contrarreloj. El que más se acerca, gana.',
  },
  {
    icon: Heart,
    title: 'Se queda para siempre',
    body: 'Todo va al diario del viaje. Para volver cuando queráis.',
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
              <span className={styles.icon}>
                <Icon icon={step.icon} size={28} />
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
