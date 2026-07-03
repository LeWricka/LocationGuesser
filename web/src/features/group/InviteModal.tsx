import { useEffect, useRef, useState } from 'react'
import { Share2 } from 'lucide-react'
import { Button, Icon, Modal, Spinner, useToast } from '../../ui'
import { track } from '../../lib/analytics'
import { getGroupMembers } from '../../lib/membership'
import { useSession } from '../../lib/session-context'
import { buildInviteCaption, tripInviteMetaLine } from './tripInviteText'
import { resolveTripInviteCover } from './tripInviteCover'
import { TripInviteCard } from './TripInviteCard'
// La rasterización y el propio compartir/descarga de la imagen se REUTILIZAN de
// `features/group/shareLeaderboard` (mismo patrón que ya sigue
// `ChallengeCreatedShare`/`ShareLeaderboardModal`: una sola pieza para todo el
// compartir-como-imagen, no una copia por feature).
import { nodeToPngBlob, shareDomain, shareLeaderboardImage } from './shareLeaderboard'
import styles from './InviteModal.module.css'

interface Props {
  open: boolean
  onClose: () => void
  groupId: string
  /** Nombre del grupo (o el código si no tiene). Se muestra en la tarjeta. */
  groupName: string
  /** Enlace LIMPIO del viaje (`…/v/<code>`) que se comparte/copía (genera tarjeta OG). */
  link: string
  /** Nº de retos del grupo (ya lo tiene GroupPage) para la tarjeta. */
  challengeCount: number
}

