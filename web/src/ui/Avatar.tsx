import { useState, type CSSProperties } from 'react'
import { defaultAvatarFor, parseAvatar } from '../lib/avatar'
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

// Avatar circular del usuario: la foto de perfil (URL http) recortada en
// círculo, o un emoji de animal GRANDE sobre un fondo de color (derivado del
// id) cuando no hay foto. El emoji se refuerza con sombra suave + anillo
// interior claro para leerse bien sobre cualquier fondo del set. Presentacional.
export function Avatar({ userId, avatarUrl, name, size = 'md', className }: Props) {
  const classes = [styles.avatar, styles[size], className].filter(Boolean).join(' ')
  const label = name?.trim() || 'Avatar'
  const resolved = parseAvatar(avatarUrl, userId)

  // Si la foto no carga (borrada, sin red…), caemos al animal por defecto del id
  // en vez de mostrar el icono roto. Reseteamos el fallo al cambiar de src
  // ajustando estado en render (patrón recomendado por React, sin efecto).
  const src = resolved.kind === 'image' ? resolved.src : null
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const imageFailed = src !== null && failedSrc === src

  if (resolved.kind === 'image' && !imageFailed) {
    return (
      <img
        className={classes}
        src={resolved.src}
        alt={label}
        onError={() => setFailedSrc(src)}
      />
    )
  }

  const bg = resolved.kind === 'emoji' ? resolved.bg : defaultAvatarFor(userId).bg
  const emoji = resolved.kind === 'emoji' ? resolved.emoji : defaultAvatarFor(userId).emoji
  const style = { '--avatar-bg': bg.background } as CSSProperties
  return (
    <span className={classes} style={style} role="img" aria-label={label}>
      <span className={styles.emoji} aria-hidden="true">
        {emoji}
      </span>
    </span>
  )
}
