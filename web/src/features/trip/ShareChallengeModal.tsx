import { useEffect, useRef, useState } from 'react'
import { Share2 } from 'lucide-react'
import { Button, Icon, Modal, Spinner, useToast } from '../../ui'
import { track } from '../../lib/analytics'
import { useSession } from '../../lib/session-context'
import { challengeShareUrl } from '../../lib/shareLinks'
// Reutiliza la tarjeta-imagen y el caption YA construidos para "¡Reto creado!"
// (issue #595): misma tarjeta, mismo mensaje sin spoiler — este modal solo
// cambia CUÁNDO se ofrece (desde el detalle de un reto YA existente, no justo
// al crearlo) y el envoltorio (Modal al estilo InviteModal: Copiar enlace +
// Compartir, en vez de Descargar + Compartir).
import { buildShareCaption } from '../create/shareChallengeCard'
import { resolveChallengeShareCover } from '../create/challengeShareCover'
import { ChallengeShareCard } from '../create/ChallengeShareCard'
// La rasterización y el propio Web Share/descarga de la imagen se REUTILIZAN de
// `features/group/shareLeaderboard` (mismo patrón que `InviteModal` y
// `ChallengeCreatedShare`: una sola pieza para todo el compartir-como-imagen).
import { nodeToPngBlob, shareDomain, shareLeaderboardImage } from '../group/shareLeaderboard'
import styles from './ShareChallengeModal.module.css'

interface Props {
  /** Viaje (grupo) al que pertenece el reto: para los eventos y la cascada de portada. */
  groupId: string
  /** Nombre del viaje, contexto visible en la propia tarjeta. */
  groupName: string | null
  /** Id del reto: es el `code` del enlace LIMPIO (`…/j/<code>`). */
  challengeId: string
  /** Nombre del reto, para la tarjeta y el título de la hoja. */
  challengeTitle: string
  /**
   * Foto del reto para la portada de la tarjeta, YA filtrada por el llamador
   * según el anti-spoiler de `isMomentPhotoVisible` (lib/trip): `null` si la
   * foto sigue siendo SORPRESA (`photo_is_hint = false`) — este componente NUNCA
   * decide esa regla por su cuenta, confía en lo que le pasan.
   */
  imagePath: string | null
  /**
   * Desde dónde se abrió este modal (issue #758): `'share_fab'` (hoja nueva) o
   * `'diario_card'` (icono de 1 tap en la tarjeta seleccionada del carrusel);
   * `undefined` para la entrada previa (detalle del momento, `MomentSheet`),
   * que sigue sin etiquetar. Viaja junto a `surface` (el MECANISMO: shared/
   * copied/downloaded), no lo sustituye — son dos preguntas distintas.
   */
  origin?: string
  onClose: () => void
}

/**
 * Modal "Compartir reto" (issue #739): comparte UN reto suelto (no el viaje
 * entero) — mismo patrón visual/técnico que `InviteModal` (tarjeta-imagen +
 * Web Share con "Copiar enlace" de fallback), pero para un reto YA EN JUEGO
 * abierto desde su detalle (`MomentSheet`), no recién creado.
 *
 * Solo tiene sentido mientras el reto está EN JUEGO: uno cerrado ya no se
 * juega y compartirlo no lleva a ninguna acción para quien lo reciba (para ese
 * caso, `MomentSheet` ya ofrece "Ver marcador"). El llamador (`MomentSheet` vía
 * `TripPage`) es quien gatea cuándo se monta este modal.
 */