// Modal de "Invitar al viaje" (issue #617): "Compartir" genera y comparte una
// TARJETA-IMAGEN de marca (portada del viaje, nombre, meta de viajeros/retos,
// wordmark y CTA "Únete al viaje") en vez de un link crudo — mismo patrón que
// el reto recién creado (`ChallengeCreatedShare`, #595) y la clasificación
// (`ShareLeaderboardModal`). Web Share nivel 2 con el PNG como file y el enlace
// SOLO en el caption (nunca estampado en la imagen); sin Web Share, cae a
// descargar la imagen + copiar el mensaje. "Copiar enlace" queda intacto:
// sigue copiando texto + enlace, independiente de si la imagen se generó.
export function InviteModal({ open, onClose, groupId, groupName, link, challengeCount }: Props) {
  const { profile } = useSession()
  const cardRef = useRef<HTMLDivElement>(null)
  // Recuento de miembros emparejado con el groupId que lo pidió: así sabemos si
  // el dato corresponde al grupo actual sin resetear estado de forma síncrona en
  // el efecto (mismo patrón que ShareLeaderboardModal con la foto).
  const [resolvedMembers, setResolvedMembers] = useState<{
    groupId: string
    count: number
  } | null>(null)
  // Portada de la tarjeta resuelta, emparejada con el groupId que la pidió: así
  // sabemos si corresponde al grupo actual sin resetear estado de forma
  // síncrona en el efecto (mismo patrón que `resolvedMembers` arriba y que
  // `ShareLeaderboardModal` con su foto). `cover` es `undefined` mientras no
  // hay match (no capturamos hasta saberlo); `null` es una respuesta YA
  // resuelta (cae al mapa nocturno de marca).
  const [resolvedCover, setResolvedCover] = useState<{
    groupId: string
    url: string | null
  } | null>(null)
  const cover = resolvedCover?.groupId === groupId ? resolvedCover.url : undefined
  const [pngUrl, setPngUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [error, setError] = useState(false)
  const [sharing, setSharing] = useState(false)
  const toast = useToast()

  // Quién invita: el display_name de la sesión (cae a "Alguien" si aún no carga).
  const authorName = profile?.display_name?.trim() || 'Alguien'
  // Solo es válido si corresponde al grupo actual; si no, aún no hay recuento.
  const memberCount = resolvedMembers?.groupId === groupId ? resolvedMembers.count : null
  const metaLine = tripInviteMetaLine(memberCount, challengeCount)
  const domain = shareDomain(link)
  // El enlace viaja SOLO aquí, nunca estampado en la tarjeta-imagen.
  const caption = buildInviteCaption(authorName, groupName, link)

  // Carga el nº de miembros al abrir (enriquece la meta de la tarjeta). Un fallo
  // no rompe el modal: la tarjeta cae a mostrar solo la línea de retos. setState
  // va dentro del callback async, nunca síncrono en el cuerpo del efecto.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void getGroupMembers(groupId)
      .then((members) => {
        if (!cancelled) setResolvedMembers({ groupId, count: members.length })
      })
      .catch(() => {
        // Sin recuento: la tarjeta simplemente no muestra la línea de viajeros.
      })
    return () => {
      cancelled = true
    }
  }, [open, groupId])

  // Resuelve la portada de fondo al abrir. setState va dentro del callback
  // async (nunca síncrono en el cuerpo del efecto); el emparejado con groupId
  // (arriba) es lo que evita capturar con una portada de un grupo anterior.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void resolveTripInviteCover(groupId, groupName).then((url) => {
      if (!cancelled) setResolvedCover({ groupId, url })
    })
    return () => {
      cancelled = true
    }
  }, [open, groupId, groupName])

  // Rasteriza la tarjeta en cuanto la portada está resuelta (incl. `null`, que
  // ya es una respuesta válida: cae al mapa nocturno). Vuelve a capturar si el
  // recuento de viajeros llega después (la meta de la tarjeta cambia). rAF
  // doble: asegura que la tarjeta ya está pintada con esos datos antes de
  // capturarla.
  useEffect(() => {
    if (!open || cover === undefined) return
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
  }, [open, cover, metaLine, groupName])

  // Copia el mensaje + enlace al portapapeles. Fallback universal (siempre
  // disponible, independiente de si la imagen se generó): "Copiar enlace"
  // queda intacto.
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(caption)
      track('group_link_copied', { surface: 'copied', group_id: groupId })
      toast.show('Mensaje copiado, pégalo en el chat', { tone: 'success' })
    } catch {
      toast.show('No se pudo copiar el enlace', { tone: 'danger' })
    }
  }

  // Comparte la tarjeta-imagen: Web Share nivel 2 con el PNG como file y el
  // caption (enlace incluido) como texto. Sin Web Share (o si el usuario
  // cancela), cae a descargar la imagen + copiar el caption (patrón #604).
  async function onShare() {
    if (!blob) return
    setSharing(true)
    try {
      const result = await shareLeaderboardImage(blob, caption, `Invitación · ${groupName}`)
      if (result === 'shared') {
        track('invite_shared', { surface: 'shared', group_id: groupId })
        onClose()
      } else if (result === 'downloaded') {
        track('invite_shared', { surface: 'downloaded', group_id: groupId })
        toast.show('Imagen descargada y mensaje copiado, pégalos en el chat', { tone: 'success' })
      }
      // 'cancelled': el usuario cerró la hoja de compartir del SO; dejamos el modal abierto.
    } finally {
      setSharing(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invitar al viaje"
      footer={
        // Envuelve las dos acciones en un contenedor propio (no confiar en el
        // .footer del Modal, compartido con otros modales): fila con wrap +
        // min-width:0 para que, si el ancho aprieta (móviles pequeños o zoom
        // de accesibilidad), los botones bajen de línea en vez de desbordar el
        // panel (issue #607 — antes 3 botones se salían a ~560px).
        <div className={styles.footerActions}>
          <Button variant="ghost" className={styles.footerButton} onClick={() => void copyLink()}>
            Copiar enlace
          </Button>
          <Button
            className={styles.footerButton}
            onClick={() => void onShare()}
            loading={sharing}
            disabled={!blob}
          >
            <Icon icon={Share2} size={16} /> Compartir
          </Button>
        </div>
      }
    >
      {/* Previa de la tarjeta-imagen: portada del viaje (o el mapa nocturno de
          marca) con el nombre, la meta de viajeros/retos, el wordmark y el CTA
          — nunca un link crudo. El enlace viaja en el caption al
          compartir/descargar/copiar. */}
      <div className={styles.preview}>
        {pngUrl ? (
          <img
            className={styles.previewImg}
            src={pngUrl}
            alt={`Tarjeta para invitar al viaje «${groupName}»`}
          />
        ) : error ? (
          <p className={styles.error}>
            No se pudo generar la imagen. Puedes invitar igualmente con «Copiar enlace».
          </p>
        ) : (
          <div className={styles.loading} role="status">
            <Spinner size={28} />
            <span>Generando imagen…</span>
          </div>
        )}
      </div>

      <p className={styles.hint}>
        Comparte la tarjeta en el chat del grupo. Quien la abra entra directo al viaje.
      </p>
      {/* Descubribilidad (#616): quien invita suele querer también repartir la
          gestión; el sitio para eso es la vista Miembros, no esta hoja. */}
      <p className={styles.hint}>
        ¿Quieres que también administre el viaje? Hazlo co-dueño desde «Miembros» (menú ⋯).
      </p>

      {/* La tarjeta real, a tamaño completo, montada fuera del viewport para que
          html-to-image la mida y rasterice bien (display:none daría 0×0). Solo
          mientras el modal está abierto. aria-hidden: es un lienzo, no contenido. */}
      {open && (
        <div className={styles.offscreen} aria-hidden="true">
          <TripInviteCard
            ref={cardRef}
            tripName={groupName}
            metaLine={metaLine}
            coverDataUrl={cover ?? null}
            domain={domain}
          />
        </div>
      )}
    </Modal>
  )
}
