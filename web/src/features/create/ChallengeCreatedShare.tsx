import { useState } from 'react'
import { MessageCircle, Target } from 'lucide-react'
import { Button, Icon, Modal, useToast } from '../../ui'
import { track } from '../../lib/analytics'
import { useSession } from '../../lib/session-context'
import { challengeShareText, challengeShareUrl, whatsappShareUrl } from '../../lib/shareLinks'
import styles from './ChallengeCreatedShare.module.css'

interface Props {
  /** Grupo (el viaje) del reto recién creado: para los eventos de compartir. */
  groupId: string
  /** Id del reto recién lanzado: es el `code` del enlace LIMPIO (`…/j/<code>`). */
  challengeId: string
  /** Nombre del reto, para el preview de la hoja. */
  challengeTitle: string
  /** El creador pasa de compartir y va a ver/jugar el reto (acción secundaria). */
  onPlay: () => void
}

// Hoja "Reto lanzado — comparte el enlace" (#330): tras CREAR un reto, ANTES de
// mandar a jugar, le damos al creador el enlace del reto LISTO para repartir EN
// CALIENTE. Camino feliz: Web Share API (hoja del SO); fallbacks: copiar el
// mensaje + enlace o `wa.me` con todo prerellenado. Reusa shareLinks (mismo copy
// y rutas limpias que la tarjeta OG) y el lenguaje de la hoja de invitar al viaje.
export function ChallengeCreatedShare({ groupId, challengeId, challengeTitle, onPlay }: Props) {
  const { profile } = useSession()
  const [sharing, setSharing] = useState(false)
  const toast = useToast()

  const authorName = profile?.display_name?.trim() || 'Alguien'
  const link = challengeShareUrl(location.origin, challengeId)
  const text = challengeShareText(authorName)
  // Texto + enlace para los fallbacks (Web Share lleva la url aparte; aquí la
  // concatenamos para que el mensaje pegado quede completo y clicable).
  const textWithLink = `${text}\n${link}`

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
      title="¡Reto lanzado! Comparte el enlace"
      footer={
        <>
          <Button variant="ghost" onClick={onPlay}>
            Ver el reto
          </Button>
          <Button variant="ghost" onClick={shareWhatsApp}>
            <Icon icon={MessageCircle} size={16} /> WhatsApp
          </Button>
          <Button onClick={() => void share()} loading={sharing}>
            Compartir
          </Button>
        </>
      }
    >
      {/* Preview del reto: tarjeta de marca con el nombre. Da contexto a quien lo
          reparte en vez de un enlace pelado (mismo lenguaje que invitar al viaje). */}
      <div className={styles.preview}>
        <span className={styles.eyebrow}>
          <Icon icon={Target} size={14} /> Reto
        </span>
        <p className={styles.title}>{challengeTitle.trim() || 'Reto sin nombre'}</p>
        <p className={styles.tagline}>
          ¿Adivinan dónde es? Clava el punto antes de la cuenta atrás.
        </p>
      </div>

      <p className={styles.hint}>
        Pásalo en caliente al chat del grupo. Quien lo abra entra directo a jugar.
      </p>
    </Modal>
  )
}
