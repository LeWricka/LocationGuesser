import { useEffect, useRef, useState } from 'react'
import { Button, Modal, Spinner, useToast } from '../../ui'
import type { LeaderboardEntry } from '../../lib/leaderboard'
import type { GroupPrizes } from '../../lib/database.types'
import { track } from '../../lib/analytics'
import { lastChallengeImageDataUrl } from '../../lib/lastChallengeImage'
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

/** Id del grupo a partir del enlace (#g=CODE[&c=…]). Lo extraemos aquí para no
 * pedir un prop nuevo a GroupPage: el enlace ya lleva el código. Vacío si no
 * se puede leer (entonces no buscamos foto del reto). */
function groupIdFromLink(link: string): string {
  const match = link.match(/#g=([^&]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

// Modal de "Compartir clasificación como imagen". Monta la tarjeta a tamaño real
// FUERA del viewport (no display:none, que mediría 0) y la rasteriza a PNG al
// abrir. Muestra una previa de la imagen y deja Compartir / Descargar. El caption
// (buildShareText) es mínimo: solo enlace + gancho (la tabla va en la imagen).
// Compartir directo a ciegas sería confuso: aquí el usuario ve la tarjeta antes.
export function ShareLeaderboardModal({ open, onClose, groupName, entries, prizes, link }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [pngUrl, setPngUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [error, setError] = useState(false)
  const [sharing, setSharing] = useState(false)
  // Foto del último reto resuelta, emparejada con el groupId que la pidió: así
  // sabemos si la foto en estado corresponde al grupo actual sin resetear estado
  // de forma síncrona en el efecto (mismo patrón que useSignedImage). url=null
  // significa "el grupo no tiene foto"; el campo presente = "ya resuelto".
  const [resolvedPhoto, setResolvedPhoto] = useState<{
    groupId: string
    url: string | null
  } | null>(null)
  const toast = useToast()

  const text = buildShareText(groupName, link)
  const domain = shareDomain(link)
  const groupId = groupIdFromLink(link)

  // La foto está lista cuando ya resolvimos la del groupId actual (o no hay
  // groupId del que sacarla). Hasta entonces no capturamos, para que la miniatura
  // entre en el PNG. photoDataUrl es la foto a dibujar (null = sin miniatura).
  const photoReady = !groupId || resolvedPhoto?.groupId === groupId
  const photoDataUrl = resolvedPhoto?.groupId === groupId ? resolvedPhoto.url : null

  // Carga la foto del último reto al abrir. Solo hace setState dentro del callback
  // async (nunca síncrono en el cuerpo del efecto). Resolvemos también a null
  // cuando el grupo no tiene retos con imagen, para no bloquear la captura.
  useEffect(() => {
    if (!open || !groupId) return
    let cancelled = false
    void lastChallengeImageDataUrl(groupId)
      .then((url) => {
        if (!cancelled) setResolvedPhoto({ groupId, url })
      })
      .catch(() => {
        if (!cancelled) setResolvedPhoto({ groupId, url: null })
      })
    return () => {
      cancelled = true
    }
  }, [open, groupId])

  // Generar el PNG cuando la tarjeta (incl. la miniatura ya resuelta) está
  // pintada. Esperamos a photoReady para que la foto entre en el snapshot. El
  // reset de estado y la captura van dentro del rAF (asíncronos, no en el cuerpo
  // del efecto) para no disparar renders en cascada. Limpia el object URL al cerrar.
  useEffect(() => {
    if (!open || !photoReady) return
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
  }, [open, photoReady, groupName, entries, prizes, link, photoDataUrl])

  async function onShare() {
    if (!blob) return
    setSharing(true)
    try {
      const result = await shareLeaderboardImage(blob, text, `Clasificación · ${groupName}`)
      if (result === 'downloaded') {
        track('leaderboard_shared', {
          method: 'downloaded',
          group_id: groupId,
          players: entries.length,
        })
        toast.show('Imagen descargada y enlace copiado, pégalos en el chat', { tone: 'success' })
        onClose()
      } else if (result === 'shared') {
        track('leaderboard_shared', {
          method: 'shared',
          group_id: groupId,
          players: entries.length,
        })
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
            photoDataUrl={photoDataUrl}
          />
        </div>
      )}
    </>
  )
}