export function ShareChallengeModal({
  groupId,
  groupName,
  challengeId,
  challengeTitle,
  imagePath,
  origin,
  onClose,
}: Props) {
  const { profile } = useSession()
  const cardRef = useRef<HTMLDivElement>(null)
  const [pngUrl, setPngUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [error, setError] = useState(false)
  const [sharing, setSharing] = useState(false)
  // Portada de la tarjeta (cascada foto del reto → portada del viaje → null =
  // mapa nocturno de marca). `undefined` mientras se resuelve.
  const [cover, setCover] = useState<string | null | undefined>(undefined)
  const toast = useToast()

  const authorName = profile?.display_name?.trim() || 'Alguien'
  const link = challengeShareUrl(location.origin, challengeId)
  const caption = buildShareCaption(authorName, link)
  const domain = shareDomain(link)

  // Resuelve la portada de fondo al montar (una vez: el modal vive un único
  // reto, mismo patrón que ChallengeCreatedShare).
  useEffect(() => {
    let cancelled = false
    void resolveChallengeShareCover(imagePath, groupId, groupName).then((url) => {
      if (!cancelled) setCover(url)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar, ver comentario de arriba
  }, [])

  // Rasteriza la tarjeta en cuanto la portada está resuelta (incl. `null`).
  // rAF doble: asegura que la tarjeta ya está pintada con esa portada antes de
  // capturarla.
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

  // Fallback universal (siempre disponible, independiente de si la imagen se
  // generó): copia el mensaje + enlace, mismo criterio que InviteModal.
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(caption)
      track('challenge_shared', {
        surface: 'copied',
        group_id: groupId,
        challenge_id: challengeId,
        origin,
      })
      toast.show('Mensaje copiado, pégalo en el chat', { tone: 'success' })
    } catch {
      toast.show('No se pudo copiar el enlace', { tone: 'danger' })
    }
  }

  // Comparte la tarjeta-imagen: Web Share nivel 2 con el PNG como file y el
  // caption (enlace incluido) como texto. Sin Web Share (o si cancela), cae a
  // descargar la imagen + copiar el caption.
  async function onShare() {
    if (!blob) return
    setSharing(true)
    try {
      const result = await shareLeaderboardImage(
        blob,
        caption,
        `¿Adivinas dónde? · ${challengeTitle}`,
      )
      if (result === 'shared') {
        track('challenge_shared', {
          surface: 'shared',
          group_id: groupId,
          challenge_id: challengeId,
          origin,
        })
        onClose()
      } else if (result === 'downloaded') {
        track('challenge_shared', {
          surface: 'downloaded',
          group_id: groupId,
          challenge_id: challengeId,
          origin,
        })
        toast.show('Imagen descargada y mensaje copiado, pégalos en el chat', { tone: 'success' })
      }
      // 'cancelled': el usuario cerró la hoja de compartir del SO; dejamos el modal abierto.
    } finally {
      setSharing(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Compartir reto"
      footer={
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
      {/* Previa de la tarjeta-imagen: foto del reto (o portada del viaje, o el
          mapa nocturno de marca) con el nombre del reto — nunca un link crudo
          ni la respuesta oculta. El enlace viaja en el caption. */}
      <div className={styles.preview}>
        {pngUrl ? (
          <img
            className={styles.previewImg}
            src={pngUrl}
            alt={`Tarjeta para compartir el reto «${challengeTitle}»`}
          />
        ) : error ? (
          <p className={styles.error}>
            No se pudo generar la imagen. Puedes compartir igualmente con «Copiar enlace».
          </p>
        ) : (
          <div className={styles.loading} role="status">
            <Spinner size={28} />
            <span>Generando imagen…</span>
          </div>
        )}
      </div>

      <p className={styles.hint}>
        Comparte la tarjeta en el chat del grupo. Quien la abra entra directo a jugar ESTE reto.
      </p>

      {/* La tarjeta real, a tamaño completo, montada fuera del viewport para que
          html-to-image la mida y rasterice bien. */}
      <div className={styles.offscreen} aria-hidden="true">
        <ChallengeShareCard
          ref={cardRef}
          challengeTitle={challengeTitle}
          groupName={groupName}
          coverDataUrl={cover ?? null}
          domain={domain}
        />
      </div>
    </Modal>
  )
}
