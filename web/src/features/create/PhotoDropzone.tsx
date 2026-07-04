import { useState, type ChangeEvent } from 'react'
import { AlertTriangle, Repeat, Trash2 } from 'lucide-react'
import { Icon, IconCamara, Spinner, useToast } from '../../ui'
import { markFileSelection } from '../../lib/storage'
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
  // Lectura EN CURSO de la copia (#642) y último nombre que no se pudo leer
  // (para el tile de error transitorio): un `File` que falla al leerse NUNCA
  // llega a `onPick`, así que esto vive SOLO aquí, no en el estado del padre.
  const [reading, setReading] = useState(false)
  const [unreadableName, setUnreadableName] = useState<string | null>(null)
  const toast = useToast()

  async function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    // Permite re-elegir el mismo fichero (de lo contrario onChange no dispara).
    e.target.value = ''
    if (!file) {
      onPick(null)
      return
    }
    setUnreadableName(null)
    setReading(true)
    try {
      const buf = await file.arrayBuffer()
      // Copia PROPIA: el `File` original del selector de Android puede morir
      // (content-URI revocado con el tiempo/presión de memoria) mucho antes de
      // guardar; esta copia ya no depende de él, ni para la miniatura ni para
      // la subida — causa raíz del #550, fix definitivo en #642.
      const copy = new File([buf], file.name, { type: file.type, lastModified: file.lastModified })
      markFileSelection(copy, 1)
      onPick(copy)
    } catch {
      // No se pudo leer YA al seleccionarla: no entra al estado del
      // formulario (padre no recibe `onPick`), solo a este aviso local.
      setUnreadableName(file.name)
      toast.show(`«${file.name}» no se pudo leer — ¿está descargada?`, { tone: 'danger' })
    } finally {
      setReading(false)
    }
  }

  const busy = loading || reading

  // Con foto: la miniatura manda; cambiar (otro label) y quitar (botón) son
  // controles discretos superpuestos, no botones grises sueltos.
  if (preview) {
    return (
      <div className={styles.filled}>
        <img className={styles.thumb} src={preview} alt="Vista previa de la foto del reto" />
        {busy && (
          <span className={styles.thumbBusy} aria-hidden>
            <Spinner size={20} />
          </span>
        )}
        <div className={styles.actions}>
          <label className={styles.change}>
            <Icon icon={Repeat} size={16} />
            <span>Cambiar</span>
            <input
              type="file"
              accept="image/*"
              aria-label="Cambiar foto del reto"
              disabled={busy}
              className={styles.input}
              onChange={(e) => void handleChange(e)}
            />
          </label>
          <button
            type="button"
            className={styles.remove}
            onClick={onClear}
            disabled={busy}
            aria-label="Quitar foto"
          >
            <Icon icon={Trash2} size={18} />
          </button>
        </div>
      </div>
    )
  }

  // Fallo de lectura al seleccionar (#642): mismo tile que "vacío", con aviso
  // en vez de invitación — sigue siendo un <label>, así que tocarlo reintenta.
  if (unreadableName && !busy) {
    return (
      <label className={styles.empty} data-error>
        <span className={styles.icon} data-error aria-hidden>
          <Icon icon={AlertTriangle} size={28} />
        </span>
        <span className={styles.emptyLabel}>«{unreadableName}» no se pudo leer</span>
        <input
          type="file"
          accept="image/*"
          aria-label="Añadir foto del sitio"
          className={styles.input}
          onChange={(e) => void handleChange(e)}
        />
      </label>
    )
  }

  // Tile autoexplicativo por su forma: icono de cámara con un "+" superpuesto y
  // una etiqueta de 2 palabras. Sin párrafos de ayuda; el aria-label cubre al
  // lector de pantalla.
  return (
    <label className={styles.empty} aria-busy={busy || undefined}>
      <span className={styles.icon} aria-hidden>
        {busy ? <Spinner size={28} /> : <IconCamara size={28} />}
        {!busy && <span className={styles.plus}>+</span>}
      </span>
      <span className={styles.emptyLabel}>{busy ? 'Leyendo…' : (label ?? 'Añadir foto')}</span>
      <input
        type="file"
        accept="image/*"
        aria-label="Añadir foto del sitio"
        disabled={busy}
        className={styles.input}
        onChange={(e) => void handleChange(e)}
      />
    </label>
  )
}
