import { useState, type ChangeEvent } from 'react'
import { AlertTriangle, Camera, Play, Star, Trash2 } from 'lucide-react'
import { Icon, Spinner, useToast } from '../../ui'
import {
  extractVideoCoverFrame,
  markFileSelection,
  validateVideoFile,
  VideoValidationError,
} from '../../lib/storage'
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
  /**
   * Ids de fotos que fallaron al subir en el último intento de guardado
   * (#550): se marcan con borde/badge de error para que el dueño sepa cuáles
   * quitar o reintentar en vez de que desaparezcan sin explicación.
   */
  failedIds?: ReadonlySet<string>
  /** Añade fotos (selección múltiple del móvil). */
  onAdd: (files: File[]) => void
  /** Quita una foto por su id local. */
  onRemove: (id: string) => void
  /** Marca una foto como portada (la mueve al frente). */
  onMakeCover: (id: string) => void
  /**
   * ¿Ya hay un clip de vídeo elegido? (issue #649). UN clip por recuerdo en v1:
   * con `true`, un vídeo nuevo se rechaza con aviso en vez de sustituir el
   * actual (el dueño primero quita el que hay).
   */
  hasVideo?: boolean
  /**
   * Id (dentro de `photos`) de la foto que es el FOTOGRAMA-PORTADA del clip
   * (issue #649): se pinta con el badge ▶ para distinguirla de una foto suelta.
   * `null`/ausente si no hay clip.
   */
  videoFrameId?: string | null
  /**
   * Se eligió un vídeo válido (issue #649): ya pasó `validateVideoFile`
   * (duración ≤15s, tamaño ≤40MB) y se extrajo su fotograma-portada. El
   * llamador decide cómo guardarlo (el fotograma entra como una foto más vía
   * `onAdd`-like; el vídeo en sí se sube aparte al guardar).
   */
  onAddVideo?: (file: File, mimeType: string, coverFrame: File) => void
}

/**
 * Fichero elegido que no se pudo LEER al seleccionarlo (#642): en Android, el
 * content-URI del selector (Google Photos u otro) puede estar ya muerto o
 * apuntar a algo aún no descargado. NUNCA entra a `photos` — no tiene sentido
 * dejar que el dueño intente subir algo que ni siquiera se pudo leer al
 * elegirlo — así que vive como estado LOCAL, transitorio, de este picker.
 */
