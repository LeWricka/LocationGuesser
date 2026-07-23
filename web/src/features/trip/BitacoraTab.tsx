import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import { ChevronRight } from 'lucide-react'
import { AudioPlayer, Badge, EmptyState, Icon, IconCamara, IconDiana } from '../../ui'
import { Lightbox } from '../../ui/Lightbox'
import { listGroupMomentImages, type MomentImage } from '../../lib/momentImages'
import { signedImageUrl } from '../../lib/storage'
import { reportError } from '../../lib/observability'
import { track } from '../../lib/analytics'
import { formatDeadline } from '../../lib/time'
import { EXAMPLE_TRIP_GROUP_ID } from '../../lib/exampleTrip'
import {
  isMomentPhotoVisible,
  pairedChallengeByMemoryId,
  parseLegacyDescription,
  type Moment,
} from '../../lib/trip'
import type { LeaderboardEntry } from '../../lib/leaderboard'
import type { GroupPrizes } from '../../lib/database.types'
import {
  groupMomentsByDay,
  type BitacoraGrouped,
  type BitacoraMomentInput,
  type BitacoraPhoto,
  type BitacoraReto,
} from './bitacoraGallery'
import { StandingsBoard } from './StandingsBoard'
import type { PastChallengeSummary } from './useTripData'
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
   * Tocar el título (o "Ver el momento" del visor) de un RETO SUELTO (issue
   * #822), o la franja de reto de un momento FUSIONADO (issue #839): a
   * diferencia de un recuerdo, un reto abre su DETALLE de juego (clasificación,
   * mapa de jugadas, foto) o el flujo de jugar — la decisión de CUÁL de los dos
   * (anti-spoiler: un EN JUEGO sin jugar va a jugar, nunca al detalle) vive en
   * `TripPage`, que ya tiene `pastChallenges` para saberlo; esta pestaña no
   * duplica esa lógica, solo delega.
   */
  onOpenChallenge: (challengeId: string) => void
  /** Retos del viaje con su GANADOR ya resuelto (issue #839, mismo dato que
   * "Retos anteriores" del Marcador): la única fuente del nombre para "Reto
   * cerrado · ganó X" en la franja de un momento FUSIONADO — no se recalcula
   * aquí, se REUTILIZA. Los de PRÁCTICA no entran (no son parte del recorrido,
   * ver `useTripData`); su franja fusionada cae a "EN JUEGO" sin ganador. */
  pastChallenges: PastChallengeSummary[]
  /** Clasificación general del viaje (issue #822): alimenta el cierre de la
   * Bitácora ("La liga del viaje" + podio/lista). Vacía → no se pinta el cierre. */
  leaderboard: LeaderboardEntry[]
  /** Premios por puesto (`groups.prizes`): el podio del cierre los muestra igual
   * que el Marcador/el recap de cierre. */
  prizes: GroupPrizes | null
  /** CTA discreto "Ver marcador" del cierre: salta a la pestaña Marcador. */
  onViewMarcador: () => void
  /**
   * Ancla del PRIMER día para `GuidedTour` (viaje de ejemplo, onboarding nuevo
   * pieza 4/4): "En la Bitácora lo hojeas entero, en orden." Opcional y sin
   * efecto fuera de la guía.
   */
  firstDayRef?: RefObject<HTMLElement | null>
}

