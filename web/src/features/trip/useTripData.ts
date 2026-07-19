import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GroupInfo } from '../../lib/groupData'
import { getGroup, getGroupChallenges, isLive, splitByStatus } from '../../lib/groupData'
import { getAnswers, isPracticeChallenge, type ChallengeForPlay } from '../../lib/challenges'
import {
  aggregateLeaderboard,
  getGroupVotes,
  type LeaderboardEntry,
  type VoteWithName,
} from '../../lib/leaderboard'
import { signedImageUrl } from '../../lib/storage'
import { supabase } from '../../lib/supabase'
import { countryFromCoords, type CountryInfo } from '../../lib/countryFlag'
import type { LatLng } from '../../lib/geo'
import {
  pairedChallengeByMemoryId,
  resolveMomentPhoto,
  type Moment,
  type MomentStatus,
  type RoutePoint,
} from '../../lib/trip'
import { useVisibilityReload } from '../../lib/useVisibilityReload'

// Espera entre peticiones a coords NO cacheadas. Nominatim limita a ~1 req/s;
// dejamos margen (1.1 s) para no rozar el límite ni en ráfaga.
const COUNTRY_STAGGER_MS = 1100

/**
 * Resultado de un jugador en un reto concreto (para "Resultados recientes" del
 * hub de Retos): quién jugó, a cuántos km cayó y los puntos que sacó. Derivado de
 * los votos del último reto CERRADO, ordenado del más certero (menos km) al menos.
 */
export interface RecentResult {
  userId: string
  name: string
  avatar: string | null
  /** Distancia al objetivo en km; null en un voto de timeout (no marcó). */
  distanceKm: number | null
  points: number
}

/**
 * Resumen de un reto CERRADO para el recap de cierre: quién ganó (más puntos),
 * sus puntos y cuántos jugadores lo adivinaron. Indexado por `challengeId` para
 * que el timeline-resumen del wrap añada el resultado a cada reto sin recalcular.
 */
export interface ChallengeWinner {
  /** Nombre del jugador con más puntos en ese reto, o null si nadie votó. */
  name: string | null
  /** Puntos del ganador (0 si nadie votó). */
  points: number
  /** Nº de jugadores distintos que adivinaron el reto. */
  guessedCount: number
}

/** Resultado (puntos + distancia + anti-trampa) de UN jugador en UN reto. */
export interface PastChallengeResult {
  points: number
  /** Distancia al objetivo en km; null en un reto de número o un voto de timeout. */
  distanceKm: number | null
  /** Salió de la app durante esa jugada (issue #200) — se anuncia con un icono discreto. */
  leftApp: boolean
}

/**
 * Resumen de un reto para la sección "Retos anteriores" del Marcador (issue #608,
 * rescatado de `GroupPage`/PastSection; ampliado en el issue #800 a los retos EN
 * JUEGO): quién ganó (si ya cerró) y cómo me fue A MÍ, sin arrastrar el detalle
 * completo (foto grande, mapa, listado de votos) — eso vive en el detalle del
 * reto (`ChallengeDetail`), al que se llega tocando la fila.
 */
