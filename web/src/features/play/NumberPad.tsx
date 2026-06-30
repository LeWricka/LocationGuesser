import { Delete } from 'lucide-react'
import { Icon } from '../../ui'
import styles from './NumberPad.module.css'

interface Props {
  /** Adivinanza actual como cadena (formato es-ES: coma decimal). */
  value: string
  /** Nueva cadena tras pulsar una tecla. El padre valida/limita. */
  onChange: (next: string) => void
  /** Deshabilita el teclado (p. ej. tras bloquear el número). */
  disabled?: boolean
}

// Teclado numérico EN PANTALLA propio (issue #323). No usamos el del SO: así
// controlamos qué se puede teclear (solo dígitos y UNA coma decimal) y el aspecto
// es coherente con el reto. Una sola coma; el borrado quita el último carácter.
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'] as const

export function NumberPad({ value, onChange, disabled = false }: Props) {
  function press(key: string) {
    if (disabled) return
    if (key === '⌫') {
      onChange(value.slice(0, -1))
      return
    }
    if (key === ',') {
      // Una sola coma decimal; si ya hay una, no añadimos otra.
      if (value.includes(',')) return
      // Coma inicial → "0," para no dejar ",5".
      onChange(value === '' ? '0,' : value + ',')
      return
    }
    onChange(value + key)
  }

  return (
    <div className={styles.pad} role="group" aria-label="Teclado numérico">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          className={`${styles.key} ${key === ',' || key === '⌫' ? styles.keyDim : ''}`}
          onClick={() => press(key)}
          disabled={disabled}
          aria-label={key === '⌫' ? 'Borrar' : key === ',' ? 'Coma decimal' : key}
        >
          {key === '⌫' ? <Icon icon={Delete} size={22} /> : key}
        </button>
      ))}
    </div>
  )
}
