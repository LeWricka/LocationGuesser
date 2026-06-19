import type { InputHTMLAttributes, Ref } from 'react'
import styles from './Input.module.css'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  /** Marca el campo como inválido (borde de error). Field lo gestiona por ti. */
  invalid?: boolean
  ref?: Ref<HTMLInputElement>
}

// Input controlado por estilos. Sin lógica: la validación/labels viven en Field.
export function Input({ invalid, className, ref, ...rest }: Props) {
  const classes = [styles.input, invalid ? styles.invalid : null, className]
    .filter(Boolean)
    .join(' ')
  return <input ref={ref} className={classes} aria-invalid={invalid || undefined} {...rest} />
}
