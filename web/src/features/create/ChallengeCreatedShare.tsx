import { useState } from 'react'
import { ArrowRight, MessageCircle, Share2, Target } from 'lucide-react'
import { Button, Icon, Modal, useToast } from '../../ui'
import { track } from '../../lib/analytics'
import { useSession } from '../../lib/session-context'
import { challengeShareText, challengeShareUrl, whatsappShareUrl } from '../../lib/shareLinks'
import styles from './ChallengeCreatedShare.module.css'

interface Props {
  /** Grupo (el viaje) del reto recién creado: para los eventos de compartir. */
  groupId: string
  /** Nombre del viaje, para decir A QUIÉN llega ("Tu grupo de …"). */
  groupName?: string | null
  /** Id del reto recién creado: es el `code` del enlace LIMPIO (`…/j/<code>`). */
  challengeId: string
  /** Nombre del reto, para el preview de la hoja. */
  challengeTitle: string
  /** Vuelve al viaje (el reto ya aparece en su sitio). Cierra el bucle de crear. */
  onPlay: () => void
}

// Hoja de COMPARTIR — el destino común de los flujos de crear reto (#330, rediseño
// Oleada 3). Tras crear, dice QUÉ se comparte (el reto, con su nombre) y A QUIÉN
// llega ("Tu grupo de … ya puede jugar"), ofrece "Compartir enlace" (Web Share del
// SO; fallback a copiar o WhatsApp) y "Ver el reto en el viaje" (retorno claro: el
// reto aparece ya en su sitio). Reusa shareLinks (mismo copy y rutas que la OG).
export function ChallengeCreatedShare({
  groupId,
  groupName,
  challengeId,
  challengeTitle,
  onPlay,
}: Props) {
  const { profile } = useSession()
  const [sharing, setSharing] = useState(false)
  const toast = useToast()

  const authorName = profile?.display_name?.trim() || 'Alguien'
  const link = challengeShareUrl(location.origin, challengeId)
  const text = challengeShareText(authorName)
  // Texto + enlace para los fallbacks (Web Share lleva la url aparte; aquí la
  // concatenamos para que el mensaje pegado quede completo y clicable).
  const textWithLink = `${text}\n${link}`

  // A quién llega el reto: el viaje. Con nombre, "Tu grupo de Lisboa"; sin él, genérico.
  const trip = groupName?.trim()
  const audience = trip ? `Tu grupo de ${trip} ya puede jugar` : 'Tu grupo ya puede jugar'

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(textWithLink)
      track('invite_shared', { surface: 'copied', group_id: groupId, challenge_id: challengeId })
      toast.show('Mensaje copiado, pégalo en el chat', { tone: 'success' })
    } catch {
      toast.show('No se pudo copiar el enlace', { tone: 'danger' })
    }
  }

  async function share() {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      setSharing(true)
      try {
        await navigator.share({ title: 'Tabide', text, url: link })
        track('invite_shared', { surface: 'shared', group_id: groupId, challenge_id: challengeId })
        return
      } catch (err) {
        // Cancelación del usuario: no es error, dejamos la hoja abierta.
        if (err instanceof DOMException && err.name === 'AbortError') return
        // Otro fallo de share: caemos a copiar en vez de romper.
      } finally {
        setSharing(false)
      }
    }
    await copyLink()
  }

  function shareWhatsApp() {
    track('invite_shared', { surface: 'whatsapp', group_id: groupId, challenge_id: challengeId })
    window.open(whatsappShareUrl(text, link), '_blank', 'noopener,noreferrer')
  }

  return (
    <Modal
      open
      onClose={onPlay}
      title="¡Reto creado!"
      footer={
        <>
          <Button variant="ghost" onClick={shareWhatsApp}>
            <Icon icon={MessageCircle} size={16} /> WhatsApp
          </Button>
          <Button onClick={() => void share()} loading={sharing}>
            <Icon icon={Share2} size={16} /> Compartir enlace
          </Button>
        </>
      }
    >
      {/* QUÉ se comparte: el reto, con su nombre (tarjeta de marca, no un enlace
          pelado). A QUIÉN llega: tu grupo del viaje. */}
      <div className={styles.preview}>
        <span className={styles.eyebrow}>
          <Icon icon={Target} size={14} /> Reto
        </span>
        <p className={styles.title}>{challengeTitle.trim() || 'Reto sin nombre'}</p>
        <p className={styles.audience}>{audience}</p>
        <p className={styles.tagline}>
          Lo verán todos los del viaje. Comparte el enlace para avisarles.
        </p>
      </div>

      {/* Retorno claro al viaje: el reto ya está en su sitio (cierra el bucle). */}
      <Button variant="secondary" fullWidth className={styles.backToTrip} onClick={onPlay}>
        Ver el reto en el viaje <Icon icon={ArrowRight} size={16} />
      </Button>
    </Modal>
  )
}
