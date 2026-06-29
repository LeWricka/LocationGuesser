import { useState } from 'react'
import {
  canonicalEmoji,
  defaultAvatarFor,
  parseAvatar,
  svgForEmoji,
  ANIMAL_SVG_VIEWBOX,
} from '../lib/avatar'
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
// círculo, o un animal cuando no hay foto. El set por defecto son SOLO 8 animales
// dibujados a LÍNEA en SVG (estilo Atelier: trazo de acento sobre tint claro), así
// que el avatar por defecto SIEMPRE se pinta como SVG (nunca emoji suelto). El
// MODELO de datos no cambia: la clave sigue siendo el emoji (`emoji:<char>`). Un
// token antiguo fuera de los 8 se proyecta de forma estable a uno de los 8 en
// `parseAvatar`. Presentacional.
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

  // Avatar por defecto → SIEMPRE dibujo de línea (acento sobre tint), sin emoji
  // suelto. `parseAvatar` ya normaliza al set canónico de 8, así que el emoji
  // resuelto siempre tiene SVG; `canonicalEmoji` es el cinturón de seguridad por
  // si llegara un emoji crudo (p.ej. al caer una foto que no carga).
  const rawEmoji = resolved.kind === 'emoji' ? resolved.emoji : defaultAvatarFor(userId).emoji
  const emoji = canonicalEmoji(rawEmoji)
  const svg = svgForEmoji(emoji) ?? svgForEmoji(defaultAvatarFor(userId).emoji) ?? ''
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