interface UnreadableTile {
  id: string
  name: string
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
  failedIds,
  onAdd,
  onRemove,
  onMakeCover,
  hasVideo = false,
  videoFrameId = null,
  onAddVideo,
}: Props) {
  // Progreso de lectura EN CURSO (#642): mientras copiamos los bytes de cada
  // File recién elegido, secuencialmente, ANTES de que nada entre a `photos`.
  // Con lotes grandes, mostrar "leídas N/M" evita que el picker parezca colgado.
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null)
  const [unreadable, setUnreadable] = useState<UnreadableTile[]>([])
  // Validación/extracción de fotograma del CLIP en curso (issue #649): ambas
  // exigen cargar metadatos/pintar un frame, así que no son instantáneas.
  const [processingVideo, setProcessingVideo] = useState(false)
  const toast = useToast()

  async function handleImages(files: File[]) {
    setReading({ done: 0, total: files.length })
    const copies: File[] = []
    const failedNames: string[] = []
    // SECUENCIAL, no en paralelo (mismo criterio que la subida, #550): leer
    // varias fotos de cámara a la vez de golpe es sospechoso de presión de
    // memoria en móvil; secuencial también hace fiel el progreso done/total.
    for (const file of files) {
      try {
        const buf = await file.arrayBuffer()
        // Copia PROPIA: el `File` original del selector de Android puede morir
        // (content-URI revocado con el tiempo/presión de memoria) mucho antes
        // de guardar; esta copia ya no depende de él, ni para la miniatura ni
        // para la subida — causa raíz del #550, fix definitivo en #642.
        const copy = new File([buf], file.name, {
          type: file.type,
          lastModified: file.lastModified,
        })
        markFileSelection(copy, files.length)
        copies.push(copy)
      } catch {
        // No se pudo leer YA al seleccionarla: no entra al estado del
        // formulario (padre), solo a este aviso local transitorio.
        failedNames.push(file.name)
      }
      setReading((prev) => (prev ? { done: prev.done + 1, total: prev.total } : prev))
    }
    setReading(null)

    if (failedNames.length > 0) {
      setUnreadable((prev) => [
        ...prev,
        ...failedNames.map((name) => ({ id: crypto.randomUUID(), name })),
      ])
      toast.show(
        failedNames.length === 1
          ? `«${failedNames[0]}» no se pudo leer — ¿está descargada?`
          : `${failedNames.length} fotos no se pudieron leer — ¿están descargadas?`,
        { tone: 'danger' },
      )
    }
    if (copies.length > 0) onAdd(copies)
  }

  // UN clip por recuerdo (v1, issue #649): copia-de-bytes (#644, mismo motivo
  // que las fotos) → valida tamaño/duración → extrae el fotograma-portada. Si
  // algo falla, NO entra nada (ni el vídeo ni un fotograma a medias) — aviso
  // claro y listo, el dueño puede intentarlo de nuevo con otro archivo.
  async function handleVideo(file: File, pickedCount: number) {
    if (hasVideo) {
      toast.show(
        'Ya hay un clip en este recuerdo (solo se admite uno). Quítalo antes de añadir otro.',
        { tone: 'danger' },
      )
      return
    }
    if (pickedCount > 1) {
      toast.show('Solo se admite un clip de vídeo por recuerdo: se ignoran los demás.', {
        tone: 'neutral',
      })
    }
    setProcessingVideo(true)
    try {
      const buf = await file.arrayBuffer()
      const copy = new File([buf], file.name, { type: file.type, lastModified: file.lastModified })
      await validateVideoFile(copy)
      const coverFrame = await extractVideoCoverFrame(copy)
      onAddVideo?.(copy, copy.type || file.type, coverFrame)
    } catch (err) {
      const message =
        err instanceof VideoValidationError
          ? err.message
          : `No se pudo leer «${file.name}». Prueba con otro vídeo.`
      toast.show(message, { tone: 'danger' })
    } finally {
      setProcessingVideo(false)
    }
  }

  async function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    // Permite re-elegir los mismos ficheros (de lo contrario onChange no dispara).
    e.target.value = ''
    if (files.length === 0) return

    // El picker acepta fotos Y vídeo en el mismo input (issue #649): se separan
    // por MIME. Las fotos siguen su tubería de siempre; el vídeo (como mucho
    // uno, ver `handleVideo`) su propia validación/extracción.
    const imageFiles = files.filter((f) => !f.type.startsWith('video/'))
    const videoFiles = files.filter((f) => f.type.startsWith('video/'))

    if (imageFiles.length > 0) await handleImages(imageFiles)
    if (videoFiles.length > 0) await handleVideo(videoFiles[0], videoFiles.length)
  }

  function dismissUnreadable(id: string) {
    setUnreadable((prev) => prev.filter((u) => u.id !== id))
  }

  const busy = loading || reading !== null || processingVideo
  // Acepta imagen Y vídeo corto en el MISMO input (issue #649): `handleChange`
  // separa por MIME. `video/quicktime` cubre el .mov que graba un iPhone si el
  // usuario no lo deja re-codificar a mp4 al compartir.
  const acceptAttr = 'image/*,video/mp4,video/webm,video/quicktime'
  const emptyLabel = processingVideo
    ? 'Comprobando el vídeo…'
    : reading
      ? `Leyendo… (${reading.done}/${reading.total})`
      : 'Sube fotos del día'

  // Sin fotos ni errores: tile autoexplicativo (cámara con "+"), todo el bloque es el <label>.
  if (photos.length === 0 && unreadable.length === 0) {
    return (
      <label className={styles.empty} aria-busy={busy || undefined}>
        <span className={styles.icon} aria-hidden>
          {busy ? <Spinner size={28} /> : <Icon icon={Camera} size={28} />}
          {!busy && <span className={styles.plus}>+</span>}
        </span>
        <span className={styles.emptyLabel}>{busy ? emptyLabel : 'Sube fotos del día'}</span>
        <input
          type="file"
          accept={acceptAttr}
          multiple
          aria-label="Añadir fotos del día"
          disabled={busy}
          className={styles.input}
          onChange={(e) => void handleChange(e)}
        />
      </label>
    )
  }

  // Con fotos y/o errores: tira de miniaturas + tiles de error + tile final para añadir más.
  return (
    <div className={styles.gallery}>
      <ul className={styles.strip}>
        {photos.map((photo, i) => {
          const isCover = i === 0
          const failed = failedIds?.has(photo.id) ?? false
          // Fotograma-portada del clip (issue #649): misma tira, mismo tile —
          // solo cambia el badge (▶ en vez de/junto a "Portada") y la etiqueta
          // de "quitar" (quitar la foto TAMBIÉN suelta el clip, ver AddMoment).
          const isVideoFrame = videoFrameId != null && photo.id === videoFrameId
          return (
            <li
              key={photo.id}
              className={styles.tile}
              data-cover={isCover || undefined}
              data-error={failed || undefined}
            >
              <img className={styles.thumb} src={photo.previewUrl} alt="" />
              {i === 0 && loading && (
                <span className={styles.thumbBusy} aria-hidden>
                  <Spinner size={20} />
                </span>
              )}
              {isVideoFrame && (
                <span className={styles.videoBadge} aria-hidden>
                  <Icon icon={Play} size={16} fill="currentColor" />
                </span>
              )}
              {failed ? (
                <span className={styles.errorBadge}>
                  <Icon icon={AlertTriangle} size={14} /> No subida
                </span>
              ) : (
                isCover && (
                  <span className={styles.coverBadge}>
                    <Icon icon={Star} size={14} fill="currentColor" /> Portada
                  </span>
                )
              )}
              <div className={styles.tileActions}>
                {!isCover && (
                  <button
                    type="button"
                    className={styles.makeCover}
                    onClick={() => onMakeCover(photo.id)}
                    aria-label="Marcar como portada"
                  >
                    <Icon icon={Star} size={16} />
                  </button>
                )}
                <button
                  type="button"
                  className={styles.remove}
                  onClick={() => onRemove(photo.id)}
                  aria-label={isVideoFrame ? 'Quitar clip' : 'Quitar foto'}
                >
                  <Icon icon={Trash2} size={18} />
                </button>
              </div>
            </li>
          )
        })}
        {unreadable.map((u) => (
          <li key={u.id} className={styles.tile} data-error>
            <div className={styles.unreadable}>
              <Icon icon={AlertTriangle} size={22} />
              <span className={styles.unreadableName}>{u.name}</span>
              <span className={styles.unreadableHint}>No se pudo leer</span>
            </div>
            <div className={styles.tileActions}>
              <button
                type="button"
                className={styles.remove}
                onClick={() => dismissUnreadable(u.id)}
                aria-label={`Descartar «${u.name}»`}
              >
                <Icon icon={Trash2} size={18} />
              </button>
            </div>
          </li>
        ))}
        <li className={styles.addTile}>
          <label className={styles.addLabel} aria-busy={busy || undefined}>
            <span className={styles.addIcon} aria-hidden>
              +
            </span>
            <span className={styles.addText}>
              {processingVideo ? 'Vídeo…' : reading ? `${reading.done}/${reading.total}` : 'Añadir'}
            </span>
            <input
              type="file"
              accept={acceptAttr}
              multiple
              aria-label="Añadir más fotos"
              disabled={busy}
              className={styles.input}
              onChange={(e) => void handleChange(e)}
            />
          </label>
        </li>
      </ul>
      <span className={styles.count}>
        {photos.length} {photos.length === 1 ? 'foto' : 'fotos'} · la 1ª es la portada
        {hasVideo && ' · con clip'}
      </span>
    </div>
  )
}
