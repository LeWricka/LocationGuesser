import type { ChangeEvent, ReactNode } from 'react'
import { Spinner } from './Spinner'
import buttonStyles from './Button.module.css'
import styles from './FileButton.module.css'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface Props {
  /** Id del input (lo inyecta Field para conectar la etiqueta). */
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  /** Filtro de tipos aceptados (p.ej. `image/*`). */
  accept?: string
  /** Muestra spinner y bloquea la interacción (lectura/subida en curso). */
  loading?: boolean
  /** Deshabilita el control sin spinner. */
  disabled?: boolean
  variant?: Variant
  size?: Size
  fullWidth?: boolean
  /** Etiqueta accesible del input oculto (p.ej. «Añadir foto del reto»). */
  ariaLabel?: string
  /** Devuelve el primer fichero elegido, o `null` si se canceló/limpió. */
  onPick: (file: File | null) => void
  children: ReactNode
}

// Botón de archivo del UI kit: un <label> con pinta de Button que envuelve un
// <input type="file"> oculto (accesible). Sustituye al feo control nativo
// «Choose file» del navegador. El <input> se resetea (value = '') tras cada
// elección para permitir volver a elegir el MISMO fichero.
export function FileButton({
  id,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  accept,
  loading = false,
  disabled = false,
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  ariaLabel,
  onPick,
  children,
}: Props) {
  const blocked = disabled || loading

  const classes = [
    buttonStyles.button,
    buttonStyles[variant],
    buttonStyles[size],
    fullWidth ? buttonStyles.fullWidth : null,
    loading ? buttonStyles.loading : null,
    blocked ? styles.disabled : null,
    styles.label,
  ]
    .filter(Boolean)
    .join(' ')

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    // Permite re-elegir el mismo fichero (de lo contrario onChange no dispara).
    e.target.value = ''
    onPick(file)
  }

  return (
    <label
      className={classes}
      aria-disabled={blocked || undefined}
      aria-busy={loading || undefined}
    >
      {loading && <Spinner size={16} className={buttonStyles.spinner} />}
      <span className={buttonStyles.label}>{children}</span>
      <input
        id={id}
        type="file"
        accept={accept}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        disabled={blocked}
        className={styles.input}
        onChange={handleChange}
      />
    </label>
  )
}
