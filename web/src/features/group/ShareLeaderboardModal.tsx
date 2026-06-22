import { useEffect, useRef, useState } from 'react'
import { Button, Modal, Spinner, useToast } from '../../ui'
import type { LeaderboardEntry } from '../../lib/leaderboard'
import type { GroupPrizes } from '../../lib/database.types'
import { LeaderboardCard } from './LeaderboardCard'
import {
  buildShareText,
  downloadBlob,
  nodeToPngBlob,
  shareDomain,
  shareLeaderboardImage,
} from './shareLeaderboard'
import styles from './ShareLeaderboardModal.module.css'

interface Props {
  open: boolean
  onClose: () => void
  groupName: string
  entries: LeaderboardEntry[]
  prizes: GroupPrizes | null
  /** Enlace del grupo (#g=…) — va en el caption, no dibujado en la imagen. */
  link: string
}

// Modal de "Compartir clasificación como imagen". Monta la tarjeta a tamaño real
// FUERA del viewport (no display:none, que mediría 0) y la rasteriza a PNG al
// abrir. Muestra una previa de la imagen y deja Compartir / Descargar. Conserva
// el texto (buildShareText) como caption y fallback. Compartir directo a ciegas
// sería confuso: aquí el usuario ve la tarjeta antes de mandarla.
export function ShareLeaderboardModal({ open, onClose, groupName, entries, prizes, link }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [pngUrl, setPngUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [error, setError] = useState(false)
  const [sharing, setSharing] = useState(false)
  const toast = useToast()

  const text = buildShareText(groupName, entries, prizes, link)
  const domain = shareDomain(link)

  // Generar el PNG cada vez que se abre (los datos pueden haber cambiado). El
  // reset de estado y la captura van dentro del rAF (asíncronos, no en el cuerpo
  // del efecto) para no disparar renders en cascada. Limpia el object URL al
  // cerrar para no fugar memoria.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    let createdUrl: string | null = null

    // rAF doble: aseguramos que la tarjeta ya está pintada antes de capturarla.
    const raf = requestAnimationFrame(() => {
      if (cancelled) return
      setError(false)
      setPngUrl(null)
      setBlob(null)
      requestAnimationFrame(() => {
        const node = cardRef.current
        if (cancelled || !node) return
        nodeToPngBlob(node)
          .then((b) => {
            if (cancelled) return
            createdUrl = URL.createObjectURL(b)
            setBlob(b)
            setPngUrl(createdUrl)
          })
          .catch(() => {
            if (!cancelled) setError(true)
          })
      })
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [open, groupName, entries, prizes, link])

  async function onShare() {
    if (!blob) return
    setSharing(true)
    try {
      const result = await shareLeaderboardImage(blob, text, `Clasificación · ${groupName}`)
      if (result === 'downloaded') {
        toast.show('Imagen descargada y enlace copiado, pégalos en el chat', { tone: 'success' })
        onClose()
      } else if (result === 'shared') {
        onClose()
      }
      // 'cancelled': el usuario cerró la hoja de compartir; dejamos el modal abierto.
    } finally {
      setSharing(false)
    }
  }

  function onDownload() {
    if (!blob) return
    downloadBlob(blob, 'clasificacion.png')
    toast.show('Imagen descargada', { tone: 'success' })
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Compartir clasificación"
        footer={
          <>
            <Button variant="ghost" onClick={onDownload} disabled={!blob}>
              Descargar
            </Button>
            <Button onClick={() => void onShare()} loading={sharing} disabled={!blob}>
              Compartir
            </Button>
          </>
        }
      >
        <div className={styles.preview}>
          {pngUrl ? (
            <img
              className={styles.previewImg}
              src={pngUrl}
              alt="Vista previa de la clasificación"
            />
          ) : error ? (
            <p className={styles.error}>
              No se pudo generar la imagen. Puedes compartir el texto desde el chat.
            </p>
          ) : (
            <div className={styles.loading}>
              <Spinner size={28} />
              <span>Generando imagen…</span>
            </div>
          )}
        </div>
      </Modal>

      {/* La tarjeta real, a tamaño completo, montada fuera del viewport para que
          html-to-image la mida y rasterice bien (display:none daría 0×0). Solo
          mientras el modal está abierto. aria-hidden: es un lienzo, no contenido. */}
      {open && (
        <div className={styles.offscreen} aria-hidden="true">
          <LeaderboardCard
            ref={cardRef}
            groupName={groupName}
            entries={entries}
            prizes={prizes}
            domain={domain}
          />
        </div>
      )}
    </>
  )
}
