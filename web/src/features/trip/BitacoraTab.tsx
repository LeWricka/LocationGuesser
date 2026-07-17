import { useEffect, useState } from 'react'
import { ListOrdered } from 'lucide-react'
import { AudioPlayer, Badge, Button, EmptyState, Icon, IconCamara, IconDiana } from '../../ui'
import { Lightbox } from '../../ui/Lightbox'
import { listGroupMomentImages } from '../../lib/momentImages'
import { signedImageUrl } from '../../lib/storage'
import { reportError } from '../../lib/observability'
import { track } from '../../lib/analytics'
import { isMomentPhotoVisible, parseLegacyDescription, type Moment } from '../../lib/trip'
import type { LeaderboardEntry } from '../../lib/leaderboard'
import type { GroupPrizes } from '../../lib/database.types'
import {
  groupMomentsByDay,
  type BitacoraGrouped,
  type BitacoraMomentInput,
  type BitacoraPhoto,
} from './bitacoraGallery'
import { StandingsBoard, type StandingsClasses } from './StandingsBoard'
import styles from './BitacoraTab.module.css'

interface Props {
  groupId: string
  /** Momentos del viaje en orden cronológico ASC — el mismo dato que ya carga
   * `useTripData` para el Diario: no se vuelve a pedir el grupo/los retos aquí. */
  moments: Moment[]
  /** ¿Puede añadir momentos? (issue #783: cualquier MIEMBRO del viaje) —
   * gobierna el CTA del vacío. */
  canCreate: boolean
  /** Abre el flujo de "Añadir recuerdo" (CTA del estado vacío). */
  onAddMoment: () => void
  /** "Ver el momento" (tocar el título, o "Ver el momento" del visor) de un
   * RECUERDO: abre la hoja de detalle de ESE momento (la misma mecánica que ya
   * usa TripPage para el Diario). Un RETO nunca llega aquí — ver `onOpenChallenge`. */
  onOpenMoment: (moment: Moment) => void
  /**
   * Tocar el título (o "Ver el momento" del visor) de un RETO (issue #822): a
   * diferencia de un recuerdo, un reto abre su DETALLE de juego (clasificación,
   * mapa de jugadas, foto) o el flujo de jugar — la decisión de CUÁL de los dos
   * (anti-spoiler: un EN JUEGO sin jugar va a jugar, nunca al detalle) vive en
   * `TripPage`, que ya tiene `pastChallenges` para saberlo; esta pestaña no
   * duplica esa lógica, solo delega.
   */
  onOpenChallenge: (challengeId: string) => void
  /** Clasificación general del viaje (issue #822): alimenta el cierre de la
   * Bitácora ("La liga del viaje" + podio/lista). Vacía → no se pinta el cierre. */
  leaderboard: LeaderboardEntry[]
  /** Premios por puesto (`groups.prizes`): el podio del cierre los muestra igual
   * que el Marcador/el recap de cierre. */
  prizes: GroupPrizes | null
  /** CTA discreto "Ver marcador" del cierre: salta a la pestaña Marcador. */
  onViewMarcador: () => void
}

// Clases del podio/lista del cierre, en la escala de la Bitácora (tarjeta opaca
// sobre la escena oscura, mismo criterio que `.emptyCard`/`.audioCard`):
// reutiliza el MARKUP compartido `StandingsBoard` (issue #822 — "no dupliques
// el markup del Marcador"), su propia escala vive en `BitacoraTab.module.css`.
const standingsClasses: StandingsClasses = {
  podium: styles.podium,
  podiumCol: styles.podiumCol,
  placeFirst: styles.placeFirst,
  placeSecond: styles.placeSecond,
  placeThird: styles.placeThird,
  crown: styles.crown,
  podiumDisc: styles.podiumDisc,
  podiumAvatar: styles.podiumAvatar,
  podiumName: styles.podiumName,
  podiumPoints: styles.podiumPoints,
  podiumPrize: styles.podiumPrize,
  pedestal: styles.pedestal,
  pedestalMedal: styles.pedestalMedal,
  gold: styles.gold,
  silver: styles.silver,
  bronze: styles.bronze,
  board: styles.board,
  row: styles.row,
  rank: styles.rank,
  player: styles.player,
  playerName: styles.playerName,
  rowRight: styles.rowRight,
  bar: styles.bar,
  rowPoints: styles.rowPoints,
}

// Candidata a foto a firmar (galería propia de un recuerdo) o ya lista
// (portada, que `useTripData` ya firmó en lote). Mantener el orden original
// importa: por eso cada momento resuelve TODA su tanda en un único hueco del
// `Promise.all` compartido, antes de repartir el resultado de vuelta.
type PendingPhoto = { kind: 'ready'; src: string } | { kind: 'sign'; path: string }

