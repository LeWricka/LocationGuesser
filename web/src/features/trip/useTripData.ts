import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GroupInfo } from '../../lib/groupData'
import { getGroup, getGroupChallenges, isLive, splitByStatus } from '../../lib/groupData'
import { getAnswers, isPracticeChallenge, type ChallengeForPlay } from '../../lib/challenges'
import { getGroupVotes, type VoteWithName } from '../../lib/leaderboard'
import { signedImageUrl } from '../../lib/storage'
import { supabase } from '../../lib/supabase'
import { countryFromCoords, type CountryInfo } from '../../lib/countryFlag'
import type { LatLng } from '../../lib/geo'
import type { Moment, MomentStatus, RoutePoint } from '../../lib/trip'

// Espera entre peticiones a coords NO cacheadas. Nominatim limita a ~1 req/s;
// dejamos margen (1.1 s) para no rozar el límite ni en ráfaga.
const COUNTRY_STAGGER_MS = 1100

interface TripData {
  group: GroupInfo | null
  /** Momentos en orden cronológico ASCENDENTE (del primero del viaje al último). */
  moments: Moment[]
  /** Ruta: solo momentos cerrados con lat/lng visible, en orden cronológico ASC. */
  route: RoutePoint[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/** Estado de un momento sin mirar lat/lng: práctica > activo > cerrado. */
function statusOf(challenge: ChallengeForPlay, now: Date): MomentStatus {
  if (isPracticeChallenge(challenge.deadline_at)) return 'practice'
  return isLive(challenge, now) ? 'active' : 'closed'
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
 *  - Realtime: nos resuscribimos a los votos del grupo (igual patrón que
 *    GroupPage) para que likes/contadores y nuevos momentos se refresquen solos.
 */
export function useTripData(groupId: string): TripData {
  const [group, setGroup] = useState<GroupInfo | null>(null)
  const [challenges, setChallenges] = useState<ChallengeForPlay[] | null>(null)
  const [votes, setVotes] = useState<VoteWithName[] | null>(null)
  // Respuestas (lat/lng) de los CERRADOS; los activos no entran aquí a propósito.
  const [answersById, setAnswersById] = useState<Map<string, LatLng>>(new Map())
  // URL firmada de cada foto, indexada por challenge_id (bucket privado).
  const [imageUrlById, setImageUrlById] = useState<Record<string, string>>({})
  // País por challenge_id, resuelto de forma escalonada y no bloqueante (abajo).
  // Solo se rellena para CERRADOS con coord; va apareciendo según se resuelve.
  const [countryById, setCountryById] = useState<Record<string, CountryInfo | null>>({})
  const [error, setError] = useState<string | null>(null)

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
      setImageUrlById(Object.fromEntries(pairs.filter((p): p is [string, string] => p[1] != null)))
    } catch {
      setError('No hemos podido cargar el viaje. Reintenta en un momento.')
    }
  }, [groupId])

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

  // Coordenadas candidatas a bandera: SOLO momentos CERRADOS con respuesta visible
  // (los activos no tienen coord = anti-spoiler). Derivado de challenges+answers, NO
  // de `moments`, para no crear un bucle con el estado de país que aquí se rellena.
  const flagTargets = useMemo<{ challengeId: string; lat: number; lng: number }[]>(() => {
    if (!challenges) return []
    const now = new Date()
    const out: { challengeId: string; lat: number; lng: number }[] = []
    for (const ch of challenges) {
      if (statusOf(ch, now) !== 'closed') continue
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

  // Momentos en orden cronológico ASC (getGroupChallenges viene DESC → invertir).
  const moments = useMemo<Moment[]>(() => {
    if (!challenges) return []
    const now = new Date()
    return [...challenges].reverse().map((ch) => {
      const answer = answersById.get(ch.id)
      return {
        challengeId: ch.id,
        title: ch.title,
        status: statusOf(ch, now),
        date: ch.created_at,
        imageUrl: imageUrlById[ch.id] ?? null,
        imagePath: ch.image_path,
        // Solo los cerrados con respuesta visible llevan coordenada (anti-spoiler).
        lat: answer?.lat ?? null,
        lng: answer?.lng ?? null,
        guessedCount: guessedCountById.get(ch.id)?.size ?? 0,
        guessSeconds: ch.guess_seconds,
        svPanoId: ch.sv_pano_id,
        // `undefined` mientras no se ha resuelto: la UI no pinta bandera todavía.
        country: countryById[ch.id],
      }
    })
  }, [challenges, answersById, imageUrlById, guessedCountById, countryById])

  // Ruta: los momentos cerrados con lat/lng, en el mismo orden cronológico ASC.
  const route = useMemo<RoutePoint[]>(
    () =>
      moments
        .filter(
          (m): m is Moment & { lat: number; lng: number } =>
            m.status === 'closed' && m.lat != null && m.lng != null,
        )
        .map((m) => ({
          challengeId: m.challengeId,
          lat: m.lat,
          lng: m.lng,
          title: m.title,
          imageUrl: m.imageUrl,
          date: m.date,
        })),
    [moments],
  )

  // Cargando hasta tener la primera respuesta del grupo (challenges resuelto).
  const loading = challenges === null && error === null

  return { group, moments, route, loading, error, refresh }
}
