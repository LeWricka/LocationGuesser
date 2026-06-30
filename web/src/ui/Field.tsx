import { useId } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Icon } from './Icon'
import styles from './Field.module.css'

interface Props {
  label: ReactNode
  /** Mensaje de error; si existe, marca el control como inválido. */
  error?: string | null
  /** Texto de ayuda bajo la etiqueta. */
  hint?: ReactNode
  /** Marca el campo como obligatorio (asterisco junto a la etiqueta). */
  required?: boolean
  /** Oculta visualmente la etiqueta pero la deja para lectores de pantalla. */
  hideLabel?: boolean
  /**
   * El control (Input, textarea, select…). Recibe `id`, `aria-describedby` y
   * `aria-invalid` inyectados para conectar etiqueta, ayuda y error.
   */
  children: (props: {
    id: string
    'aria-describedby'?: string
    'aria-invalid'?: boolean
  }) => ReactElement
}

// Agrupa label + control + ayuda/error con el cableado de accesibilidad hecho.
export function Field({
  label,
  error,
  hint,
  required = false,
  hideLabel = false,
  children,
}: Props) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={hideLabel ? styles.labelHidden : styles.label}>
        {label}
        {required && (
          // Marca visible de obligatorio; el lector lo anuncia como "obligatorio".
          <span className={styles.required} aria-label="obligatorio">
            *
          </span>
        )}
      </label>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {children({
        id,
        'aria-describedby': describedBy || undefined,
        'aria-invalid': error ? true : undefined,
      })}
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          <Icon icon={AlertTriangle} size={16} className={styles.errorIcon} />
          {error}
        </p>
      )}
    </div>
  )
}
