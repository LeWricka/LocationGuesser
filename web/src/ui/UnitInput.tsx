import { useId } from 'react'
import { ChevronDown } from 'lucide-react'
import { Icon } from './Icon'
import styles from './UnitInput.module.css'

export interface Unit {
  /** Valor guardado (p.ej. 'eur', 'km'). */
  value: string
  /** Símbolo mostrado a la derecha del número (p.ej. '€', 'km', '%'). */
  symbol: string
  /** Nombre largo para el menú/lector (p.ej. 'euros'). */
  label?: string
}

interface Props {
  /** Número introducido (controlado, como texto para no perder ceros/decimales). */
  value: string
  onValueChange: (value: string) => void
  /** Unidades disponibles. Incluye personalizadas: solo añade más entradas. */
  units: readonly Unit[]
  unit: string
  onUnitChange: (unit: string) => void
  /** Texto tenue cuando no hay número. Por defecto '0'. */
  placeholder?: string
  /** Etiqueta accesible del campo (no se pinta; el label visual lo pone el padre). */
  label: string
  className?: string
}

// Número grande con la unidad a su derecha, para crear ¿Adivinas? (la respuesta
// correcta) y para jugar. Resuelve dos quejas: el número manda visualmente (no el
// selector) y la unidad NO es solo € (km, kg, %, min y personalizadas).
// inputmode=decimal: en móvil sale el teclado numérico, no el alfabético.
export function UnitInput({
  value,
  onValueChange,
  units,
  unit,
  onUnitChange,
  placeholder = '0',
  label,
  className,
}: Props) {
  const inputId = useId()
  const selected = units.find((u) => u.value === unit) ?? units[0]

  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <input
        id={inputId}
        className={styles.number}
        type="text"
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        // Solo dígitos, un separador decimal y signo opcional: filtramos en cliente
        // para no depender del teclado del sistema (sanea pegados raros también).
        onChange={(e) => onValueChange(e.target.value.replace(/[^\d.,-]/g, ''))}
      />
      <div className={styles.unit}>
        <span className={styles.symbol} aria-hidden="true">
          {selected?.symbol}
        </span>
        <Icon icon={ChevronDown} size={16} className={styles.chevron} />
        {/* El <select> nativo va invisible encima: aporta el menú accesible del
         * sistema (mejor en móvil) sin que tengamos que reimplementar un dropdown. */}
        <select
          className={styles.select}
          value={unit}
          aria-label={`Unidad de ${label}`}
          onChange={(e) => onUnitChange(e.target.value)}
        >
          {units.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label ?? u.symbol}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
