import { Plus } from 'lucide-react'
import { Icon } from './Icon'
import styles from './CreateGroupFab.module.css'

interface Props {
  onClick?: () => void
  /** Texto accesible y etiqueta visible en pantallas anchas. */
  label?: string
  className?: string
}

// Botón flotante (FAB) de "Crear grupo" (decisión de producto §3.1: acción
// primaria SIEMPRE accesible, no un botón grande fijo arriba). En móvil es un
// círculo con "+"; a partir de tablet expande la etiqueta. Presentacional: la
// apertura del flujo de creación la cablea #3.
export function CreateGroupFab({ onClick, label = 'Crear viaje', className }: Props) {
  return (
    <button
      type="button"
      className={[styles.fab, className].filter(Boolean).join(' ')}
      onClick={onClick}
      aria-label={label}
    >
      <Icon icon={Plus} size={26} className={styles.icon} />
      <span className={styles.label}>{label}</span>
    </button>
  )
}
