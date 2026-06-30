import type { ReactNode } from 'react'
import { ChevronLeft, X } from 'lucide-react'
import { Icon } from './Icon'
import styles from './AppHeader.module.css'

type Variant = 'plain' | 'floating'
type LeadKind = 'back' | 'close'

interface Props {
  /** Título de la pantalla (voz serif, truncado a una línea). */
  title?: ReactNode
  /**
   * Tipo del control izquierdo: `back` (chevron) o `close` (×). Si no se pasa
   * `onLead`, no se pinta nada a la izquierda (la cabecera queda solo con título).
   */
  lead?: LeadKind
  /** Acción del control izquierdo (volver/cerrar). */
  onLead?: () => void
  /** Etiqueta accesible del control izquierdo (sin texto visible). */
  leadLabel?: string
  /** Acción opcional a la derecha (Invitar, Perfil, ⋯). Un nodo libre. */
  action?: ReactNode
  /**
   * `plain` (por defecto): cabecera sobre papel, hairline inferior.
   * `floating`: sobre escena inmersiva (mapa/foto), con velo de legibilidad,
   * tinta clara y respeto al safe-area superior.
   */
  variant?: Variant
  className?: string
}

// Cabecera ÚNICA del producto: izquierda atrás/cerrar · centro título serif ·
// derecha acción opcional. Sustituye los cuatro patrones de "volver" sueltos.
// El control izquierdo y la acción usan tap target de 44px (icon-button); el
// título trunca a una línea para no romper el layout con nombres largos.
export function AppHeader({
  title,
  lead = 'back',
  onLead,
  leadLabel,
  action,
  variant = 'plain',
  className,
}: Props) {
  const classes = [styles.header, styles[variant], className].filter(Boolean).join(' ')
  const LeadGlyph = lead === 'close' ? X : ChevronLeft
  const fallbackLabel = lead === 'close' ? 'Cerrar' : 'Atrás'

  return (
    <header className={classes}>
      <div className={styles.slotStart}>
        {onLead && (
          <button
            type="button"
            className={styles.iconButton}
            onClick={onLead}
            aria-label={leadLabel ?? fallbackLabel}
          >
            <Icon icon={LeadGlyph} size={22} />
          </button>
        )}
      </div>
      {title != null && <h1 className={styles.title}>{title}</h1>}
      <div className={styles.slotEnd}>{action}</div>
    </header>
  )
}
