import { useState } from 'react'
import { defaultAvatarFor, parseAvatar, svgForEmoji, ANIMAL_SVG_VIEWBOX } from '../lib/avatar'
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
// círculo, o un animal cuando no hay foto. Los 8 animales del set por defecto se
// pintan como dibujo de LÍNEA en SVG (estilo Kinfolk: trazo de acento sobre tint
// claro); el resto del set cae al emoji sobre un fondo de color. El MODELO de
// datos no cambia: la clave sigue siendo el emoji (`emoji:<char>`). Presentacional.
export function Avatar({ userId, avatarUrl, name, size = 'md', className }: Props) {
  const label = name?.trim() || 'Avatar'
  const resolved = parseAvatar(avatarUrl, userId)

  // Si la foto no carga (borrada, sin red…), caemos al animal por defecto del id
  // en vez de mostrar el icono roto. Reseteamos el fallo al cambiar de src
  // ajustando estado en render (patrón recomendado por React, sin efecto).
  const src = resolved.kind === 'image' ? resolved.src : null
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const imageFailed = src !== null && failedSrc === src

  if (resolved.kind === 'image' && !imageFailed) {
    const classes = [styles.avatar, styles[size], className].filter(Boolean).join(' ')
    return (
      <img className={classes} src={resolved.src} alt={label} onError={() => setFailedSrc(src)} />
    )
  }

  const emoji = resolved.kind === 'emoji' ? resolved.emoji : defaultAvatarFor(userId).emoji
  const svg = svgForEmoji(emoji)

  // Animal del set por defecto → dibujo de línea (acento sobre tint), sin fondo
  // de color: el lenguaje editorial Pizarra.
  if (svg) {
    const classes = [styles.avatar, styles.line, styles[size], className].filter(Boolean).join(' ')
    return (
      <span className={classes} role="img" aria-label={label}>
        <svg
          className={styles.svg}
          viewBox={ANIMAL_SVG_VIEWBOX}
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </span>
    )
  }

  // Resto del set → emoji grande sobre fondo de color (derivado del animal).
  const bg = resolved.kind === 'emoji' ? resolved.bg : defaultAvatarFor(userId).bg
  const classes = [styles.avatar, styles[size], className].filter(Boolean).join(' ')
  return (
    <span
      className={classes}
      style={{ ['--avatar-bg' as string]: bg.background }}
      role="img"
      aria-label={label}
    >
      <span className={styles.emoji} aria-hidden="true">
        {emoji}
      </span>
    </span>
  )
}
