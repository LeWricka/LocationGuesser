import type { ReactNode } from 'react'
import { ChevronLeft, X } from 'lucide-react'
import { Icon } from './Icon'
import styles from './AppHeader.module.css'

type Variant = 'plain' | 'floating' | 'dense'
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
   * `dense` (issue #705): mismo carácter 5B en miniatura — atrás y título EN
   * LA MISMA FILA, kicker opcional y un hilo corto — para pantallas de TAREA
   * cuyo contenido es un lienzo a sangre que necesita el alto (el mapa de
   * "¿Dónde?"). NO es `floating`: sigue en el flujo normal (papel, no velo
   * sobre escena), solo ocupa mucho menos alto que `plain`.
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
//
// `compact` (issue #705, variant="dense"): mismo trazo en miniatura — más
// corto y más fino — para que el hilo siga leyéndose como firma 5B sin pesar
// en una cabecera de fila única. El tamaño va por atributos SVG (no solo CSS)
// para no depender de que el navegador preserve el ratio al reescalar por CSS.
function HeaderThread({ compact = false }: { compact?: boolean }) {
  const w = compact ? 64 : 140
  const h = compact ? 6 : 10
  const midY = h / 2
  return (
    <svg
      className={styles.thread}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role="presentation"
      aria-hidden="true"
    >
      <path
        className={styles.threadPath}
        d={
          compact
            ? `M2 ${midY} C 20 ${midY}, 32 ${midY}, 46 ${midY}`
            : `M2 ${midY} C 46 ${midY}, 70 ${midY}, 112 ${midY}`
        }
        fill="none"
        strokeLinecap="round"
      />
      <circle
        className={styles.threadDot}
        cx={compact ? 54 : 128}
        cy={midY}
        r={compact ? 2.5 : 3.5}
      />
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

  // Variant "dense" (issue #705): atrás + título EN LA MISMA FILA (5B en
  // miniatura) para pantallas con protagonista a sangre (mapa) que no se
  // pueden permitir el bloque de título de dos filas de "plain". El kicker,
  // si lo hay, va DENTRO del wrap del título (encima, más pequeño) para no
  // sumar una fila propia; el hilo queda corto y fino, indentado bajo el
  // título (no bajo el botón) para que el gesto siga leyendo "5B".
  if (variant === 'dense') {
    return (
      <header className={classes}>
        <div className={styles.denseRow}>
          <div className={styles.slotStart}>{leadButton}</div>
          {title != null && (
            <div className={styles.denseTitleWrap}>
              {kicker != null && <p className={styles.denseKicker}>{kicker}</p>}
              <h1 className={styles.denseTitle}>{title}</h1>
            </div>
          )}
          <div className={styles.slotEnd}>{action}</div>
        </div>
        {title != null && <HeaderThread compact />}
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
