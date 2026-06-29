import type { ReactNode } from 'react'
import { CheckIcon } from './CreateIcons'
import styles from './MediaCard.module.css'

interface Props {
  /** Icono propio del medio (SVG inline), p.ej. <CameraIcon />. */
  icon: ReactNode
  /** Título corto del medio, p.ej. «Foto». */
  title: string
  /** ¿Este medio ya está listo? Cambia el badge «Opcional» por un check. */
  done: boolean
  /** Texto del badge cuando está listo (p.ej. «Añadida»). */
  doneLabel: string
  /** Control del medio (dropzone, toggle de Street View…). */
  children: ReactNode
}

// Tarjeta de un medio OPCIONAL del reto (foto / Street View). Comunica de un
// vistazo que es opcional con un badge; cuando el medio ya está puesto, el badge
// pasa a un check verde. Foto y SV son dos tarjetas iguales: al menos una
// obligatoria (la regla la aplica el gating del paso, no la tarjeta).
export function MediaCard({ icon, title, done, doneLabel, children }: Props) {
  return (
    <section className={styles.card} data-done={done || undefined}>
      <header className={styles.head}>
        <span className={styles.titleGroup}>
          <span className={styles.icon} aria-hidden>
            {icon}
          </span>
          <span className={styles.title}>{title}</span>
        </span>
        {done ? (
          <span className={styles.doneBadge}>
            <CheckIcon size={14} /> {doneLabel}
          </span>
        ) : (
          <span className={styles.optionalBadge}>Opcional</span>
        )}
      </header>
      {children}
    </section>
  )
}