/**
 * Pestaña BITÁCORA del viaje (antes "Fotos" — issue #645; el diario que se
 * hojea, esta issue): TODOS los momentos visibles, agrupados por día y en
 * orden cronológico, cada uno con su kicker de lugar, título (abre el
 * momento), descripción con capitular, nota de voz inline y TODAS sus fotos a
 * ancho completo — sin rejilla ni "+N": el dueño quiere verlas sin hacer clics.
 *
 * ANTI-SPOILER: un reto con foto-sorpresa (`photoIsHint: false`) aún EN JUEGO no
 * aparece hasta que cierre — `isMomentPhotoVisible` (lib/trip.ts) es la única
 * fuente de verdad de esa regla, compartida por si otra vista la necesita.
 *
 * MODO EFICIENTE: la portada de cada momento ya viene firmada en `moment.imageUrl`
 * (la firma `useTripData` en lote); aquí SOLO se vuelve a firmar lo que hace
 * falta de más — la galería extra de un recuerdo (`moment_images`), pedida en
 * una sola consulta por lote (`listGroupMomentImages`, patrón dos-consultas).
 *
 * La ruta interna sigue usando `v=fotos`/`section: 'fotos'` (ver `lib/route.ts`
 * y `TripPage.tsx`): es un identificador interno, no copy — cambiarlo no
 * aporta nada al usuario y arrastraría enlaces ya compartidos. Solo cambia lo
 * que se VE: la etiqueta del tab y esta pantalla.
 *
 * MARCA DE RETO (issue #821): un reto y un recuerdo con la MISMA foto (p.ej. un
 * reto creado a partir de la foto de un recuerdo, `fromMomentId` en
 * `CreateChallengeFlow`) se leían como entradas duplicadas — nada los
 * distinguía. Cada entrada de reto lleva ahora el chip diana + estado ("EN
 * JUEGO" con punto vivo / "Cerrado"), MISMO lenguaje que `ChallengeDetail`; el
 * recuerdo se queda limpio (su ausencia de chip ES su marca).
 *
 * CIERRE (issue #822): tras el último día, si ya hay clasificación (alguien
 * jugó algún reto), la Bitácora remata con el mismo podio/lista del Marcador
 * (`StandingsBoard`, pieza compartida) y un CTA discreto a la pestaña completa.
 */
