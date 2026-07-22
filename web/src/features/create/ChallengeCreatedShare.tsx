import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Share2 } from 'lucide-react'
import { Button, Icon, Modal, Spinner, useToast } from '../../ui'
import { track } from '../../lib/analytics'
import { useSession } from '../../lib/session-context'
import { challengeShareUrl } from '../../lib/shareLinks'
import { buildShareCaption } from './shareChallengeCard'
import { resolveChallengeShareCover } from './challengeShareCover'
import { ChallengeShareCard } from './ChallengeShareCard'
// La rasterización y el propio compartir de la imagen se REUTILIZAN de
// features/group/shareLeaderboard (mismo patrón que ya sigue
// features/play/shareResult: una sola pieza para todo el compartir-como-imagen,
// no una copia por feature). Solo lectura: no se toca ese fichero.
import {
  downloadBlob,
  nodeToPngBlob,
  shareDomain,
  shareLeaderboardImage,
} from '../group/shareLeaderboard'
import styles from './ChallengeCreatedShare.module.css'

interface Props {
  /** Grupo (el viaje) del reto recién creado: para los eventos de compartir y la
   * cascada de portada de la tarjeta (foto propia del viaje o derivada del lugar). */
  groupId: string
  /** Nombre del viaje, para decir A QUIÉN llega ("Tu grupo de …") y como contexto
   * visible en la propia tarjeta. */
  groupName?: string | null
  /** Id del reto recién creado: es el `code` del enlace LIMPIO (`…/j/<code>`). */
  challengeId: string
  /** Nombre del reto, para la tarjeta y el título de la hoja. */
  challengeTitle: string
  /**
   * Tipo del reto recién creado (issue #880): decide el placeholder SIN FOTO
   * de la tarjeta (globo si es de ubicación, obturador si es de número). El
   * llamador ya lo sabe de sobra: es o bien `CreateLocationChallenge` o bien
   * `CreateNumberChallenge`, nunca ambos.
   */
  challengeKind: 'location' | 'number'
  /** Path en Storage de la foto del reto (si tiene una, issue #595): PRIMERA
   * candidata de la cascada de portada de la tarjeta (antes que la del viaje). */
  imagePath?: string | null
  /** Vuelve al viaje (el reto ya aparece en su sitio). Cierra el bucle de crear. */
  onPlay: () => void
}

