import { useId } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import styles from './SegmentedControl.module.css'

export interface SegmentedOption<T extends string> {
  value: T
  /** Texto visible del segmento. */
  label: ReactNode
  /** Etiqueta accesible si `label` no es texto (p.ej. solo un icono). */
  ariaLabel?: string
}

interface Props<T extends string> {
  /** Opciones a elegir (plazo, tiempo por jugada, precisión, estrictez…). */
  options: readonly SegmentedOption<T>[]
  /** Valor seleccionado (controlado). */
  value: T
  onChange: (value: T) => void
  /** Etiqueta accesible del grupo entero. */
  label: string
  /** Ocupa todo el ancho (segmentos repartidos). Por defecto true. */
  fullWidth?: boolean
  className?: string
}

// Control segmentado genérico: una fila de opciones mutuamente excluyentes con
// el seleccionado resaltado en acento. Sustituye a las tiras de botones a mano
// que cada pantalla de ajustes (plazo, precisión, estrictez) reinventaba.
// role=radiogroup + flechas: se navega con teclado como un grupo de radios.
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  fullWidth = true,
  className,
}: Props<T>) {
  const groupId = useId()
  const classes = [styles.group, fullWidth ? styles.fullWidth : null, className]
    .filter(Boolean)
    .join(' ')

  // Índice seleccionado → posición del thumb deslizante. Si el valor no está en
  // las opciones (transitorio), se ancla en 0 para no salir de la pista.
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )
  // El CSS lee --count/--index para dimensionar y desplazar el thumb (ver módulo).
  const thumbStyle = {
    '--count': options.length,
    '--index': selectedIndex,
  } as CSSProperties

  // Mueve la selección con flechas (envuelve por los extremos), patrón de radios.
  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const last = options.length - 1
    let next: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = index === last ? 0 : index + 1
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = index === 0 ? last : index - 1
    if (next !== null) {
      e.preventDefault()
      onChange(options[next].value)
    }
  }

  return (
    <div className={classes} role="radiogroup" aria-label={label}>
      {/* Pastilla de acento que se desliza al segmento activo (decorativa). */}
      {options.length > 0 && (
        <span className={styles.thumb} style={thumbStyle} aria-hidden="true" />
      )}
      {options.map((option, index) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.ariaLabel}
            // Solo el seleccionado es tabbable; las flechas mueven dentro (roving tabindex).
            tabIndex={selected ? 0 : -1}
            id={`${groupId}-${option.value}`}
            className={[styles.segment, selected ? styles.selected : null]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
