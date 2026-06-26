import type { ChangeEvent } from 'react'
import { Spinner } from '../../ui'
import styles from './PhotoDropzone.module.css'

interface Props {
  /** URL de la miniatura (object URL) cuando ya hay foto; null si no hay. */
  preview: string | null
  /** Lectura del EXIF/subida en curso: muestra spinner y bloquea. */
  loading?: boolean
  /** Devuelve el fichero elegido (o null si se canceló). */
  onPick: (file: File | null) => void
  /** Quita la foto actual. */
  onClear: () => void
  /** Texto de la zona vacía (p.ej. «Sube una foto del sitio»). */
  label?: string
}

// Tile grande de foto para crear reto. Sin foto: una zona-tarjeta con icono y
// label corta, todo el bloque es un <label> que dispara el input file oculto.
// Con foto: muestra la miniatura con controles discretos de cambiar/quitar.
// Reemplaza el FileButton gris "horroroso" por una superficie visual.
export function PhotoDropzone({ preview, loading = false, onPick, onClear, label }: Props) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    // Permite re-elegir el mismo fichero (de lo contrario onChange no dispara).
    e.target.value = ''
    onPick(file)
  }

  // Con foto: la miniatura manda; cambiar (otro label) y quitar (botón) son
  // controles discretos superpuestos, no botones grises sueltos.
  if (preview) {
    return (
      <div className={styles.filled}>
        <img className={styles.thumb} src={preview} alt="Vista previa de la foto del reto" />
        {loading && (
          <span className={styles.thumbBusy} aria-hidden>
            <Spinner size={20} />
          </span>
        )}
        <div className={styles.actions}>
          <label className={styles.change}>
            <span aria-hidden>🔁</span>
            <span>Cambiar</span>
            <input
              type="file"
              accept="image/*"
              aria-label="Cambiar foto del reto"
              disabled={loading}
              className={styles.input}
              onChange={handleChange}
            />
          </label>
          <button
            type="button"
            className={styles.remove}
            onClick={onClear}
            disabled={loading}
            aria-label="Quitar foto"
          >
            <span aria-hidden>🗑️</span>
          </button>
        </div>
      </div>
    )
  }

  // Tile autoexplicativo por su forma: icono de cámara con un "+" superpuesto y
  // una etiqueta de 2 palabras. Sin párrafos de ayuda; el aria-label cubre al
  // lector de pantalla.
  return (
    <label className={styles.empty} aria-busy={loading || undefined}>
      <span className={styles.icon} aria-hidden>
        {loading ? <Spinner size={28} /> : '📷'}
        {!loading && <span className={styles.plus}>+</span>}
      </span>
      <span className={styles.emptyLabel}>{loading ? 'Leyendo…' : (label ?? 'Añadir foto')}</span>
      <input
        type="file"
        accept="image/*"
        aria-label="Añadir foto del sitio"
        disabled={loading}
        className={styles.input}
        onChange={handleChange}
      />
    </label>
  )
}