// Info de la franja de reto de un momento FUSIONADO (issue #839): status del
// reto asociado (closed cae en 'closed', practice/active en 'active' — mismo
// binario que el chip suelto de abajo) y el ganador si ya cerró, buscado en
// `pastChallenges` (única fuente del nombre, no se recalcula desde los votos).
function retoInfoFor(challenge: Moment, pastChallenges: PastChallengeSummary[]): BitacoraReto {
  const closed = challenge.status === 'closed'
  const summary = closed
    ? pastChallenges.find((p) => p.challengeId === challenge.challengeId)
    : undefined
  return {
    challengeId: challenge.challengeId,
    status: closed ? 'closed' : 'active',
    deadlineAt: challenge.deadlineAt,
    winnerName: summary?.winner?.name ?? null,
  }
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
 * SIN FOTO NO ES INVISIBLE (issue #910): un momento sin ninguna foto (ni
 * propia ni de galería) sigue entrando en la Bitácora — antes se descartaba en
 * silencio y, si además no tenía ubicación, tampoco aparecía en el globo del
 * Diario: quedaba invisible del todo (el caso real reportado: un momento
 * "Atardecer" sin foto). Se pinta con la misma tarjeta (kicker, título,
 * descripción, nota de voz), envuelta en `.momentTextOnly` — una superficie de
 * vidrio (mismos tokens que `.retoStrip`) que le da el ancla visual que en el
 * resto de la pantalla aporta la foto.
 *
 * La ruta interna sigue usando `v=fotos`/`section: 'fotos'` (ver `lib/route.ts`
 * y `TripPage.tsx`): es un identificador interno, no copy — cambiarlo no
 * aporta nada al usuario y arrastraría enlaces ya compartidos. Solo cambia lo
 * que se VE: la etiqueta del tab y esta pantalla.
 *
 * MARCA DE RETO (issue #821) → FUSIÓN (issue #839): un reto y un recuerdo con
 * la MISMA foto (p.ej. un reto creado a partir de la foto de un recuerdo,
 * `fromMomentId` en `CreateChallengeFlow`) se leían como DOS entradas
 * duplicadas — el #821 solo los distinguía con un chip, sin dejar de
 * repetirlos. El #839 los FUSIONA de verdad (`pairedChallengeByMemoryId` en
 * `lib/trip.ts`): el reto asociado no pinta su propia entrada — se filtra
 * antes de agrupar por día, y su estado ("EN JUEGO" con punto vivo / "Reto
 * cerrado · ganó X") se pinta como una franja tappable dentro de la entrada
 * del recuerdo (`moment.reto`, `retoInfoFor`), reutilizando la MISMA
 * navegación (`onOpenChallenge`) que ya tenía el reto suelto. Un reto SIN
 * recuerdo asociado sigue con el chip suelto de siempre ("EN JUEGO"/"Cerrado").
 *
 * CIERRE (issue #822, rediseño oscuro issue #849): tras el último día, si ya
 * hay clasificación (alguien jugó algún reto), la Bitácora remata con
 * `StandingsBoard` en su modo INMERSIVO (sin `classes`): se pinta ENTERO
 * (cabecera, podio/lista con el lenguaje de la cumbre del Marcador, resumen y
 * el CTA "Ver marcador") directamente sobre la escena oscura — ya no una
 * tarjeta de papel encima de ella (issue #849: el diseño anterior "chirriaba"
 * contra la Bitácora oscura).
 */
export function BitacoraTab({
  groupId,
  moments,
  canCreate,
  onAddMoment,
  onOpenMoment,
  onOpenChallenge,
  pastChallenges,
  leaderboard,
  prizes,
  onViewMarcador,
  firstDayRef,
}: Props) {
  // null = cargando.
  const [grouped, setGrouped] = useState<BitacoraGrouped | null>(null)
  const [lightboxAt, setLightboxAt] = useState<number | null>(null)
  // Resumen de la liga (issue #849, punto 3): cerrados = con resultado ya
  // resuelto (los EN JUEGO todavía no cuentan como "jugados" del todo). Se
  // deriva de un prop que la pestaña YA recibe (`pastChallenges`) — sin fetch
  // nuevo.
  const challengesPlayed = pastChallenges.filter((c) => c.status === 'closed').length

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        // Fusión momento↔reto (issue #839): un reto ASOCIADO a un recuerdo
        // (misma foto, `pairedChallengeByMemoryId`) no se pinta como entrada
        // propia — se funde en la franja de esa MISMA entrada más abajo
        // (`retoInfoFor`). Antes esto pintaba dos entradas con la MISMA foto
        // (el recuerdo y el reto), leídas como contenido duplicado.
        const pairedByMemoryId = pairedChallengeByMemoryId(moments)
        const mergedAwayIds = new Set(Array.from(pairedByMemoryId.values(), (c) => c.challengeId))
        const visible = moments
          .filter(isMomentPhotoVisible)
          .filter((m) => !mergedAwayIds.has(m.challengeId))
        const recuerdoIds = visible.filter((m) => !m.isChallenge).map((m) => m.challengeId)
        // Viaje de ejemplo (onboarding nuevo, pieza 4/4): sin galería extra que
        // pedir a `moment_images` — sus fotos ya vienen en `moment.imageUrl`
        // (rutas públicas de `/example-trip/*`, ver `lib/exampleTrip.ts`), así
        // que cada momento cae al fallback de "portada ya firmada" de abajo sin
        // ninguna llamada de red.
        const galleryByMoment: Map<string, MomentImage[]> =
          groupId === EXAMPLE_TRIP_GROUP_ID ? new Map() : await listGroupMomentImages(recuerdoIds)

        // Por momento, su tanda de fotos (ready/a firmar) EN ORDEN de galería —
        // TODOS los momentos visibles entran aquí, tengan o no foto (issue
        // #910): antes, un momento sin NINGUNA foto se descartaba justo en este
        // paso (`pending.length > 0`) y desaparecía de la Bitácora entera, aunque
        // llevara título, nota, audio o vídeo (el caso real: un momento
        // "Atardecer" sin foto ni ubicación se leía como "bitácora vacía").
        const perMoment: { moment: Moment; pending: PendingPhoto[] }[] = []
        for (const m of visible) {
          const gallery = !m.isChallenge ? galleryByMoment.get(m.challengeId) : undefined
          const pending: PendingPhoto[] =
            gallery && gallery.length > 0
              ? gallery.map((img) => ({ kind: 'sign', path: img.image_path }))
              : m.imageUrl
                ? [{ kind: 'ready', src: m.imageUrl }]
                : []
          perMoment.push({ moment: m, pending })
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
          const pairedChallenge = pairedByMemoryId.get(m.challengeId)
          return {
            momentId: m.challengeId,
            momentTitle: m.title,
            isChallenge: m.isChallenge,
            status: m.status,
            reto: pairedChallenge ? retoInfoFor(pairedChallenge, pastChallenges) : null,
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
        // Un momento sin fotos (nunca tuvo ninguna, o todas fallaron al firmar)
        // YA no se descarta (issue #910): pinta su propia tarjeta de solo texto
        // más abajo (ver `.momentTextOnly`) — nunca vuelve a quedar invisible.
        if (!cancelled) setGrouped(groupMomentsByDay(inputs))
      } catch (err) {
        reportError(err, { area: 'bitacora_tab_load' })
        if (!cancelled) setGrouped({ days: [], flatPhotos: [] })
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [groupId, moments, pastChallenges])

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
          {days.map((day, i) => (
            <section
              key={day.key}
              aria-label={day.placesLabel ? `${day.label} — ${day.placesLabel}` : day.label}
              className={styles.day}
              ref={i === 0 ? firstDayRef : undefined}
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
                {day.moments.map((moment) => {
                  // Issue #910: sin foto ni vídeo, el momento no tiene el ancla
                  // visual que da el resto de la Bitácora (fotos a ancho
                  // completo) — sin una superficie propia se leería como un
                  // hueco flotando en la escena oscura. `momentTextOnly` lo
                  // envuelve en una tarjeta de vidrio (mismos tokens que
                  // `.retoStrip`), nunca vacía: título siempre presente.
                  const hasMedia = Boolean(moment.videoUrl) || moment.photos.length > 0
                  return (
                    <article
                      key={moment.momentId}
                      className={
                        hasMedia ? styles.moment : `${styles.moment} ${styles.momentTextOnly}`
                      }
                    >
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

                      {/* Sin foto ni vídeo, este bloque no pinta nada (issue #910):
                        un `<div>` vacío no deja hueco visual, pero tampoco aporta
                        nada — mejor omitirlo del todo y dejar que `momentTextOnly`
                        (arriba) sea la única superficie de la tarjeta. */}
                      {hasMedia && (
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
                      )}

                      {/* Franja de reto FUSIONADO (issue #839): un reto asociado a
                        este recuerdo (misma foto) ya no pinta su propia entrada
                        duplicada — vive integrado aquí, con el mismo lenguaje de
                        estado que el chip suelto de arriba (diana + "EN JUEGO"/
                        "Reto cerrado") más la acción que ya tenía el reto suelto
                        (tocar → `onOpenChallenge`, que en `TripPage` decide jugar
                        o ver el detalle, mismo anti-spoiler de siempre). */}
                      {moment.reto && (
                        <button
                          type="button"
                          className={[styles.retoStrip, 'lg-press'].join(' ')}
                          onClick={() => onOpenChallenge(moment.reto!.challengeId)}
                        >
                          <Badge
                            tone={moment.reto.status === 'closed' ? 'neutral' : 'live'}
                            dot={moment.reto.status !== 'closed'}
                          >
                            <IconDiana size={13} />
                            {moment.reto.status === 'closed' ? 'Reto cerrado' : 'EN JUEGO'}
                          </Badge>
                          <span className={styles.retoStripMeta}>
                            {moment.reto.status === 'closed'
                              ? moment.reto.winnerName
                                ? `Ganó ${moment.reto.winnerName}`
                                : 'Se cerró sin votos'
                              : formatDeadline(moment.reto.deadlineAt)}
                          </span>
                          <Icon icon={ChevronRight} size={16} className={styles.retoStripChevron} />
                        </button>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
          ))}

          {/* Cierre de la Bitácora (issue #822, rediseño oscuro #849): el
              remate visual del diario, modo INMERSIVO de `StandingsBoard`
              (sin `classes` — se pinta entero: cabecera, podio/lista con el
              lenguaje de la cumbre del Marcador, resumen y el CTA "Ver
              marcador") directamente sobre la escena, sin tarjeta de papel.
              Solo si ya hay alguna jugada (leaderboard vacío = nadie jugó
              todavía = no añade ruido). */}
          {leaderboard.length > 0 && (
            <StandingsBoard
              leaderboard={leaderboard}
              prizes={prizes}
              challengesPlayed={challengesPlayed}
              onViewMarcador={onViewMarcador}
            />
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