export function BitacoraTab({
  groupId,
  moments,
  canCreate,
  onAddMoment,
  onOpenMoment,
  onOpenChallenge,
  leaderboard,
  prizes,
  onViewMarcador,
}: Props) {
  // null = cargando.
  const [grouped, setGrouped] = useState<BitacoraGrouped | null>(null)
  const [lightboxAt, setLightboxAt] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const visible = moments.filter(isMomentPhotoVisible)
        const recuerdoIds = visible.filter((m) => !m.isChallenge).map((m) => m.challengeId)
        const galleryByMoment = await listGroupMomentImages(recuerdoIds)

        // Por momento, su tanda de fotos (ready/a firmar) EN ORDEN de galería.
        const perMoment: { moment: Moment; pending: PendingPhoto[] }[] = []
        for (const m of visible) {
          const gallery = !m.isChallenge ? galleryByMoment.get(m.challengeId) : undefined
          const pending: PendingPhoto[] =
            gallery && gallery.length > 0
              ? gallery.map((img) => ({ kind: 'sign', path: img.image_path }))
              : m.imageUrl
                ? [{ kind: 'ready', src: m.imageUrl }]
                : []
          if (pending.length > 0) perMoment.push({ moment: m, pending })
        }

        // UN solo Promise.all para todo el viaje: solo firma lo que hace falta
        // de más (la galería extra), la portada ya viene firmada.
        const flatPending = perMoment.flatMap((p) => p.pending)
        const resolved = await Promise.all(
          flatPending.map((p) => (p.kind === 'ready' ? p.src : signedImageUrl(p.path))),
        )

        let cursor = 0
        const inputs: BitacoraMomentInput[] = perMoment.map(({ moment: m, pending }) => {
          const photos = pending
            .map(() => resolved[cursor++])
            .filter((src): src is string => Boolean(src))
          // Momentos de antes de la migración 0037 (issue #566) incrustaban la
          // fecha elegida al principio de `description` (`📅 <día> de <mes>`,
          // ver `parseLegacyDescription`): sin separarlo, ese emoji se pintaba
          // GIGANTE bajo la letra capitular de `.description` (issue #686). El
          // cuerpo limpio va al párrafo de siempre; la fecha, junto al kicker.
          const { dateLabel, text } = parseLegacyDescription(m.description)
          return {
            momentId: m.challengeId,
            momentTitle: m.title,
            isChallenge: m.isChallenge,
            status: m.status,
            date: m.date,
            description: text,
            dateLabel,
            audioUrl: m.audioUrl ?? null,
            videoUrl: m.videoUrl ?? null,
            // Lugar del kicker/cabecera de día: el mismo país resuelto que usa
            // la tarjeta-mapa de MomentSheet (sin bandera válida, sin lugar).
            placeLabel: m.country?.flag ? m.country.name : null,
            photos,
          }
        })
        // Un momento puede quedarse sin fotos si TODAS fallaron al firmar: sin
        // foto ni vídeo con poster, no hay nada que pintar de él aquí.
        const nonEmpty = inputs.filter((i) => i.photos.length > 0)
        if (!cancelled) setGrouped(groupMomentsByDay(nonEmpty))
      } catch (err) {
        reportError(err, { area: 'bitacora_tab_load' })
        if (!cancelled) setGrouped({ days: [], flatPhotos: [] })
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [groupId, moments])

  const days = grouped?.days ?? []
  const flatPhotos = grouped?.flatPhotos ?? []

  // Tocar una entrada (título o "Ver el momento" del visor): un RETO abre su
  // detalle de juego (`onOpenChallenge`, issue #822 — anti-spoiler decidido en
  // TripPage), un RECUERDO la hoja de contenido de siempre (`onOpenMoment`).
  const openEntry = (momentId: string) => {
    const found = moments.find((m) => m.challengeId === momentId)
    if (!found) return
    if (found.isChallenge) onOpenChallenge(found.challengeId)
    else onOpenMoment(found)
  }

  return (
    <div className={styles.scene}>
      {grouped === null ? (
        <div className={styles.skeleton} aria-hidden="true">
          {Array.from({ length: 3 }, (_, i) => (
            <span key={i} className={`${styles.skeletonCard} lg-shimmer-surface`} />
          ))}
        </div>
      ) : days.length === 0 ? (
        <div className={styles.emptyWrap}>
          <div className={styles.emptyCard}>
            <EmptyState
              icon={<IconCamara size={32} />}
              title="Tu bitácora está vacía"
              description="Añade un momento y empieza a contarlo, día a día."
              actionLabel={canCreate ? 'Añadir momento' : undefined}
              onAction={canCreate ? onAddMoment : undefined}
            />
          </div>
        </div>
      ) : (
        <>
          {days.map((day) => (
            <section
              key={day.key}
              aria-label={day.placesLabel ? `${day.label} — ${day.placesLabel}` : day.label}
              className={styles.day}
            >
              <h3 className={styles.dayHeader}>
                <span className={styles.dayDate}>{day.label}</span>
                <span className={styles.dayThread} aria-hidden="true" />
                {/* El separador es texto real (no solo hueco visual): sin él, la
                  fecha y los lugares se leerían pegados ("3 julSALENTO") al
                  usuario de lector de pantalla y en el `textContent` del h3.
                  Un "·" (no "—", issue #686): el hilo punteado YA separa fecha
                  de lugares visualmente — un guion encima era una segunda
                  marca de separación redundante y recargaba la fila; el punto
                  medio es más ligero y es el MISMO lenguaje de puntuación que
                  ya usa `.kicker` y el propio `dayPlaces` entre lugares. */}
                {day.placesLabel && <span className={styles.dayPlaces}>· {day.placesLabel}</span>}
              </h3>

              <div className={`${styles.moments} lg-stagger`}>
                {day.moments.map((moment) => (
                  <article key={moment.momentId} className={styles.moment}>
                    {/* Chip de reto (issue #821): diana + estado, MISMO lenguaje que
                        `ChallengeDetail` ("EN JUEGO" con punto vivo / "Cerrado") —
                        sin él, un reto y un recuerdo con la misma foto se leen como
                        duplicados. `practice` cae en "EN JUEGO" (nunca cierra de
                        verdad, igual criterio binario que `ChallengeDetail`). Un
                        recuerdo no lleva chip: su ausencia ES la marca. */}
                    {moment.isChallenge && (
                      <span className={styles.retoChip}>
                        <Badge
                          tone={moment.status === 'closed' ? 'neutral' : 'live'}
                          dot={moment.status !== 'closed'}
                        >
                          <IconDiana size={13} />
                          {moment.status === 'closed' ? 'Cerrado' : 'EN JUEGO'}
                        </Badge>
                      </span>
                    )}

                    {/* El "◦ " es decorativo (CSS `::before`, ver .kicker): así el
                      texto accesible/testeable arranca en el lugar (o la fecha, si
                      no hay lugar), sin un nodo partido entre el símbolo y el texto.
                      Lugar y fecha legada (#686) van en el MISMO nodo de texto — un
                      "· " entre ambos, nunca en `<span>` hermanos — para que un
                      lector de pantalla los lea como una sola frase, no pegados. */}
                    {(moment.placeLabel || moment.dateLabel) && (
                      <p className={styles.kicker}>
                        {[moment.placeLabel, moment.dateLabel].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    <button
                      type="button"
                      className={styles.titleBtn}
                      onClick={() => openEntry(moment.momentId)}
                    >
                      <h4 className={styles.title}>{moment.momentTitle}</h4>
                    </button>

                    {moment.description && (
                      <p className={styles.description}>{moment.description}</p>
                    )}

                    {/* Nota de voz (issue #648): reproducible aquí mismo, sin abrir
                        el momento. Envuelta en tarjeta clara: `AudioPlayer` usa
                        tokens de PAPEL, ilegible directo sobre la escena oscura
                        (mismo motivo que `.emptyCard` más abajo). */}
                    {moment.audioUrl && (
                      <div className={styles.audioCard}>
                        <AudioPlayer
                          src={moment.audioUrl}
                          onPlay={() =>
                            track('voice_note_played', { challenge_id: moment.momentId })
                          }
                        />
                      </div>
                    )}

                    <div className={styles.photos}>
                      {/* Clip corto (issue #649): la primera "foto" del recuerdo es
                          el vídeo, con su propia portada como poster (mismo
                          criterio que "El clip" de MomentSheet). */}
                      {moment.videoUrl && (
                        <video
                          className={styles.media}
                          controls
                          playsInline
                          poster={moment.videoPoster ?? undefined}
                          src={moment.videoUrl}
                          data-testid="moment-video-player"
                        />
                      )}
                      {moment.photos.map((photo) => (
                        <BitacoraPhotoFrame
                          key={photo.flatIndex}
                          photo={photo}
                          alt={moment.momentTitle}
                          onOpen={() => setLightboxAt(photo.flatIndex)}
                        />
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}

          {/* Cierre de la Bitácora (issue #822): la clasificación general del
              viaje, MISMA pieza que el Marcador/el recap de cierre
              (`StandingsBoard`, `Podium` reutilizado) — la bitácora se lee como
              la historia del viaje y remata con quién ganó. Solo si ya hay
              alguna jugada (leaderboard vacío = nadie jugó todavía = no añade
              ruido). Tarjeta opaca sobre la escena, mismo criterio que
              `.emptyCard`/`.audioCard`. */}
          {leaderboard.length > 0 && (
            <section className={styles.closing} aria-label="Clasificación del viaje">
              <div className={styles.closingCard}>
                <header className={styles.closingHead}>
                  <span className={styles.closingKicker}>La liga del viaje</span>
                  <h2 className={styles.closingTitle}>Clasificación</h2>
                </header>
                <StandingsBoard
                  leaderboard={leaderboard}
                  prizes={prizes}
                  classes={standingsClasses}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  fullWidth
                  className={styles.closingCta}
                  onClick={onViewMarcador}
                >
                  <Icon icon={ListOrdered} size={16} /> Ver marcador
                </Button>
              </div>
            </section>
          )}
        </>
      )}

      {lightboxAt !== null && (
        <Lightbox
          open
          images={flatPhotos.map((p) => ({ src: p.src, alt: p.alt }))}
          startIndex={lightboxAt}
          onClose={() => setLightboxAt(null)}
          secondaryActionLabel="Ver el momento"
          onSecondaryAction={(i) => {
            setLightboxAt(null)
            const photo = flatPhotos[i]
            if (photo) openEntry(photo.momentId)
          }}
        />
      )}
    </div>
  )
}

/**
 * Una foto a ancho completo, con reserva de espacio (issue #645): sin
 * dimensiones guardadas en BD, no podemos saber su proporción real hasta que
 * carga — mientras tanto reserva una caja por defecto (con shimmer) en vez de
 * colapsar a 0 (el salto sería peor con `loading="lazy"` y decenas de fotos).
 * Al cargar, la caja SUELTA esa proporción por la NATURAL de la imagen (ancho
 * 100%, alto automático): nunca se recorta, solo se ajusta una vez.
 */
function BitacoraPhotoFrame({
  photo,
  alt,
  onOpen,
}: {
  photo: BitacoraPhoto
  alt: string
  onOpen: () => void
}) {
  const [loaded, setLoaded] = useState(false)
  // Si la imagen ya estaba en caché, el navegador puede no disparar `onLoad`.
  const markLoaded = (el: HTMLImageElement | null) => {
    if (el?.complete) setLoaded(true)
  }

  return (
    <button
      type="button"
      className={styles.photoBtn}
      onClick={onOpen}
      aria-label={`Ampliar foto: ${alt}`}
    >
      <span
        className={[styles.photoFrame, loaded ? styles.photoFrameLoaded : 'lg-shimmer-surface']
          .filter(Boolean)
          .join(' ')}
      >
        <img
          ref={markLoaded}
          className={[styles.photoImg, loaded ? 'lg-photo-in' : styles.photoImgHidden].join(' ')}
          src={photo.src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
        />
      </span>
    </button>
  )
}
