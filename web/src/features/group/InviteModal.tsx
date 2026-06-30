import { useEffect, useState } from 'react'
import { MapPin, Target, Users } from 'lucide-react'
import { Button, Icon, Modal, useToast } from '../../ui'
import { track } from '../../lib/analytics'
import { getGroupMembers } from '../../lib/membership'
import styles from './InviteModal.module.css'

interface Props {
  open: boolean
  onClose: () => void
  groupId: string
  /** Nombre del grupo (o el código si no tiene). Se muestra en el preview. */
  groupName: string
  /** Enlace del grupo (#g=…) que se comparte/copía. */
  link: string
  /** Nº de retos del grupo (ya lo tiene GroupPage) para el preview. */
  challengeCount: number
}

// Mensaje de invitación: gancho + nombre del grupo + enlace clicable. Una sola
// línea para que se vea limpio pegado en WhatsApp.
function buildInviteText(groupName: string, link: string): string {
  return `Únete a ${groupName} en Lugares 👉 ${link}`
}

// Texto "N retos" / "Aún sin retos" para la línea de meta del preview.
function challengesLabel(count: number): string {
  if (count <= 0) return 'aún sin retos'
  return count === 1 ? '1 reto' : `${count} retos`
}

// Texto "N personas" para la línea de meta del preview (null mientras carga).
function membersLabel(count: number | null): string | null {
  if (count == null) return null
  return count === 1 ? '1 persona' : `${count} personas`
}

// Modal de "Invitar al grupo": muestra un preview cuidado (nombre, miembros,
// retos) y un mensaje listo para repartir. Camino feliz: Web Share API (hoja
// del SO → WhatsApp/etc.); fallback: copiar el enlace al portapapeles. El unfurl
// real con OG tags necesita SSR (la app es estática) → fuera de alcance (#155).
export function InviteModal({ open, onClose, groupId, groupName, link, challengeCount }: Props) {
  // Recuento de miembros emparejado con el groupId que lo pidió: así sabemos si
  // el dato corresponde al grupo actual sin resetear estado de forma síncrona en
  // el efecto (mismo patrón que ShareLeaderboardModal con la foto).
  const [resolvedMembers, setResolvedMembers] = useState<{
    groupId: string
    count: number
  } | null>(null)
  const [sharing, setSharing] = useState(false)
  const toast = useToast()

  const text = buildInviteText(groupName, link)
  // Solo es válido si corresponde al grupo actual; si no, aún no hay recuento.
  const memberCount = resolvedMembers?.groupId === groupId ? resolvedMembers.count : null

  // Carga el nº de miembros al abrir (solo para enriquecer el preview). Un fallo
  // no rompe el modal: se queda sin la línea de personas. setState va dentro del
  // callback async, nunca síncrono en el cuerpo del efecto.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void getGroupMembers(groupId)
      .then((members) => {
        if (!cancelled) setResolvedMembers({ groupId, count: members.length })
      })
      .catch(() => {
        // Sin recuento: el preview simplemente no muestra la línea de personas.
      })
    return () => {
      cancelled = true
    }
  }, [open, groupId])

  // Copia el enlace+gancho al portapapeles. Fallback universal (siempre disponible).
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(text)
      track('group_link_copied', { surface: 'copied', group_id: groupId })
      toast.show('Enlace copiado, pégalo en el chat', { tone: 'success' })
    } catch {
      toast.show('No se pudo copiar el enlace', { tone: 'danger' })
    }
  }

  // Comparte vía Web Share API (hoja del SO). Si no existe o el usuario cancela,
  // caemos a copiar el enlace para que la acción nunca quede sin efecto.
  async function share() {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      setSharing(true)
      try {
        await navigator.share({ title: 'Lugares', text })
        track('invite_shared', { surface: 'shared', group_id: groupId })
        onClose()
        return
      } catch (err) {
        // Cancelación del usuario: no es error, dejamos el modal abierto.
        if (err instanceof DOMException && err.name === 'AbortError') return
        // Otro fallo de share: caemos a copiar en vez de romper.
      } finally {
        setSharing(false)
      }
    }
    await copyLink()
  }

  const membersText = membersLabel(memberCount)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invitar al viaje"
      footer={
        <>
          <Button variant="ghost" onClick={() => void copyLink()}>
            Copiar enlace
          </Button>
          <Button onClick={() => void share()} loading={sharing}>
            Compartir
          </Button>
        </>
      }
    >
      {/* Preview del grupo: tarjeta de marca con el nombre y la meta (personas /
          retos). Da contexto a quien invitas en vez de un enlace pelado. */}
      <div className={styles.preview}>
        <span className={styles.eyebrow}>
          <Icon icon={MapPin} size={14} /> Lugares
        </span>
        <p className={styles.groupName}>{groupName}</p>
        <p className={styles.meta}>
          {membersText && (
            <>
              <span className={styles.metaItem}>
                <Icon icon={Users} size={14} /> {membersText}
              </span>
              <span className={styles.dot} aria-hidden="true">
                ·
              </span>
            </>
          )}
          <span className={styles.metaItem}>
            <Icon icon={Target} size={14} /> {challengesLabel(challengeCount)}
          </span>
        </p>
        <p className={styles.tagline}>Vive los viajes de tus amigos. Y adivina dónde es.</p>
      </div>

      <p className={styles.hint}>
        Comparte el mensaje en el chat del grupo. Quien lo abra entra directo al viaje.
      </p>
    </Modal>
  )
}