// Hoja de COMPARTIR — el destino común de los flujos de crear reto (#330, rediseño
// Oleada 3). Issue #595: en vez de un link crudo (Web Share de una URL pelada,
// sin confianza visual), se comparte una TARJETA-IMAGEN de marca —foto del reto
// (o portada del viaje, o el mapa nocturno de marca) con el nombre del reto, del
// viaje, el wordmark y una llamada corta— rasterizada off-screen con
// html-to-image, igual que la clasificación (`ShareLeaderboardModal`). El enlace
// real SOLO viaja en el texto que acompaña a la imagen (Web Share / portapapeles),
// nunca estampado en el PNG.
export function ChallengeCreatedShare({
  groupId,
  groupName,
  challengeId,
  challengeTitle,
  challengeKind,
  imagePath = null,
  onPlay,
}: Props) {
  const { profile } = useSession()
  const cardRef = useRef<HTMLDivElement>(null)
  const [pngUrl, setPngUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [error, setError] = useState(false)
  const [sharing, setSharing] = useState(false)
  // Portada de la tarjeta ya resuelta (cascada foto del reto → portada del viaje
  // → null = mapa nocturno de marca). `undefined` mientras se resuelve: no
  // capturamos hasta saberlo, para que la foto (si la hay) entre en el PNG.
  const [cover, setCover] = useState<string | null | undefined>(undefined)
  const toast = useToast()

  const authorName = profile?.display_name?.trim() || 'Alguien'
  const link = challengeShareUrl(location.origin, challengeId)
  const caption = buildShareCaption(authorName, link)
  const domain = shareDomain(link)

  // A quién llega el reto: el viaje. Con nombre, "Tu gente de Lisboa"; sin él, genérico.
  const trip = groupName?.trim()
  const audience = trip ? `Tu gente de ${trip} ya puede jugar` : 'Tu gente ya puede jugar'

  // Resuelve la portada de fondo al montar (una vez: la hoja vive un único reto
  // recién creado, no hay props que cambien a lo largo de su vida).
  useEffect(() => {
    let cancelled = false
    void resolveChallengeShareCover(imagePath, groupId, groupName ?? null).then((url) => {
      if (!cancelled) setCover(url)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar, ver comentario de arriba
  }, [])

  // Rasteriza la tarjeta en cuanto la portada está resuelta (incl. `null`, que ya
  // es una respuesta válida: cae al mapa nocturno). rAF doble: asegura que la
  // tarjeta ya está pintada con esa portada antes de capturarla.
  useEffect(() => {
    if (cover === undefined) return
    let cancelled = false
    let createdUrl: string | null = null

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
  }, [cover])

  async function onShare() {
    if (!blob) return
    setSharing(true)
    try {
      const result = await shareLeaderboardImage(blob, caption, `¡Reto creado! · ${challengeTitle}`)
      if (result === 'shared') {
        track('invite_shared', { surface: 'shared', group_id: groupId, challenge_id: challengeId })
      } else if (result === 'downloaded') {
        track('invite_shared', {
          surface: 'downloaded',
          group_id: groupId,
          challenge_id: challengeId,
        })
        toast.show('Imagen descargada y mensaje copiado, pégalos en el chat', { tone: 'success' })
      }
      // 'cancelled': el usuario cerró la hoja de compartir del SO; dejamos la hoja abierta.
    } finally {
      setSharing(false)
    }
  }

  function onDownload() {
    if (!blob) return
    downloadBlob(blob, 'reto.png')
    track('invite_shared', { surface: 'downloaded', group_id: groupId, challenge_id: challengeId })
    toast.show('Imagen descargada', { tone: 'success' })
  }

  // Fallback si la imagen no se pudo generar (p.ej. navegador sin soporte): el
  // mensaje (con el enlace) se puede copiar igualmente, sin bloquear el compartir.
  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(caption)
      track('invite_shared', { surface: 'copied', group_id: groupId, challenge_id: challengeId })
      toast.show('Mensaje copiado, pégalo en el chat', { tone: 'success' })
    } catch {
      toast.show('No se pudo copiar el mensaje', { tone: 'danger' })
    }
  }

  return (
    <Modal
      open
      onClose={onPlay}
      title="¡Reto creado!"
      footer={
        <>
          <Button variant="ghost" onClick={onDownload} disabled={!blob}>
            Descargar
          </Button>
          <Button onClick={() => void onShare()} loading={sharing} disabled={!blob}>
            <Icon icon={Share2} size={16} /> Compartir
          </Button>
        </>
      }
    >
      {/* Previa de la tarjeta-imagen: foto del reto (o portada del viaje, o mapa
          nocturno de marca) con nombre del reto, wordmark y CTA — nunca un link
          crudo. El enlace viaja en el caption al compartir/descargar/copiar. */}
      <div className={styles.preview}>
        {pngUrl ? (
          <img
            className={styles.previewImg}
            src={pngUrl}
            alt={`Tarjeta para compartir el reto «${challengeTitle}»`}
          />
        ) : error ? (
          <div className={styles.errorBlock}>
            <p className={styles.error}>
              No se pudo generar la imagen. Puedes compartir el mensaje desde el chat.
            </p>
            <Button variant="ghost" onClick={() => void copyCaption()}>
              Copiar mensaje
            </Button>
          </div>
        ) : (
          <div className={styles.loading} role="status">
            <Spinner size={28} />
            <span>Generando imagen…</span>
          </div>
        )}
      </div>
      <p className={styles.audience}>{audience}</p>

      {/* Retorno claro al viaje: el reto ya está en su sitio (cierra el bucle). */}
      <Button variant="secondary" fullWidth className={styles.backToTrip} onClick={onPlay}>
        Ver el reto en el viaje <Icon icon={ArrowRight} size={16} />
      </Button>

      {/* La tarjeta real, a tamaño completo, montada fuera del viewport para que
          html-to-image la mida y rasterice bien (display:none daría 0×0). */}
      <div className={styles.offscreen} aria-hidden="true">
        <ChallengeShareCard
          ref={cardRef}
          challengeTitle={challengeTitle}
          groupName={groupName ?? null}
          kind={challengeKind}
          coverDataUrl={cover ?? null}
          domain={domain}
        />
      </div>
    </Modal>
  )
}