export interface PastChallengeSummary {
  challengeId: string
  title: string
  /** EN JUEGO (aún no venció el plazo) o CERRADO. Issue #800: separa visualmente
   * la fila (chip "EN JUEGO" + cuenta atrás) y gobierna el anti-spoiler al tocarla
   * — un EN JUEGO sin `myResult` va a JUGAR, nunca al detalle. */
  status: 'active' | 'closed'
  /** Plazo del reto (`deadline_at`): FUTURO si está `active` (cuenta atrás),
   * PASADO si `closed` (cuándo cerró). Cae a la fecha de creación si faltara. */
  closedAt: string
  /** Reto CREADO por el usuario en sesión: nunca tiene `myResult` (no se vota lo propio). */
  isOwn: boolean
  /** Quien más puntos sacó, o null si el reto se cerró sin ningún voto. Solo se
   * calcula para `status: 'closed'` — mientras está EN JUEGO el resultado no es
   * definitivo, así que la fila no promete un "ganador" todavía. `userId`/`avatar`
   * (issue #841, rediseño oscuro "El camino"): el hito de un reto cerrado muestra
   * el AVATAR real de quien ganó, no solo el nombre. */
  winner: (PastChallengeResult & { name: string; userId: string; avatar: string | null }) | null
  /** Mi resultado en este reto, o null si no jugué (o es mío). En un reto EN
   * JUEGO, que exista es la señal de que YA lo jugué (anti-spoiler: sin esto,
   * tocar la fila lleva a jugar, no al detalle). */
  myResult: PastChallengeResult | null
  /** Mi puesto (1-based) entre TODOS los que jugaron este reto cerrado, o null si
   * no jugué o el reto sigue EN JUEGO (issue #841): "El camino" anuncia "Tú: Nº"
   * además de los puntos — el nº de puesto en ESE reto concreto, no el general. */
  myRank: number | null
  /** Foto del reto ya firmada (issue #753, thumbnail de "Retos anteriores"), con
   * el mismo anti-spoiler que el resto de la app (`resolveMomentPhoto`): en un
   * reto CERRADO siempre visible; en uno EN JUEGO, solo si es pista o es mío.
   * Null si no tiene foto o si toca ocultarla (la fila cae al placeholder). */
  imageUrl: string | null
}

