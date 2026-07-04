import type { ReactNode } from 'react'
import { ChevronLeft, X } from 'lucide-react'
import { Icon } from './Icon'
import styles from './AppHeader.module.css'

type Variant = 'plain' | 'floating'
type LeadKind = 'back' | 'close'

interface Props {
  /**
   * Título de la pantalla (voz serif). En `variant="floating"` trunca a una
   * línea (layout de fila única); en `variant="plain"` puede partir a una
   * segunda línea (bloque editorial, issue #659) — nombres de viaje largos
   * respiran en vez de truncar de golpe.
   */
  title?: ReactNode
  /**
   * Contexto breve en versalitas ENCIMA del título (p.ej. el nombre del viaje)
   * — solo `variant="plain"` (issue #659, demo "5B · papel con alma"). Prop
   * opcional: sin ella no se pinta kicker, así las pantallas que aún no tienen
   * el nombre del viaje a mano no cambian.
   */
  kicker?: ReactNode
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
   * `plain` (por defecto): cabecera de tarea sobre papel — transparente, atrás
   * fantasma, bloque de título editorial (kicker + serif grande + hilo).
   * `floating`: sobre escena inmersiva (mapa/foto), con velo de legibilidad,
   * tinta clara y respeto al safe-area superior. Sin cambios por #659: fuera
   * de alcance (la demo 5B es para pantallas de TAREA, no inmersivas).
   */
  variant?: Variant
  className?: string
}

// Hilo punteado dorado con punto teal final: firma discreta bajo el título de
// las cabeceras de tarea (issue #659), la misma idea de "camino" que LogoMomentu
// pero aislada del símbolo de marca (aquí es solo un remate tipográfico, no el
// logo entero). El color va por CSS (var(--medal-gold)/var(--accent)) y no por
// atributo SVG para que el design-lint de colores crudos no lo marque y el
// token se pueda recalibrar en un solo sitio.
function HeaderThread() {
  return (
    <svg
      className={styles.thread}
      width="140"
      height="10"
      viewBox="0 0 140 10"
      role="presentation"
      aria-hidden="true"
    >
      <path
        className={styles.threadPath}
        d="M2 5 C 46 5, 70 5, 112 5"
        fill="none"
        strokeLinecap="round"
      />
      <circle className={styles.threadDot} cx="128" cy="5" r="3.5" />
    </svg>
  )
}

// Cabecera ÚNICA del producto: izquierda atrás/cerrar · título · derecha acción
// opcional. Sustituye los cuatro patrones de "volver" sueltos. El control
// izquierdo y la acción usan tap target de 44px (icon-button).
export function AppHeader({
  title,
  kicker,
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

  const leadButton = onLead && (
    <button
      type="button"
      className={styles.iconButton}
      onClick={onLead}
      aria-label={leadLabel ?? fallbackLabel}
    >
      <Icon icon={LeadGlyph} size={22} />
    </button>
  )

  // Variant "floating": fila única sin cambios (título centrado entre los dos
  // slots) — fuera de alcance de #659, que rediseña solo las cabeceras "plain".
  if (variant === 'floating') {
    return (
      <header className={classes}>
        <div className={styles.slotStart}>{leadButton}</div>
        {title != null && <h1 className={styles.title}>{title}</h1>}
        <div className={styles.slotEnd}>{action}</div>
      </header>
    )
  }

  // Variant "plain" (issue #659, demo "5B · papel con alma"): fila de controles
  // arriba (atrás fantasma + acción, solo si hay alguno) y, debajo, el BLOQUE de
  // título editorial — kicker opcional, título serif grande, hilo punteado —
  // en vez del chip de título centrado de antes. Sin controles, el bloque de
  // título arranca directo (sin fila vacía de por medio).
  return (
    <header className={classes}>
      {(leadButton || action) && (
        <div className={styles.controls}>
          <div className={styles.slotStart}>{leadButton}</div>
          <div className={styles.slotEnd}>{action}</div>
        </div>
      )}
      {title != null && (
        <div className={styles.titleBlock}>
          {kicker != null && <p className={styles.kicker}>{kicker}</p>}
          <h1 className={styles.title}>{title}</h1>
          <HeaderThread />
        </div>
      )}
    </header>
  )
}
