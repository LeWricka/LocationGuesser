import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Play } from 'lucide-react'
import { ChallengePhoto, EmptyState, Icon, IconCamara } from '../../ui'
import { Lightbox } from '../../ui/Lightbox'
import { listGroupMomentImages } from '../../lib/momentImages'
import { signedImageUrl } from '../../lib/storage'
import { reportError } from '../../lib/observability'
import { isMomentPhotoVisible, type Moment } from '../../lib/trip'
import { groupPhotosByDay, type GalleryPhoto } from './fotosGallery'
import styles from './FotosTab.module.css'

interface Props {
  groupId: string
  /** Momentos del viaje en orden cronológico ASC — el mismo dato que ya carga
   * `useTripData` para el Diario: no se vuelve a pedir el grupo/los retos aquí. */
  moments: Moment[]
  /** ¿Puede añadir momentos? (dueño del viaje) — gobierna el CTA del vacío. */
  canCreate: boolean
  /** Abre el flujo de "Añadir recuerdo" (CTA del estado vacío). */
  onAddMoment: () => void
  /** "Ver el momento" del lightbox: abre la hoja de detalle de ESE momento (la
   * misma mecánica que ya usa TripPage para el Diario). */
  onOpenMoment: (moment: Moment) => void
}

// Candidata a foto a firmar (galería de un recuerdo) o ya lista (portada, que
// `useTripData` ya firmó en lote). Mantener el orden original importa: por eso
// se resuelve todo en un único array antes de repartir en `ready`/`toSign`.
type Pending =
  | { kind: 'ready'; photo: GalleryPhoto }
  | {
      kind: 'sign'
      path: string
      momentId: string
      momentTitle: string
      date: string
      hasVideo?: boolean
    }

/**
 * Pestaña FOTOS del viaje (issue #645): TODAS las imágenes visibles de los
 * momentos —la portada de cada uno y, en un recuerdo, el resto de su galería
 * (`moment_images`)—, agrupadas por día y en orden cronológico.
 *
 * ANTI-SPOILER: un reto con foto-sorpresa (`photoIsHint: false`) aún EN JUEGO no
 * aparece hasta que cierre — `isMomentPhotoVisible` (lib/trip.ts) es la única
 * fuente de verdad de esa regla, compartida por si otra vista la necesita.
 *
 * MODO EFICIENTE: la portada de cada momento ya viene firmada en `moment.imageUrl`
 * (la firma `useTripData` en lote); aquí SOLO se vuelve a firmar lo que hace
 * falta de más — la galería extra de un recuerdo (`moment_images`), pedida en
 * una sola consulta por lote (`listGroupMomentImages`, patrón dos-consultas).
 */
export function FotosTab({ groupId, moments, canCreate, onAddMoment, onOpenMoment }: Props) {
  // null = cargando; [] = cargado y vacío.
  const [photos, setPhotos] = useState<GalleryPhoto[] | null>(null)
  const [lightboxAt, setLightboxAt] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const visible = moments.filter(isMomentPhotoVisible)
        const recuerdoIds = visible.filter((m) => !m.isChallenge).map((m) => m.challengeId)
        const galleryByMoment = await listGroupMomentImages(recuerdoIds)

        const pending: Pending[] = []
        for (const m of visible) {
          const gallery = !m.isChallenge ? galleryByMoment.get(m.challengeId) : undefined
          if (gallery && gallery.length > 0) {
            // Recuerdo con galería propia: TODAS sus fotos (a firmar aquí). Solo
            // la PORTADA (la primera, `i === 0`) lleva el badge ▶ si el momento
            // tiene clip (issue #649) — es la única que representa "este momento
            // tiene un vídeo" en la rejilla; el resto son fotos sueltas.
            gallery.forEach((img, i) => {
              pending.push({
                kind: 'sign',
                path: img.image_path,
                momentId: m.challengeId,
                momentTitle: m.title,
                date: m.date,
                hasVideo: i === 0 && m.videoUrl != null,
              })
            })
          } else if (m.imageUrl) {
            // Reto (nunca lleva galería), o recuerdo legado sin filas en
            // `moment_images`: su única foto, YA firmada por `useTripData`. Un
            // reto nunca tiene `videoUrl` (ver `lib/trip.ts`), así que el badge
            // solo puede encenderse en un recuerdo legado con clip.
            pending.push({
              kind: 'ready',
              photo: {
                src: m.imageUrl,
                momentId: m.challengeId,
                momentTitle: m.title,
                date: m.date,
                hasVideo: m.videoUrl != null,
              },
            })
          }
        }

        const resolved = await Promise.all(
          pending.map((p) => (p.kind === 'ready' ? p.photo.src : signedImageUrl(p.path))),
        )
        const out: GalleryPhoto[] = []
        pending.forEach((p, i) => {
          const src = resolved[i]
          if (!src) return
          out.push(
            p.kind === 'ready'
              ? p.photo
              : {
                  src,
                  momentId: p.momentId,
                  momentTitle: p.momentTitle,
                  date: p.date,
                  hasVideo: p.hasVideo,
                },
          )
        })
        if (!cancelled) setPhotos(out)
      } catch (err) {
        reportError(err, { area: 'fotos_tab_load' })
        if (!cancelled) setPhotos([])
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [groupId, moments])

  const groups = useMemo(() => (photos ? groupPhotosByDay(photos) : []), [photos])
  const flatPhotos = photos ?? []

  return (
    <div className={styles.scene}>
      {photos === null ? (
        <div className={styles.grid} aria-hidden="true">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className={`${styles.skeletonCell} lg-shimmer-surface`} />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className={styles.emptyWrap}>
          <div className={styles.emptyCard}>
            <EmptyState
              icon={<IconCamara size={32} />}
              title="Aún no hay fotos"
              description="Las fotos de los momentos del viaje aparecerán aquí."
              actionLabel={canCreate ? 'Añadir momento' : undefined}
              onAction={canCreate ? onAddMoment : undefined}
            />
          </div>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.key} aria-label={group.label}>
            <h3 className={styles.dayHeader}>{group.label}</h3>
            <div className={styles.grid}>
              {group.photos.map((photo) => (
                <div
                  key={`${photo.momentId}-${photo.flatIndex}`}
                  className={styles.cellWrap}
                  style={{ '--i': photo.flatIndex } as CSSProperties}
                >
                  <ChallengePhoto
                    src={photo.src}
                    alt={photo.momentTitle}
                    ratio="square"
                    size="lg"
                    zoomable={false}
                    className={styles.cell}
                    onClick={() => setLightboxAt(photo.flatIndex)}
                  />
                  {/* Badge ▶ (issue #649): esta portada representa un momento con
                      clip de vídeo. El clip en sí se ve abriendo el momento
                      ("Ver el momento" del lightbox), no en esta rejilla. */}
                  {photo.hasVideo && (
                    <div className={styles.videoBadge} data-testid="video-badge" aria-hidden="true">
                      <Icon icon={Play} size={14} fill="currentColor" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      {lightboxAt !== null && (
        <Lightbox
          open
          images={flatPhotos.map((p) => ({ src: p.src, alt: p.momentTitle }))}
          startIndex={lightboxAt}
          onClose={() => setLightboxAt(null)}
          secondaryActionLabel="Ver el momento"
          onSecondaryAction={(i) => {
            setLightboxAt(null)
            const photo = flatPhotos[i]
            const moment = photo ? moments.find((m) => m.challengeId === photo.momentId) : undefined
            if (moment) onOpenMoment(moment)
          }}
        />
      )}
    </div>
  )
}
