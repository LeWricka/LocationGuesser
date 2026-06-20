import { ChallengePhoto } from './ChallengePhoto'
import styles from './PhotoStrip.module.css'

export interface PhotoStripItem {
  /** Identificador estable de la foto (key de React). */
  id: string
  src?: string | null
  alt?: string
  /** Etiqueta opcional sobre la miniatura (p.ej. "Lisboa"). */
  caption?: string
}

interface Props {
  /** Histórico de fotos del grupo (mockeable). */
  photos: PhotoStripItem[]
  /** Texto del estado vacío (sin fotos todavía). */
  emptyLabel?: string
  /** Al pulsar una miniatura (lo cablean las features). */
  onSelect?: (id: string) => void
  className?: string
}

// Galería horizontal con scroll de las fotos del grupo (histórico). Mobile-first:
// tira scrolleable que no rompe el ancho de la página. Presentacional.
export function PhotoStrip({
  photos,
  emptyLabel = 'Aún no hay fotos en este grupo.',
  onSelect,
  className,
}: Props) {
  if (photos.length === 0) {
    return <p className={[styles.empty, className].filter(Boolean).join(' ')}>{emptyLabel}</p>
  }

  return (
    <ul className={[styles.strip, className].filter(Boolean).join(' ')}>
      {photos.map((photo) => (
        <li key={photo.id} className={styles.item}>
          <ChallengePhoto
            src={photo.src}
            alt={photo.alt ?? 'Foto del reto'}
            caption={photo.caption}
            ratio="square"
            size="lg"
            onClick={onSelect ? () => onSelect(photo.id) : undefined}
          />
        </li>
      ))}
    </ul>
  )
}
