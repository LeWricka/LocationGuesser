import type { CSSProperties } from 'react'
import { parseAvatar } from '../lib/avatar'
import styles from './Avatar.module.css'

type Size = 'sm' | 'md' | 'lg'

interface Props {
  /** Id del usuario: deriva el avatar por defecto (emoji + fondo) de forma estable. */
  userId: string
  /** `avatar_url` del perfil: `emoji:<char>`, URL http (retrocompat) o null/vacío. */
  avatarUrl?: string | null
  /** Nombre del usuario para el `alt`/`aria-label` (accesibilidad). */
  name?: string
  size?: Size
  className?: string
}

// Avatar circular del usuario: un emoji de animal GRANDE sobre un fondo de
// color (derivado del id), o la imagen si `avatar_url` es una URL antigua. El
// emoji se refuerza con sombra suave + anillo interior claro para que se lea
// bien sobre cualquier fondo del set. Presentacional (sin subida de imagen).
export function Avatar({ userId, avatarUrl, name, size = 'md', className }: Props) {
  const classes = [styles.avatar, styles[size], className].filter(Boolean).join(' ')
  const label = name?.trim() || 'Avatar'
  const resolved = parseAvatar(avatarUrl, userId)

  if (resolved.kind === 'image') {
    return <img className={classes} src={resolved.src} alt={label} />
  }

  const style = { '--avatar-bg': resolved.bg.background } as CSSProperties
  return (
    <span className={classes} style={style} role="img" aria-label={label}>
      <span className={styles.emoji} aria-hidden="true">
        {resolved.emoji}
      </span>
    </span>
  )
}
