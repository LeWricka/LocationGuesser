import type { CSSProperties } from 'react'
import styles from './Avatar.module.css'

type Size = 'sm' | 'md' | 'lg'

interface Props {
  /** Nombre del usuario: se usa para la inicial de respaldo y el alt. */
  name: string
  /** Foto opcional; si falta se muestra la inicial sobre un fondo de marca. */
  src?: string | null
  size?: Size
  className?: string
}

// Deriva la inicial visible (primera letra del nombre, en mayúscula).
function initialOf(name: string): string {
  const trimmed = name.trim()
  return trimmed ? trimmed[0].toUpperCase() : '?'
}

// Avatar circular del usuario. Si hay `src`, muestra la imagen; si no, la
// inicial sobre el acento de marca. Presentacional (sin subida de imagen).
export function Avatar({ name, src, size = 'md', className }: Props) {
  const classes = [styles.avatar, styles[size], className].filter(Boolean).join(' ')
  const style = { '--avatar-initial-bg': 'var(--color-accent-2-soft)' } as CSSProperties

  if (src) {
    return <img className={classes} src={src} alt={name} style={style} />
  }
  return (
    <span className={classes} style={style} role="img" aria-label={name}>
      {initialOf(name)}
    </span>
  )
}