interface TripData {
  group: GroupInfo | null
  /** Momentos en orden cronológico ASCENDENTE (del primero del viaje al último). */
  moments: Moment[]
  /** Ruta: solo momentos cerrados con lat/lng visible, en orden cronológico ASC. */
  route: RoutePoint[]
  /** Clasificación general del grupo (suma de puntos por jugador), orden desc. */
  leaderboard: LeaderboardEntry[]
  /** Resultados del último reto cerrado (quién acertó, km), del más certero al menos. */
  recentResults: RecentResult[]
  /** Título del reto cuyos resultados se muestran en `recentResults`, o null. */
  recentTitle: string | null
  /** Ganador y nº de aciertos por reto cerrado (challengeId → resumen). Alimenta el recap. */
  winnersByChallenge: Map<string, ChallengeWinner>
  /** Retos CERRADOS para "Retos anteriores" del Marcador, del más reciente al más antiguo. */
  pastChallenges: PastChallengeSummary[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * Instante (ms) para ordenar momentos cronológicamente: `happened_on` (fecha
 * ELEGIDA por el dueño, migración 0037/issue #566) si existe; si no, `created_at`
 * (proxy de siempre para momentos legado sin fecha propia). Para ORDENAR da igual
 * local vs UTC (solo importa el orden relativo, nunca qué día se PINTA — eso lo
 * resuelve `parseMomentDate` al formatear, `lib/time.ts`).
 */
function momentSortValue(ch: Pick<ChallengeForPlay, 'happened_on' | 'created_at'>): number {
  return new Date(ch.happened_on ?? ch.created_at).getTime()
}

/**
 * Estado de un momento sin mirar lat/lng. Un RECUERDO (`is_challenge = false`) no
 * tiene juego ni plazo → `recuerdo`, antes de mirar nada más. Para los RETOS:
 * práctica > activo > cerrado.
 */
function statusOf(challenge: ChallengeForPlay, now: Date): MomentStatus {
  // Sin reto, o sin plazo (no debería pasar en un reto): es un recuerdo, sin juego.
  if (!challenge.is_challenge || challenge.deadline_at == null) return 'recuerdo'
  if (isPracticeChallenge(challenge.deadline_at)) return 'practice'
  return isLive({ deadline_at: challenge.deadline_at }, now) ? 'active' : 'closed'
}

/**
 * Última respuesta buena de `refresh` para UN viaje+usuario, y cuándo se
 * resolvió. Solo lo que sale directo de red (grupo, retos, votos, respuestas y
 * URLs firmadas): lo derivado (`moments`/`route`/`leaderboard`/…) son `useMemo`
 * puros sobre esto, así que no hace falta cachearlo aparte. `countryById` TAMPOCO
 * entra: se resuelve aparte, de forma escalonada y no bloqueante (no gobierna
 * `loading`, así que no forma parte del "esqueleto o no").
 */
interface TripDataSnapshot {
  group: GroupInfo | null
  challenges: ChallengeForPlay[]
  votes: VoteWithName[]
  answersById: Map<string, LatLng>
  imageUrlById: Record<string, string>
  audioUrlById: Record<string, string>
  videoUrlById: Record<string, string>
}

interface TripDataCacheEntry {
  snapshot: TripDataSnapshot
  resolvedAt: number
}

// Caché a nivel de módulo (issue "entrada al viaje sin flashazo", mismo patrón
// que `homeDataCache` en `features/home/useHomeData.ts`, issue #830): sin ella,
// CADA entrada a un viaje —incluida la vuelta desde Marcador/Bitácora, o desde
// la home tras haber estado ya dentro— arrancaba en loading=true y pintaba el
// esqueleto, aunque los datos fueran con toda seguridad los mismos de hace un
// instante. Con la caché, si ya hay una respuesta previa para ESTE viaje y ESTE
// usuario, el hook arranca YA con esos datos (loading=false, sin esqueleto) y
// revalida en segundo plano (stale-while-revalidate, el `refresh()` del efecto
// de montaje de más abajo); el esqueleto queda reservado a la primera carga fría.
//
// Clave POR USUARIO además de por viaje: un logout o un cambio de cuenta en el
// mismo navegador no debe servir de caché la respuesta de OTRA identidad para
// el mismo viaje (defensivo — hoy el fetch no filtra por `myUserId`, la RLS
// decide visibilidad por membresía, pero la clave por usuario es la misma
// invalidación "gratis" que ya usa `homeDataCache`: cambiar de usuario siempre
// da un cache-miss y una carga fría, nunca datos ajenos servidos por caché).
const tripDataCache = new Map<string, TripDataCacheEntry>()

function tripCacheKey(groupId: string, myUserId: string | null): string {
  return `${groupId}:${myUserId ?? 'anon'}`
}

/**
 * SOLO para tests: vacía la caché de módulo entre casos que reutilizan el mismo
 * groupId/usuario con mocks distintos (`useTripData.test.ts`, que no puede
 * inyectar un mock del propio módulo sin perder la implementación real). Nunca
 * se llama desde código de producción.
 */
export function __resetTripDataCacheForTests(): void {
  tripDataCache.clear()
}

/**
 * Orquesta los datos del viaje (grupo + momentos + ruta) reusando la misma capa
 * de datos que `GroupPage`: una sola carga conjunta y una derivación pura encima.
 *
 * Decisiones clave:
 *  - lat/lng SOLO de los CERRADOS (`getAnswers`): los activos no exponen su sitio
 *    real (anti-spoiler), así que su lat/lng queda null y el mapa los pinta
 *    flotando. La RLS de `challenge_answers` ya respalda esto en servidor.
 *  - Fotos del bucket privado: se firman en LOTE (Promise.all), no una por una.
 *  - `guessedCount` = nº de VOTANTES DISTINTOS por reto, derivado de los votos
 *    reales del grupo (no un número inventado).
 *  - `isOwn` = `created_by === myUserId` (el `userId` de la sesión actual, pasado
 *    por quien llama). Nunca se infiere en la UI: así la tarjeta de un reto propio
 *    no ofrece un "Adivina →" que aterriza en la guarda "Este reto es tuyo" (#578).
 *  - Realtime: nos resuscribimos a los votos del grupo (igual patrón que
 *    GroupPage) para que likes/contadores y nuevos momentos se refresquen solos.
 *  - Caché por viaje+usuario (ver `tripDataCache` arriba): la revisita a un viaje
 *    ya visto arranca con los datos de la última carga buena, sin esqueleto.
 */
export function useTripData(groupId: string, myUserId: string | null): TripData {
  const cacheKey = tripCacheKey(groupId, myUserId)
  const cached = tripDataCache.get(cacheKey)

  const [group, setGroup] = useState<GroupInfo | null>(() => cached?.snapshot.group ?? null)
  const [challenges, setChallenges] = useState<ChallengeForPlay[] | null>(
    () => cached?.snapshot.challenges ?? null,
  )
  const [votes, setVotes] = useState<VoteWithName[] | null>(() => cached?.snapshot.votes ?? null)
  // Respuestas (lat/lng) de los CERRADOS; los activos no entran aquí a propósito.
  const [answersById, setAnswersById] = useState<Map<string, LatLng>>(
    () => cached?.snapshot.answersById ?? new Map(),
  )
  // URL firmada de cada foto, indexada por challenge_id (bucket privado).
  const [imageUrlById, setImageUrlById] = useState<Record<string, string>>(
    () => cached?.snapshot.imageUrlById ?? {},
  )
  // URL firmada de cada nota de voz, indexada por challenge_id (mismo bucket
  // privado, prefijo `audio/`, #648). Mismo patrón que `imageUrlById`.
  const [audioUrlById, setAudioUrlById] = useState<Record<string, string>>(
    () => cached?.snapshot.audioUrlById ?? {},
  )
  // URL firmada de cada clip de vídeo corto, indexada por challenge_id (mismo
  // bucket privado, prefijo `video/`, issue #649). A diferencia de
  // `imageUrlById`/`audioUrlById` (que solo firman lo que YA viene en `c`,
  // porque `image_path`/`audio_path` sí están en `CHALLENGE_COLUMNS_NO_ANSWER`),
  // `video_path` NO viaja en `c` a propósito (ver el comentario de esa
  // constante en `lib/challenges.ts`): un MP4 puede llevar su propio GPS en los
  // metadatos del contenedor, así que nunca debe formar parte del mismo select
  // que alimenta JUGAR un reto. Por eso aquí hace falta una consulta APARTE,
  // solo sobre los RECUERDOS del lote (`is_challenge = false`) — un reto no
  // puede tener vídeo (`promoteToChallenge` lo vacía), así que ni se pregunta.
  const [videoUrlById, setVideoUrlById] = useState<Record<string, string>>(
    () => cached?.snapshot.videoUrlById ?? {},
  )
  // País por challenge_id, resuelto de forma escalonada y no bloqueante (abajo).
  // Solo se rellena para CERRADOS con coord; va apareciendo según se resuelve.
  // Fuera de la caché (ver comentario de `TripDataSnapshot`): se resuelve de
  // nuevo en cada montaje, barato porque `countryFromCoords` ya cachea por coord.
  const [countryById, setCountryById] = useState<Record<string, CountryInfo | null>>({})
  const [error, setError] = useState<string | null>(null)
  // Cuándo se resolvió la última carga (issue #638): alimenta `useVisibilityReload`.
  // Sembrado desde la caché si ya había una respuesta previa (si no, null —
  // "aún sin resolución", igual que antes de la caché).
  const lastResolvedAtRef = useRef<number | null>(cached?.resolvedAt ?? null)

  // Carga conjunta (grupo + retos + votos), reutilizable en el montaje y en cada
  // evento de Realtime. Tras tenerlos, resuelve respuestas e imágenes (asíncrono,
  // así que el setState nunca corre síncrono en el cuerpo de un efecto).
  const refresh = useCallback(async () => {
    try {
      const [g, c, v] = await Promise.all([
        getGroup(groupId),
        getGroupChallenges(groupId),
        getGroupVotes(groupId),
      ])
      setGroup(g)
      setChallenges(c)
      setVotes(v)
      setError(null)

      const now = new Date()
      const { past } = splitByStatus(c, now)
      // Respuestas solo de los cerrados (la RLS no sirve las de activos no jugados).
      const answers = await getAnswers(past.map((ch) => ch.id))
      setAnswersById(answers)

      // Firmar todas las fotos en lote (patrón GroupPage): una sola tanda.
      const withImage = c.filter((ch) => ch.image_path)
      const pairs = await Promise.all(
        withImage.map(
          async (ch) => [ch.id, await signedImageUrl(ch.image_path as string)] as const,
        ),
      )
      const imageUrlByIdNext = Object.fromEntries(
        pairs.filter((p): p is [string, string] => p[1] != null),
      )
      setImageUrlById(imageUrlByIdNext)

      // Firmar las notas de voz en lote, mismo patrón que las fotos (#648).
      const withAudio = c.filter((ch) => ch.audio_path)
      const audioPairs = await Promise.all(
        withAudio.map(
          async (ch) => [ch.id, await signedImageUrl(ch.audio_path as string)] as const,
        ),
      )
      const audioUrlByIdNext = Object.fromEntries(
        audioPairs.filter((p): p is [string, string] => p[1] != null),
      )
      setAudioUrlById(audioUrlByIdNext)

      // Vídeo (#649): consulta APARTE, solo sobre los ids de RECUERDO del lote
      // (nunca un reto — ver el comentario de `videoUrlById` de arriba). Patrón
      // dos-consultas, igual que `listGroupMomentImages`: `challenges` no se
      // puede filtrar por columna revocada/excluida en el mismo select que ya
      // trajo `c`, así que se pide de nuevo, mínima (dos columnas).
      const recuerdoIds = c.filter((ch) => !ch.is_challenge).map((ch) => ch.id)
      let videoUrlByIdNext: Record<string, string> = {}
      if (recuerdoIds.length > 0) {
        const { data: videoRows, error: videoError } = await supabase
          .from('challenges')
          .select('id, video_path')
          .in('id', recuerdoIds)
          .not('video_path', 'is', null)
        if (videoError) throw videoError
        const videoPairs = await Promise.all(
          (videoRows ?? []).map(
            async (row) => [row.id, await signedImageUrl(row.video_path as string)] as const,
          ),
        )
        videoUrlByIdNext = Object.fromEntries(
          videoPairs.filter((p): p is [string, string] => p[1] != null),
        )
      }
      setVideoUrlById(videoUrlByIdNext)

      // Última respuesta buena → caché del módulo (stale-while-revalidate, ver
      // `tripDataCache` arriba): la próxima vez que se monte este viaje para
      // este mismo usuario, arranca con esto en vez de con el esqueleto.
      const resolvedAt = Date.now()
      lastResolvedAtRef.current = resolvedAt
      tripDataCache.set(cacheKey, {
        snapshot: {
          group: g,
          challenges: c,
          votes: v,
          answersById: answers,
          imageUrlById: imageUrlByIdNext,
          audioUrlById: audioUrlByIdNext,
          videoUrlById: videoUrlByIdNext,
        },
        resolvedAt,
      })
    } catch {
      setError('No hemos podido cargar el viaje. Reintenta en un momento.')
    }
  }, [groupId, cacheKey])

  // Re-firma defensiva (issue #638): mismo margen que la home — si la pestaña
  // vuelve tras estar de fondo con el dato viejo, las fotos del viaje (héroes,
  // galería) pueden tener la URL firmada caducada; refrescamos por delante.
  useVisibilityReload(
    () => lastResolvedAtRef.current,
    () => void refresh(),
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh es async: el setState corre tras el fetch, no síncrono
    void refresh()
    // Realtime opcional: refrescamos al entrar/cambiar cualquier voto del grupo
    // (contadores de "adivinaron") sin romper si el canal falla.
    const channel = supabase
      .channel(`trip-${groupId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'votes', filter: `group_id=eq.${groupId}` },
        () => {
          void refresh()
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [groupId, refresh])

  // Coordenadas candidatas a bandera: momentos con un lugar VISIBLE en el mapa.
  //  - RECUERDO: su lugar (`place_lat`/`place_lng`), siempre visible.
  //  - RETO CERRADO: su respuesta (`answersById`), ya revelada.
  // Los retos ACTIVOS no entran (su coord es spoiler). Derivado de challenges+answers,
  // NO de `moments`, para no crear un bucle con el estado de país que aquí se rellena.
  const flagTargets = useMemo<{ challengeId: string; lat: number; lng: number }[]>(() => {
    if (!challenges) return []
    const now = new Date()
    const out: { challengeId: string; lat: number; lng: number }[] = []
    for (const ch of challenges) {
      const status = statusOf(ch, now)
      if (status === 'recuerdo') {
        if (ch.place_lat != null && ch.place_lng != null) {
          out.push({ challengeId: ch.id, lat: ch.place_lat, lng: ch.place_lng })
        }
        continue
      }
      if (status !== 'closed') continue
      const answer = answersById.get(ch.id)
      if (answer) out.push({ challengeId: ch.id, lat: answer.lat, lng: answer.lng })
    }
    return out
  }, [challenges, answersById])

  // Resolución ESCALONADA y NO bloqueante de los países. El render inicial (y el
  // mapa) no esperan: la bandera aparece por momento según se resuelve. La util ya
  // cachea por coord redondeada, así que solo espaciamos las peticiones REALES a
  // Nominatim; las cacheadas resuelven al instante sin gastar el presupuesto de 1 req/s.
  useEffect(() => {
    if (flagTargets.length === 0) return
    // `cancelled` corta el bucle si cambia el groupId/targets o se desmonta: así
    // nunca hacemos setState tras unmount ni mezclamos datos de otro viaje.
    let cancelled = false

    const run = async () => {
      for (const { challengeId, lat, lng } of flagTargets) {
        if (cancelled) return
        const info = await countryFromCoords(lat, lng)
        if (cancelled) return
        setCountryById((prev) => ({ ...prev, [challengeId]: info }))
        // Espaciamos antes de la siguiente; barato si la próxima está cacheada
        // (resolverá al instante), pero protege la primera carga de un viaje nuevo.
        await new Promise((resolve) => setTimeout(resolve, COUNTRY_STAGGER_MS))
      }
    }
    void run()

    return () => {
      cancelled = true
    }
  }, [flagTargets])

  // Nº de votantes distintos por reto: el contador REAL de "quién ha adivinado".
  const guessedCountById = useMemo(() => {
    const byChallenge = new Map<string, Set<string>>()
    for (const v of votes ?? []) {
      const users = byChallenge.get(v.challenge_id)
      if (users) users.add(v.user_id)
      else byChallenge.set(v.challenge_id, new Set([v.user_id]))
    }
    return byChallenge
  }, [votes])

  // Momentos en orden cronológico ASC: ordenamos por `happened_on` (con fallback
  // `created_at` para momentos legado, `momentSortValue`) en vez de solo invertir
  // el DESC de `getGroupChallenges` (issue #566) — un recuerdo backfilleado días
  // después del viaje puede tener `happened_on` muy anterior a su `created_at`
  // (cuándo se subió), así que el orden de subida ya no basta. Empate en el MISMO
  // día elegido (frecuente: `happened_on` solo tiene granularidad de día) se
  // rompe por `created_at` real, para conservar el orden de entrada dentro del día.
  const moments = useMemo<Moment[]>(() => {
    if (!challenges) return []
    const now = new Date()
    const sorted = [...challenges].sort((a, b) => {
      const primary = momentSortValue(a) - momentSortValue(b)
      if (primary !== 0) return primary
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })
    return sorted.map((ch) => {
      const status = statusOf(ch, now)
      const answer = answersById.get(ch.id)
      // Coordenada a pintar: el lugar VISIBLE del recuerdo (place_*) si es recuerdo;
      // si es reto, su respuesta solo cuando ya es visible (cerrado/ya jugado).
      const coord =
        status === 'recuerdo'
          ? { lat: ch.place_lat, lng: ch.place_lng }
          : { lat: answer?.lat ?? null, lng: answer?.lng ?? null }
      return {
        challengeId: ch.id,
        title: ch.title,
        description: ch.description,
        status,
        isChallenge: ch.is_challenge,
        // Fecha ELEGIDA (`happened_on`, #566) si existe; si no, `created_at` como
        // proxy (momento legado). Mismo criterio que ordena arriba.
        date: ch.happened_on ?? ch.created_at,
        deadlineAt: ch.deadline_at,
        imageUrl: imageUrlById[ch.id] ?? null,
        imagePath: ch.image_path,
        audioUrl: audioUrlById[ch.id] ?? null,
        audioPath: ch.audio_path,
        // Solo se rellena para recuerdos (`videoUrlById` solo consulta esos ids,
        // ver arriba); en un reto siempre queda null, nunca se sirve el vídeo.
        videoUrl: videoUrlById[ch.id] ?? null,
        lat: coord.lat,
        lng: coord.lng,
        guessedCount: guessedCountById.get(ch.id)?.size ?? 0,
        // Sin sesión (myUserId null) nunca es "propio": no hay guardas de dueño que
        // esquivar para un visitante anónimo sin cuenta.
        isOwn: myUserId != null && ch.created_by === myUserId,
        guessSeconds: ch.guess_seconds,
        svPanoId: ch.sv_pano_id,
        // `undefined` mientras no se ha resuelto: la UI no pinta bandera todavía.
        country: countryById[ch.id],
        // Espejo de `photo_is_hint`: la pestaña Fotos (#645) lo usa para no
        // enseñar la foto-sorpresa de un reto aún en juego.
        photoIsHint: ch.photo_is_hint,
      }
    })
  }, [
    challenges,
    answersById,
    imageUrlById,
    audioUrlById,
    videoUrlById,
    guessedCountById,
    countryById,
    myUserId,
  ])

  // Ids de reto FUSIONADOS en su recuerdo (issue #839: Bitácora/Diario ya no
  // los pintan como entrada propia, ver `fuseMemoryWithChallenge`): su pin en
  // el mapa tampoco debe repetirse si el recuerdo YA tiene uno visible propio
  // (serían dos pines pegados del mismo par, uno con el lugar del recuerdo y
  // otro con la respuesta del reto). Si el recuerdo NO tiene lugar visible,
  // dejamos el pin del reto tal cual — mejor un pin que ninguno.
  const mergedAwayChallengeIds = useMemo(() => {
    const paired = pairedChallengeByMemoryId(moments)
    const out = new Set<string>()
    for (const [memoryId, challenge] of paired) {
      const memory = moments.find((m) => m.challengeId === memoryId)
      if (memory && memory.lat != null && memory.lng != null) out.add(challenge.challengeId)
    }
    return out
  }, [moments])

  // Ruta: los momentos con un lugar VISIBLE en el mapa, en orden cronológico ASC.
  // Entran los RECUERDOS con lugar (place_*) y los RETOS CERRADOS con respuesta
  // revelada; los retos ACTIVOS no (su coord es spoiler → llevan lat/lng null).
  const route = useMemo<RoutePoint[]>(
    () =>
      moments
        .filter(
          (m): m is Moment & { lat: number; lng: number } =>
            (m.status === 'closed' || m.status === 'recuerdo') &&
            m.lat != null &&
            m.lng != null &&
            !mergedAwayChallengeIds.has(m.challengeId),
        )
        .map((m) => ({
          challengeId: m.challengeId,
          lat: m.lat,
          lng: m.lng,
          title: m.title,
          imageUrl: m.imageUrl,
          date: m.date,
        })),
    [moments, mergedAwayChallengeIds],
  )

  // Clasificación general del grupo: misma agregación que GroupPage (suma de
  // puntos por jugador). El hub de Retos la muestra como marcador protagonista.
  const leaderboard = useMemo(() => (votes ? aggregateLeaderboard(votes) : []), [votes])

  // Resultados del ÚLTIMO reto cerrado: los momentos vienen en orden ASC, así que
  // el último cerrado es el reto recién resuelto. Tomamos sus votos, ordenados del
  // más certero (menos km) al menos; los de timeout (sin km) caen al final.
  const lastClosed = useMemo(() => {
    const closed = moments.filter((m) => m.status === 'closed')
    return closed.length > 0 ? closed[closed.length - 1] : null
  }, [moments])

  const recentResults = useMemo<RecentResult[]>(() => {
    if (!lastClosed || !votes) return []
    return votes
      .filter((v) => v.challenge_id === lastClosed.challengeId)
      .map((v) => ({
        userId: v.user_id,
        name: v.display_name,
        avatar: v.avatar,
        distanceKm: v.distance_km,
        points: v.points,
      }))
      .sort((a, b) => {
        // Sin distancia (timeout) al final; entre válidos, menos km = más certero.
        if (a.distanceKm == null) return b.distanceKm == null ? 0 : 1
        if (b.distanceKm == null) return -1
        return a.distanceKm - b.distanceKm
      })
  }, [lastClosed, votes])

  const recentTitle = lastClosed?.title ?? null

  // "Retos anteriores" del Marcador (issue #608, ampliado en el #800 a los retos
  // EN JUEGO): nombre, ganador (solo si ya cerró — más puntos, empate roto por
  // nombre asc, mismo criterio estable que `winnersByChallenge`/`aggregateLeaderboard`)
  // y mi resultado breve. Orden: primero los EN JUEGO (el que cierra antes,
  // primero — más urgente), luego los CERRADOS del más reciente al más antiguo
  // (moments viene ASC, invertimos ese tramo). Los de PRÁCTICA no entran: son un
  // reto permanente de prueba, no parte del recorrido del viaje.
  const pastChallenges = useMemo<PastChallengeSummary[]>(() => {
    const active = moments
      .filter((m) => m.status === 'active' && m.isChallenge)
      .sort((a, b) => new Date(a.deadlineAt ?? 0).getTime() - new Date(b.deadlineAt ?? 0).getTime())
    const closed = [...moments.filter((m) => m.status === 'closed')].reverse()

    return [...active, ...closed].map((m) => {
      const status: 'active' | 'closed' = m.status === 'active' ? 'active' : 'closed'
      const challengeVotes = (votes ?? []).filter((v) => v.challenge_id === m.challengeId)
      // El "ganador" solo tiene sentido con el reto ya decidido: EN JUEGO el
      // resultado no es definitivo (issue #800 — la fila no debe insinuar un
      // veredicto que aún puede cambiar). Mismo criterio de desempate estable
      // (más puntos; a igualdad, nombre asc) que `winnersByChallenge`/
      // `aggregateLeaderboard`, pero aquí ordenamos TODOS los votos (no solo el
      // primero) para poder derivar también `myRank` (issue #841) sin una
      // segunda pasada.
      let winner:
        | (PastChallengeResult & { name: string; userId: string; avatar: string | null })
        | null = null
      let myRank: number | null = null
      if (status === 'closed') {
        const ranked = [...challengeVotes].sort(
          (a, b) => b.points - a.points || a.display_name.localeCompare(b.display_name),
        )
        const top = ranked[0]
        winner = top
          ? {
              name: top.display_name,
              userId: top.user_id,
              avatar: top.avatar,
              points: top.points,
              distanceKm: top.distance_km,
              leftApp: top.left_app,
            }
          : null
        if (myUserId) {
          const idx = ranked.findIndex((v) => v.user_id === myUserId)
          myRank = idx >= 0 ? idx + 1 : null
        }
      }
      const mine = myUserId ? challengeVotes.find((v) => v.user_id === myUserId) : undefined
      const myResult: PastChallengeResult | null = mine
        ? { points: mine.points, distanceKm: mine.distance_km, leftApp: mine.left_app }
        : null
      return {
        challengeId: m.challengeId,
        title: m.title,
        status,
        closedAt: m.deadlineAt ?? m.date,
        isOwn: m.isOwn,
        winner,
        myResult,
        myRank,
        // Mismo anti-spoiler que cualquier otra superficie (Bitácora, Diario): un
        // reto EN JUEGO con foto SORPRESA no la enseña aquí tampoco, ni siquiera
        // si ya lo jugué — es la MISMA regla que gobierna el resto de la app, no
        // una nueva (issue #800, "no reinventar el anti-spoiler").
        imageUrl: resolveMomentPhoto(m).src,
      }
    })
  }, [moments, votes, myUserId])

  // Ganador (más puntos) y nº de aciertos por reto, derivado de los votos reales.
  // Lo consume el TIMELINE-RESUMEN del recap de cierre: a cada reto le pega su
  // resultado final sin recalcular. Un empate a puntos lo rompe el nombre (asc),
  // igual criterio estable que la clasificación general.
  const winnersByChallenge = useMemo<Map<string, ChallengeWinner>>(() => {
    const byChallenge = new Map<string, { name: string; points: number; voters: Set<string> }>()
    for (const v of votes ?? []) {
      const current = byChallenge.get(v.challenge_id)
      if (!current) {
        byChallenge.set(v.challenge_id, {
          name: v.display_name,
          points: v.points,
          voters: new Set([v.user_id]),
        })
        continue
      }
      current.voters.add(v.user_id)
      if (
        v.points > current.points ||
        (v.points === current.points && v.display_name.localeCompare(current.name) < 0)
      ) {
        current.name = v.display_name
        current.points = v.points
      }
    }
    const out = new Map<string, ChallengeWinner>()
    for (const [id, agg] of byChallenge) {
      out.set(id, { name: agg.name, points: agg.points, guessedCount: agg.voters.size })
    }
    return out
  }, [votes])

  // Cargando hasta tener la primera respuesta del grupo (challenges resuelto).
  const loading = challenges === null && error === null

  return {
    group,
    moments,
    route,
    leaderboard,
    recentResults,
    recentTitle,
    winnersByChallenge,
    pastChallenges,
    loading,
    error,
    refresh,
  }
}
