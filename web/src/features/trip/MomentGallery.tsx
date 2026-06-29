import { useCallback, useEffect, useRef, useState } from 'react'
import { Spinner, useToast } from '../../ui'
import { Lightbox } from '../../ui/Lightbox'
import {
  addMomentImages,
  listMomentImages,
  removeMomentImage,
  setMomentCover,
  type MomentImage,
} from '../../lib/momentImages'
import { signedImageUrl, uploadImage } from '../../lib/storage'
import { reportError } from '../../lib/observability'
import { describeError } from '../../lib/errors'
import styles from './MomentGallery.module.css'

interface Props {
  /** Momento (recuerdo) cuya galería se muestra. */
  challengeId: string
  /** URL firmada de la portada inicial (la que ya trae el momento), para no
   * parpadear mientras llega la galería. */
  initialCoverUrl: string | null
  /** El usuario es dueño del viaje: ve los controles de portada/añadir/quitar. */
  canEdit: boolean
  /** Tras cambiar la galería (portada/añadir/quitar): refresca el viaje (espejo de image_path). */
  onChanged?: () => void
}

/** Una foto de la galería con su URL firmada lista para mostrar. */
interface SignedImage extends MomentImage {
  url: string | null
}

/**
 * GALERÍA de un RECUERDO en la hoja de detalle: carrusel con scroll-snap (swipe en
 * móvil), indicador de cuántas hay y, si eres dueño, controles para añadir más
 * fotos, elegir portada y quitar. Cada cambio re-espeja `challenges.image_path`
 * (lo hace la capa de datos) y avisa al padre para refrescar el viaje (tarjeta +
 * mapamundi). El RETO NO usa esto (se queda con su foto única).
 */
export function MomentGallery({ challengeId, initialCoverUrl, canEdit, onChanged }: Props) {
  const [images, setImages] = useState<SignedImage[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [active, setActive] = useState(0)
  // Índice de la foto abierta en el lightbox; null = cerrado.
  const [lightboxAt, setLightboxAt] = useState<number | null>(null)
  const toast = useToast()
  const trackRef = useRef<HTMLUListElement>(null)

  // Carga la galería y firma las URLs en lote (bucket privado). La portada es la
  // de menor sort_order (ya viene ordenada de la capa de datos).
  const load = useCallback(async () => {
    try {
      const rows = await listMomentImages(challengeId)
      const signed = await Promise.all(
        rows.map(async (row) => ({ ...row, url: await signedImageUrl(row.image_path) })),
      )
      setImages(signed)
    } catch (err) {
      reportError(err, { area: 'moment_gallery_load' })
    } finally {
      setLoading(false)
    }
  }, [challengeId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load es async: el setState corre tras el fetch, no síncrono
    void load()
  }, [load])

  // Índice visible del carrusel a partir del scroll (para el indicador "n/N").
  const onScroll = () => {
    const el = trackRef.current
    if (!el) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    setActive(i)
  }

  async function handleAdd(files: File[]) {
    if (files.length === 0) return
    setBusy(true)
    try {
      const paths: string[] = []
      for (const file of files) {
        paths.push(await uploadImage(file))
      }
      await addMomentImages(challengeId, paths)
      await load()
      onChanged?.()
      toast.show(files.length === 1 ? 'Foto añadida' : 'Fotos añadidas', { tone: 'success' })
    } catch (err) {
      reportError(err, { area: 'moment_gallery_add' })
      toast.show(`No se pudo añadir: ${describeError(err)}`, { tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  async function handleCover(imageId: string) {
    setBusy(true)
    try {
      await setMomentCover(challengeId, imageId)
      await load()
      onChanged?.()
      toast.show('Portada actualizada', { tone: 'success' })
    } catch (err) {
      reportError(err, { area: 'moment_gallery_cover' })
      toast.show(`No se pudo cambiar la portada: ${describeError(err)}`, { tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(imageId: string) {
    setBusy(true)
    try {
      await removeMomentImage(challengeId, imageId)
      await load()
      onChanged?.()
      toast.show('Foto quitada', { tone: 'success' })
    } catch (err) {
      reportError(err, { area: 'moment_gallery_remove' })
      toast.show(`No se pudo quitar: ${describeError(err)}`, { tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  // Mientras carga la galería, mostramos la portada que ya trae el momento (sin
  // parpadeo). Si al cargar no hay filas pero sí portada inicial, la mostramos sola.
  if (loading) {
    return (
      <div className={styles.gallery}>
        <div className={styles.frame}>
          {initialCoverUrl ? (
            <img className={styles.photo} src={initialCoverUrl} alt="" />
          ) : (
            <span className={styles.placeholder} aria-hidden>
              🏔️
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.gallery}>
      <ul ref={trackRef} className={styles.track} onScroll={onScroll}>
        {images.length === 0 ? (
          <li className={styles.slide}>
            <span className={styles.placeholder} aria-hidden>
              🏔️
            </span>
          </li>
        ) : (
          images.map((img, i) => (
            <li key={img.id} className={styles.slide}>
              {img.url ? (
                <button
                  type="button"
                  className={styles.photoBtn}
                  onClick={() => setLightboxAt(i)}
                  aria-label="Ampliar foto"
                >
                  <img className={styles.photo} src={img.url} alt="" loading="lazy" />
                </button>
              ) : (
                <span className={styles.placeholder} aria-hidden>
                  🏔️
                </span>
              )}
              {i === 0 && <span className={styles.coverBadge}>★ Portada</span>}
              {canEdit && (
                <div className={styles.slideActions}>
                  {i !== 0 && (
                    <button
                      type="button"
                      className={styles.action}
                      disabled={busy}
                      onClick={() => void handleCover(img.id)}
                      aria-label="Marcar como portada"
                    >
                      <span aria-hidden>★</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.action}
                    disabled={busy}
                    onClick={() => void handleRemove(img.id)}
                    aria-label="Quitar foto"
                  >
                    <span aria-hidden>🗑️</span>
                  </button>
                </div>
              )}
            </li>
          ))
        )}
      </ul>

      {/* Indicador "n/N" cuando hay más de una foto. */}
      {images.length > 1 && (
        <div className={styles.dots} aria-hidden>
          {images.map((img, i) => (
            <span key={img.id} className={styles.dot} data-on={i === active || undefined} />
          ))}
        </div>
      )}

      {/* Añadir más fotos (solo dueño). El input acepta selección múltiple. */}
      {canEdit && (
        <label className={styles.addRow} aria-busy={busy || undefined}>
          {busy ? <Spinner size={16} /> : <span aria-hidden>＋</span>}
          <span>{busy ? 'Subiendo…' : 'Añadir más fotos'}</span>
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={busy}
            className={styles.fileInput}
            aria-label="Añadir más fotos a la galería"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              e.target.value = ''
              void handleAdd(files)
            }}
          />
        </label>
      )}

      {lightboxAt !== null && (
        <Lightbox
          open
          images={images
            .filter((img): img is SignedImage & { url: string } => img.url != null)
            .map((img) => ({ src: img.url, alt: 'Foto del recuerdo' }))}
          startIndex={lightboxAt}
          onClose={() => setLightboxAt(null)}
        />
      )}
    </div>
  )
}
