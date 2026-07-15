import { useEffect, useRef, useState } from 'react'
import { Crown, Share2 } from 'lucide-react'
import { Button, Icon, Modal, Spinner, useToast } from '../../ui'
import { track } from '../../lib/analytics'
import { getGroupMembers } from '../../lib/membership'
import { useSession } from '../../lib/session-context'
import { createOwnerInvite } from '../../lib/ownerInvites'
import { ownerInviteHash } from '../../lib/route'
import { buildInviteCaption, buildOwnerInviteCaption, tripInviteMetaLine } from './tripInviteText'
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
  /**
   * Soy dueño (creador raíz o co-dueño) de este grupo: solo un dueño puede
   * EMITIR un enlace de co-dueño (issue #707; RLS `group_invites_insert_owner`,
   * migración 0038 lo exige igualmente en servidor). Gatea la sección de
   * "Generar enlace de co-dueño"; el resto del modal es igual para todos.
   */
  isOwner: boolean
  /**
   * Desde dónde se abrió esta hoja (issue #758): distingue en analítica el FAB
   * "Compartir" nuevo (`'share_fab'`) de las otras entradas ya existentes (CTA
   * del vacío, menú de Miembros…), que no pasan nada y quedan sin etiquetar.
   * Viaja junto a `surface` (que sigue siendo el MECANISMO: shared/copied/
   * downloaded) en vez de sustituirlo — son dos preguntas distintas.
   */
  origin?: string
}

// Modal de "Invitar al viaje" (issue #617): "Compartir" genera y comparte una
// TARJETA-IMAGEN de marca (portada del viaje, nombre, meta de viajeros/retos,
// wordmark y CTA "Únete al viaje") en vez de un link crudo — mismo patrón que
// el reto recién creado (`ChallengeCreatedShare`, #595) y la clasificación
// (`ShareLeaderboardModal`). Web Share nivel 2 con el PNG como file y el enlace
// SOLO en el caption (nunca estampado en la imagen); sin Web Share, cae a
// descargar la imagen + copiar el mensaje. "Copiar enlace" queda intacto:
// sigue copiando texto + enlace, independiente de si la imagen se generó.
export function InviteModal({
  open,
  onClose,
  groupId,
  groupName,
  link,
  challengeCount,
  isOwner,
  origin,
}: Props) {
  const { user, profile } = useSession()
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
  // Generar el enlace de co-dueño (issue #707) es una acción aparte, sin estado
  // que sobreviva al cierre del modal: cada apertura ofrece "generar" de nuevo
  // (un enlace ya copiado no necesita quedar visible aquí).
  const [generatingCoOwnerLink, setGeneratingCoOwnerLink] = useState(false)
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
      track('group_link_copied', { surface: 'copied', group_id: groupId, origin })
      toast.show('Mensaje copiado, pégalo en el chat', { tone: 'success' })
    } catch {
      toast.show('No se pudo copiar el enlace', { tone: 'danger' })
    }
  }

  // Genera un enlace de CO-DUEÑO (issue #707): a diferencia de "Copiar enlace"
  // (invita a VER/jugar), este asciende directo a co-dueño al canjearlo — sin
  // pasar por el alta normal + promover a mano en «Miembros». Un solo uso;
  // servidor decide quién puede emitirlo (RLS `group_invites_insert_owner`), la
  // UI solo lo esconde a no-dueños para no ofrecer una acción que 0-filas.
  async function generateCoOwnerLink() {
    if (!user?.id) return
    setGeneratingCoOwnerLink(true)
    try {
      const token = await createOwnerInvite(groupId, user.id)
      const url = `${window.location.origin}${ownerInviteHash(groupId, token)}`
      const caption = buildOwnerInviteCaption(groupName, url)
      await navigator.clipboard.writeText(caption)
      track('owner_invite_created', { group_id: groupId })
      toast.show('Enlace de co-dueño copiado, pégalo en el chat', { tone: 'success' })
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'inténtalo de nuevo'
      toast.show(`No se pudo generar el enlace de co-dueño: ${detail}`, { tone: 'danger' })
    } finally {
      setGeneratingCoOwnerLink(false)
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
        track('invite_shared', { surface: 'shared', group_id: groupId, origin })
        onClose()
      } else if (result === 'downloaded') {
        track('invite_shared', { surface: 'downloaded', group_id: groupId, origin })
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

      {/* Enlace de co-dueño (issue #707): sección discreta, SOLO para dueños —
          no es una invitación social (sin tarjeta-imagen), es un enlace
          operativo de un solo uso. Separada de las acciones principales del
          pie: no compite con "Copiar enlace"/"Compartir".
          Issue #741: aquí YA NO se menciona "hazlo co-dueño desde Miembros" —
          esa mención y este botón, uno debajo del otro, leían como dos
          caminos para lo mismo. El sitio para promover a quien YA está en el
          viaje es Miembros (por fila) y se explica solo, sin necesitar un
          puntero en Invitar; esta sección cubre el único caso que Miembros no
          puede: alguien que aún no ha entrado. */}
      {isOwner && (
        <div className={styles.ownerInvite}>
          <p className={styles.ownerInviteHint}>
            ¿Para que lo administre contigo? <strong>Genera un enlace de co-dueño.</strong>
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void generateCoOwnerLink()}
            loading={generatingCoOwnerLink}
          >
            <Icon icon={Crown} size={15} /> Generar enlace de co-dueño
          </Button>
        </div>
      )}

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
