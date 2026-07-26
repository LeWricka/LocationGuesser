import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Plus,
  RotateCcw,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { Icon, IconCamara, Spinner, useToast } from '../../ui'
import { Lightbox } from '../../ui/Lightbox'
import {
  addMomentImages,
  getMomentGalleryMeta,
  listMomentImages,
  removeMomentImage,
  reorderMomentImages,
  setMomentCover,
  setPhotosAutoOrder,
  type MomentImage,
} from '../../lib/momentImages'
import { signedImageUrl, uploadImage } from '../../lib/storage'
import { readPhotoMetaFromExif } from '../../lib/exif'
import { reportError } from '../../lib/observability'
import { describeError } from '../../lib/errors'
import styles from './MomentGallery.module.css'

// Retardo del gesto "mantener pulsado" antes de que un toque en una miniatura
// se convierta en arrastre (issue #952): por debajo de esto es un TAP/scroll
// normal de la cuadrícula, no una intención de reordenar.
const LONG_PRESS_MS = 350
// Umbral de movimiento (px) durante la espera del mantener-pulsado: si el dedo
// se mueve más que esto antes de que cumpla `LONG_PRESS_MS`, es un scroll, no
// un intento de arrastre — se cancela el temporizador.
const MOVE_CANCEL_PX = 10
// Franja (px) desde el borde superior/inferior de la cuadrícula donde el
// autoscroll empieza a desplazarla mientras se arrastra una foto casi fuera
// de la vista (cuadrícula larga, varias filas).
const AUTOSCROLL_EDGE_PX = 56

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
 *
 * REORDENAR A MANO (issue #952): el dueño puede entrar en una cuadrícula
 * dedicada ("Ordenar fotos") y arrastrar para reordenar — mantener pulsado
 * (`LONG_PRESS_MS`) sobre una miniatura la "levanta", arrastrarla sobre otra
 * las intercambia en vivo, y soltar persiste (`reorderMomentImages`). Ese
 * gesto vive en una cuadrícula APARTE del carrusel de swipe: reordenar varias
 * fotas a la vez necesita verlas todas juntas, algo que el carrusel (una foto
 * a pantalla completa) no ofrece. Sin librería de arrastre: Pointer Events
 * nativos bastan para una lista/cuadrícula plana (sin el dnd multi-eje ni el
 * sensor de teclado que justificarían @dnd-kit) — el fallback de teclado
 * (`moveTile`, botones ←/→) cubre la accesibilidad sin esa dependencia extra.
 */
export function MomentGallery({ challengeId, initialCoverUrl, canEdit, onChanged }: Props) {
  const [images, setImages] = useState<SignedImage[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [active, setActive] = useState(0)
  // Índice de la foto abierta en el lightbox; null = cerrado.
  const [lightboxAt, setLightboxAt] = useState<number | null>(null)
  // Foto en confirmación de borrado (id) o null. Quitar es destructivo, así que
  // pedimos un segundo toque EN LÍNEA (sin abrir un modal pesado): la papelera
  // arma el estado y la tira de acciones cambia a confirmar/cancelar.
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null)
  // ¿Está el momento en orden MANUAL (`challenges.photos_manual_order`)? false
  // (default) = por fecha de captura (#951). Gobierna el aviso "Volver a orden
  // por fecha".
  const [manualOrder, setManualOrder] = useState(false)
  // Path de la portada (`challenges.image_path`, issue #954): decide qué foto
  // lleva el badge/star, DESACOPLADO del orden (`sort_order`/`sort_at`).
  const [coverPath, setCoverPath] = useState<string | null>(null)
  // ¿Se está mostrando la cuadrícula de reordenar (en vez del carrusel)?
  const [reordering, setReordering] = useState(false)
  // Orden de trabajo de la cuadrícula (ids): se actualiza EN VIVO mientras se
  // arrastra; al soltar, si difiere del orden cargado, se persiste.
  const [orderIds, setOrderIds] = useState<string[]>([])
  // Id de la miniatura agarrada (mantener pulsado cumplido) o null si nada se
  // está arrastrando todavía (puede haber una espera de long-press en curso
  // sin que esto se haya activado aún, ver `pressTimer`).
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const toast = useToast()
  const trackRef = useRef<HTMLUListElement>(null)
  const gridRef = useRef<HTMLUListElement>(null)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressStart = useRef<{ x: number; y: number } | null>(null)

  // Carga la galería (orden de VISUALIZACIÓN: sort_order si manual, sort_at si
  // auto — lo decide `listMomentImages`) y firma las URLs en lote (bucket
  // privado). La portada se lee aparte (`challenges.image_path`, issue #954,
  // ver `coverId` más abajo): es una elección independiente del orden.
  const load = useCallback(async () => {
    try {
      const [rows, meta] = await Promise.all([
        listMomentImages(challengeId),
        getMomentGalleryMeta(challengeId),
      ])
      const signed = await Promise.all(
        rows.map(async (row) => ({ ...row, url: await signedImageUrl(row.image_path) })),
      )
      setImages(signed)
      setManualOrder(meta.manualOrder)
      setCoverPath(meta.coverPath)
      setOrderIds(signed.map((img) => img.id))
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
      // El EXIF (fecha de captura + GPS) se lee del archivo ORIGINAL antes de
      // subir: `uploadImage` comprime a canvas y lo borra (issue #950).
      const items: {
        path: string
        takenAt: string | null
        lat: number | null
        lng: number | null
      }[] = []
      for (const file of files) {
        const meta = await readPhotoMetaFromExif(file)
        const path = await uploadImage(file)
        items.push({ path, ...meta })
      }
      await addMomentImages(challengeId, items)
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
      setConfirmingRemove(null)
    }
  }

  // Persiste un nuevo orden (arrastrar o mover por teclado): la cuadrícula ya
  // está pintada en `newOrder` (optimista, `setOrderIds` de quien llama), pero
  // el CARRUSEL pinta desde `images` — hay que recargar (`load`) tras guardar
  // para que el carrusel refleje el nuevo orden al salir de "Ordenar fotos"
  // (issue #954: antes se quedaba con el orden viejo hasta un refresco). Si
  // falla, recargar también evita dejar la UI desincronizada del servidor.
  async function persistReorder(newOrder: string[]) {
    setBusy(true)
    try {
      await reorderMomentImages(challengeId, newOrder)
      await load()
      onChanged?.()
    } catch (err) {
      reportError(err, { area: 'moment_gallery_reorder' })
      toast.show(`No se pudo reordenar: ${describeError(err)}`, { tone: 'danger' })
      await load()
    } finally {
      setBusy(false)
    }
  }

  // Fallback de TECLADO (accesible sin arrastrar): mueve la miniatura enfocada
  // un puesto a la izquierda/derecha y persiste de inmediato.
  function moveTile(id: string, direction: -1 | 1) {
    const from = orderIds.indexOf(id)
    const to = from + direction
    if (from === -1 || to < 0 || to >= orderIds.length) return
    const next = [...orderIds]
    ;[next[from], next[to]] = [next[to], next[from]]
    setOrderIds(next)
    void persistReorder(next)
  }

  async function handleAutoOrder() {
    setBusy(true)
    try {
      await setPhotosAutoOrder(challengeId)
      await load()
      onChanged?.()
      toast.show('Orden por fecha restaurado', { tone: 'success' })
    } catch (err) {
      reportError(err, { area: 'moment_gallery_auto_order' })
      toast.show(`No se pudo cambiar el orden: ${describeError(err)}`, { tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  // Arrancan el "mantener pulsado": si el dedo se levanta o se mueve más de
  // `MOVE_CANCEL_PX` antes de cumplirse `LONG_PRESS_MS`, se cancela (era un
  // scroll de la cuadrícula, no una intención de arrastrar) — ver `onTileMove`.
  function onTilePointerDown(e: ReactPointerEvent<HTMLLIElement>, id: string) {
    if (busy || (e.pointerType === 'mouse' && e.button !== 0)) return
    pressStart.current = { x: e.clientX, y: e.clientY }
    if (pressTimer.current) clearTimeout(pressTimer.current)
    pressTimer.current = setTimeout(() => setDraggingId(id), LONG_PRESS_MS)
  }

  function onTilePointerMove(e: ReactPointerEvent<HTMLLIElement>) {
    if (draggingId || !pressStart.current) return
    const dx = e.clientX - pressStart.current.x
    const dy = e.clientY - pressStart.current.y
    if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) {
      if (pressTimer.current) clearTimeout(pressTimer.current)
      pressStart.current = null
    }
  }

  function onTilePointerUp() {
    if (pressTimer.current) clearTimeout(pressTimer.current)
    pressStart.current = null
  }

  // Mientras se arrastra una miniatura (`draggingId` puesto tras el
  // mantener-pulsado): sigue el dedo/ratón por `window` (no por el elemento —
  // el dedo se mueve por ENCIMA de otras miniaturas), reordena `orderIds` EN
  // VIVO al pasar sobre otra foto, autoscrollea la cuadrícula cerca de sus
  // bordes si es más larga que la vista, y al soltar persiste si el orden
  // cambió de verdad.
  useEffect(() => {
    if (!draggingId) return
    // Copia narrowed (no-null) para las funciones anidadas: TS no propaga el
    // `if (!draggingId) return` de arriba dentro de closures anidadas.
    const id = draggingId

    function tileIdAt(x: number, y: number): string | null {
      const el = document.elementFromPoint(x, y)
      const tile = el instanceof Element ? el.closest<HTMLElement>('[data-tile-id]') : null
      return tile?.dataset.tileId ?? null
    }

    function autoScroll(y: number) {
      const grid = gridRef.current
      if (!grid) return
      const rect = grid.getBoundingClientRect()
      if (y < rect.top + AUTOSCROLL_EDGE_PX) {
        grid.scrollTop -= AUTOSCROLL_EDGE_PX - (y - rect.top)
      } else if (y > rect.bottom - AUTOSCROLL_EDGE_PX) {
        grid.scrollTop += AUTOSCROLL_EDGE_PX - (rect.bottom - y)
      }
    }

    function onMove(e: PointerEvent) {
      e.preventDefault()
      autoScroll(e.clientY)
      const overId = tileIdAt(e.clientX, e.clientY)
      if (!overId || overId === id) return
      setOrderIds((prev) => {
        const from = prev.indexOf(id)
        const to = prev.indexOf(overId)
        if (from === -1 || to === -1 || from === to) return prev
        const next = [...prev]
        next.splice(from, 1)
        next.splice(to, 0, id)
        return next
      })
    }

    function onUp() {
      setDraggingId(null)
      setOrderIds((current) => {
        const original = images.map((img) => img.id)
        const changed =
          current.length !== original.length ||
          current.some((currentId, i) => currentId !== original[i])
        if (changed) void persistReorder(current)
        return current
      })
    }

    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persistReorder/images cambian cada render; solo nos interesa re-engancharnos al cambiar de foto arrastrada
  }, [draggingId])

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
              <IconCamara size={28} className={styles.placeholderIcon} />
            </span>
          )}
        </div>
      </div>
    )
  }

  // La PORTADA es la foto cuyo `image_path` coincide con `challenges.image_path`
  // (issue #954) — NI la posición [0] ni el menor `sort_order`: es una
  // elección explícita, desacoplada del orden de visualización/arrastre.
  const coverId = images.find((img) => img.image_path === coverPath)?.id ?? null

  return (
    <div className={styles.gallery}>
      {reordering ? (
        // Cuadrícula de reordenar (arrastrar y soltar, ver el bloque grande de
        // comentario sobre el componente): reemplaza el carrusel mientras dura,
        // "Listo" (abajo) vuelve a él. `gridRef` es el contenedor que autoscrollea
        // el `useEffect` de arriba si la cuadrícula es más larga que la vista.
        <ul ref={gridRef} className={styles.reorderGrid}>
          {orderIds.map((id, i) => {
            const img = images.find((im) => im.id === id)
            if (!img) return null
            const isCover = img.id === coverId
            return (
              <li
                key={id}
                data-tile-id={id}
                className={
                  draggingId === id
                    ? `${styles.reorderTile} ${styles.reorderTileDragging}`
                    : styles.reorderTile
                }
                onPointerDown={(e) => onTilePointerDown(e, id)}
                onPointerMove={onTilePointerMove}
                onPointerUp={onTilePointerUp}
                onPointerCancel={onTilePointerUp}
              >
                {img.url ? (
                  <img className={styles.reorderPhoto} src={img.url} alt="" draggable={false} />
                ) : (
                  <span className={styles.placeholder} aria-hidden>
                    <IconCamara size={20} className={styles.placeholderIcon} />
                  </span>
                )}
                {isCover && (
                  <span className={styles.reorderCoverBadge} aria-label="Portada">
                    <Icon icon={Star} size={11} fill="currentColor" />
                  </span>
                )}
                <span className={styles.reorderHandle} aria-hidden>
                  <Icon icon={GripVertical} size={16} />
                </span>
                {/* Fallback de TECLADO (sin arrastrar): mover un puesto. */}
                <span className={styles.reorderKeys}>
                  <button
                    type="button"
                    className={styles.reorderKeyBtn}
                    disabled={busy || i === 0}
                    onClick={() => moveTile(id, -1)}
                    aria-label="Mover foto a la izquierda"
                  >
                    <Icon icon={ChevronLeft} size={14} />
                  </button>
                  <button
                    type="button"
                    className={styles.reorderKeyBtn}
                    disabled={busy || i === orderIds.length - 1}
                    onClick={() => moveTile(id, 1)}
                    aria-label="Mover foto a la derecha"
                  >
                    <Icon icon={ChevronRight} size={14} />
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <ul ref={trackRef} className={styles.track} onScroll={onScroll}>
          {images.length === 0 ? (
            <li className={styles.slide}>
              <span className={styles.placeholder} aria-hidden>
                <IconCamara size={28} className={styles.placeholderIcon} />
              </span>
            </li>
          ) : (
            images.map((img, i) => {
              const isCover = img.id === coverId
              return (
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
                      <IconCamara size={28} className={styles.placeholderIcon} />
                    </span>
                  )}
                  {isCover && (
                    <span className={styles.coverBadge}>
                      <Icon icon={Star} size={13} fill="currentColor" /> Portada
                    </span>
                  )}
                  {canEdit &&
                    (confirmingRemove === img.id ? (
                      // Confirmación en línea del borrado: dos toques para una acción
                      // destructiva. Si la foto es la portada, avisamos de que se
                      // promoverá la siguiente (lo hace la capa de datos al quitarla).
                      <div
                        className={styles.confirmRemove}
                        role="group"
                        aria-label="Confirmar quitar foto"
                      >
                        <span className={styles.confirmText}>
                          {isCover ? '¿Quitar la portada?' : '¿Quitar foto?'}
                        </span>
                        <div className={styles.confirmActions}>
                          <button
                            type="button"
                            className={`${styles.action} ${styles.actionDanger}`}
                            disabled={busy}
                            onClick={() => void handleRemove(img.id)}
                            aria-label="Confirmar quitar foto"
                          >
                            <Icon icon={Check} size={16} />
                          </button>
                          <button
                            type="button"
                            className={styles.action}
                            disabled={busy}
                            onClick={() => setConfirmingRemove(null)}
                            aria-label="Cancelar"
                          >
                            <Icon icon={X} size={16} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.slideActions}>
                        {!isCover && (
                          <button
                            type="button"
                            className={styles.action}
                            disabled={busy}
                            onClick={() => void handleCover(img.id)}
                            aria-label="Marcar como portada"
                          >
                            <Icon icon={Star} size={16} />
                          </button>
                        )}
                        <button
                          type="button"
                          className={styles.action}
                          disabled={busy}
                          onClick={() => setConfirmingRemove(img.id)}
                          aria-label="Quitar foto"
                        >
                          <Icon icon={Trash2} size={16} />
                        </button>
                      </div>
                    ))}
                </li>
              )
            })
          )}
        </ul>
      )}

      {/* Indicador "n/N" cuando hay más de una foto (solo con el carrusel: en
          la cuadrícula de reordenar cada foto ya se ve entera). */}
      {!reordering && images.length > 1 && (
        <div className={styles.dots} aria-hidden>
          {images.map((img, i) => (
            <span key={img.id} className={styles.dot} data-on={i === active || undefined} />
          ))}
        </div>
      )}

      {/* Ordenar a mano (issue #952) y volver a orden por fecha: solo con ≥2
          fotos (con 1 sola no hay nada que reordenar). */}
      {canEdit && images.length > 1 && (
        <div className={styles.reorderControls}>
          <button
            type="button"
            className={styles.reorderToggle}
            disabled={busy}
            onClick={() => setReordering((r) => !r)}
          >
            <Icon icon={GripVertical} size={16} />
            {reordering ? 'Listo' : 'Ordenar fotos'}
          </button>
          {manualOrder && (
            <button
              type="button"
              className={styles.reorderToggle}
              disabled={busy}
              onClick={() => void handleAutoOrder()}
            >
              <Icon icon={RotateCcw} size={16} />
              Volver a orden por fecha
            </button>
          )}
        </div>
      )}

      {/* Añadir más fotos (solo dueño). El input acepta selección múltiple. */}
      {canEdit && !reordering && (
        <label className={styles.addRow} aria-busy={busy || undefined}>
          {busy ? <Spinner size={16} /> : <Icon icon={Plus} size={20} />}
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
