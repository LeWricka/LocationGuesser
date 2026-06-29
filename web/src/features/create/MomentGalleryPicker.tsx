import type { ChangeEvent } from 'react'
import { Spinner } from '../../ui'
import styles from './MomentGalleryPicker.module.css'

/** Una foto en preparación: el File a subir y su object URL para la miniatura. */
export interface DraftPhoto {
  /** Id local estable (para keys de React y marcar portada/quitar sin índices). */
  id: string
  file: File
  /** Object URL de la miniatura; se revoca al quitar/desmontar (lo gestiona el padre). */
  previewUrl: string
}

interface Props {
  /** Fotos elegidas, en orden; la PRIMERA es la portada. */
  photos: DraftPhoto[]
  /** Lectura del EXIF de la primera foto en curso: muestra spinner y bloquea. */
  loading?: boolean
  /** Añade fotos (selección múltiple del móvil). */
  onAdd: (files: File[]) => void
  /** Quita una foto por su id local. */
  onRemove: (id: string) => void
  /** Marca una foto como portada (la mueve al frente). */
  onMakeCover: (id: string) => void
}

/**
 * Selector de GALERÍA para un RECUERDO en el flujo de crear: varias fotos del
 * móvil, con miniaturas y una PORTADA (la primera). El dueño puede marcar otra
 * como portada o quitarla antes de guardar. La subida (comprimir + estripar EXIF)
 * la hace el padre con `uploadImage` al guardar; aquí solo se preparan los Files.
 *
 * Mobile-first: tira horizontal con scroll-snap; cada miniatura lleva sus
 * controles superpuestos. El RETO no usa esto (se queda con una sola foto).
 */
export function MomentGalleryPicker({
  photos,
  loading = false,
  onAdd,
  onRemove,
  onMakeCover,
}: Props) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    // Permite re-elegir los mismos ficheros (de lo contrario onChange no dispara).
    e.target.value = ''
    if (files.length > 0) onAdd(files)
  }

  // Sin fotos: tile autoexplicativo (cámara con "+"), todo el bloque es el <label>.
  if (photos.length === 0) {
    return (
      <label className={styles.empty} aria-busy={loading || undefined}>
        <span className={styles.icon} aria-hidden>
          {loading ? <Spinner size={28} /> : '📷'}
          {!loading && <span className={styles.plus}>+</span>}
        </span>
        <span className={styles.emptyLabel}>{loading ? 'Leyendo…' : 'Sube fotos del día'}</span>
        <input
          type="file"
          accept="image/*"
          multiple
          aria-label="Añadir fotos del día"
          disabled={loading}
          className={styles.input}
          onChange={handleChange}
        />
      </label>
    )
  }

  // Con fotos: tira de miniaturas + tile final para añadir más.
  return (
    <div className={styles.gallery}>
      <ul className={styles.strip}>
        {photos.map((photo, i) => {
          const isCover = i === 0
          return (
            <li key={photo.id} className={styles.tile} data-cover={isCover || undefined}>
              <img className={styles.thumb} src={photo.previewUrl} alt="" />
              {i === 0 && loading && (
                <span className={styles.thumbBusy} aria-hidden>
                  <Spinner size={20} />
                </span>
              )}
              {isCover && <span className={styles.coverBadge}>★ Portada</span>}
              <div className={styles.tileActions}>
                {!isCover && (
                  <button
                    type="button"
                    className={styles.makeCover}
                    onClick={() => onMakeCover(photo.id)}
                    aria-label="Marcar como portada"
                  >
                    <span aria-hidden>★</span>
                  </button>
                )}
                <button
                  type="button"
                  className={styles.remove}
                  onClick={() => onRemove(photo.id)}
                  aria-label="Quitar foto"
                >
                  <span aria-hidden>🗑️</span>
                </button>
              </div>
            </li>
          )
        })}
        <li className={styles.addTile}>
          <label className={styles.addLabel} aria-busy={loading || undefined}>
            <span className={styles.addIcon} aria-hidden>
              +
            </span>
            <span className={styles.addText}>Añadir</span>
            <input
              type="file"
              accept="image/*"
              multiple
              aria-label="Añadir más fotos"
              disabled={loading}
              className={styles.input}
              onChange={handleChange}
            />
          </label>
        </li>
      </ul>
      <span className={styles.count}>
        {photos.length} {photos.length === 1 ? 'foto' : 'fotos'} · la 1ª es la portada
      </span>
    </div>
  )
}
