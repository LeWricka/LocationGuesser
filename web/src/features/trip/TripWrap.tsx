import { useEffect, type CSSProperties } from 'react'
import { Camera, Flag, Footprints, ImageOff, Target, Users, X } from 'lucide-react'
import { Avatar, Icon } from '../../ui'
import type { LeaderboardEntry } from '../../lib/leaderboard'
import type { GroupPrizes } from '../../lib/database.types'
import type { Moment, RoutePoint } from '../../lib/trip'
import { Podium, type PodiumClasses } from '../group/Podium'
import { TripMap } from './TripMap'
import type { ChallengeWinner } from './useTripData'
import styles from './TripWrap.module.css'

interface Props {
  /** Nombre del viaje (cabecera del recap). Si falta, cae al código. */
  tripName: string
  /** Todos los momentos en orden cronológico ASC (recuerdos + retos). */
  moments: Moment[]
  /** Ruta completa (momentos con lugar visible) para el mapa del recap. */
  route: RoutePoint[]
  /** Clasificación general del viaje (orden desc). Top-3 → podio; resto → lista. */
  leaderboard: LeaderboardEntry[]
  /** Premios por posición del viaje (o null). Los muestra el podio. */
  prizes: GroupPrizes | null
  /** Ganador + nº de aciertos por reto cerrado (challengeId → resumen). */
  winnersByChallenge: Map<string, ChallengeWinner>
  /** Cierra el recap y vuelve al viaje. */
  onClose: () => void
}

// Clases del podio en escala de recap (reusa el markup compartido `Podium`,
// orden 2-1-3). Inyectamos solo la escala; el visual se comparte con el hub.
const podiumClasses: PodiumClasses = {
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
}

const dayMonthFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' })
const longFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })

function shortDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return dayMonthFmt.format(date).replace('.', '')
}

function longDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return longFmt.format(date)
}

/**
 * Rango de fechas del viaje a partir del primer y último momento (orden ASC).
 * "Del 8 de abril al 14 de abril de 2025"; un solo día → solo esa fecha. Vacío si
 * no hay momentos datables. Pura.
 */
function dateRange(moments: Moment[]): string {
  if (moments.length === 0) return ''
  const first = longDate(moments[0].date)
  const last = longDate(moments[moments.length - 1].date)
  if (!first) return ''
  if (!last || first === last) return first
  return `Del ${first} al ${last}`
}

/**
 * RECAP / "wrap" de cierre del viaje (a pantalla completa). Es el momento
 * celebrativo de fin: cabecera con el nombre y las fechas, el mapa con TODA la
 * ruta, las stats del viaje, el podio de la clasificación y un timeline-resumen
 * con TODOS los momentos (los retos llevan su resultado final). Sobrio estilo
 * Atelier (acento Pizarra, oro solo en el podio). Presentacional: recibe los
 * datos ya derivados de `useTripData`. Se cierra con la X (vuelve al viaje).
 */
export function TripWrap({
  tripName,
  moments,
  route,
  leaderboard,
  prizes,
  winnersByChallenge,
  onClose,
}: Props) {
  // Escape cierra el recap (mismo gesto que la X), patrón de las hojas/modales.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const memoriesCount = moments.filter((m) => !m.isChallenge).length
  const challengesCount = moments.filter((m) => m.isChallenge).length
  const playersCount = leaderboard.length

  const hasPodium = leaderboard.length >= 3
  const podium = hasPodium ? leaderboard.slice(0, 3) : []
  const top = leaderboard[0]?.points ?? 0
  const range = dateRange(moments)

  const stats: { icon: typeof Camera; value: number; label: string }[] = [
    { icon: Camera, value: memoriesCount, label: memoriesCount === 1 ? 'recuerdo' : 'recuerdos' },
    { icon: Target, value: challengesCount, label: challengesCount === 1 ? 'reto' : 'retos' },
    { icon: Users, value: playersCount, label: playersCount === 1 ? 'jugador' : 'jugadores' },
  ]

  return (
    <div className={styles.screen} role="dialog" aria-modal="true" aria-label="Resumen del viaje">
      <button type="button" className={styles.close} onClick={onClose} aria-label="Cerrar resumen">
        <Icon icon={X} size={20} />
      </button>

      <div className={`${styles.scroll} lg-stagger`}>
        {/* Cabecera celebrativa: cinta de cierre + nombre + fechas. */}
        <header className={styles.head}>
          <span className={styles.flag} aria-hidden="true">
            <Icon icon={Flag} size={36} />
          </span>
          <span className={styles.kicker}>Viaje cerrado</span>
          <h1 className={styles.title}>{tripName}</h1>
          {range && <p className={styles.range}>{range}</p>}
        </header>

        {/* Mapa con TODA la ruta del viaje (sin reto activo: no hay spoiler). */}
        {route.length > 0 && (
          <section className={styles.mapWrap} aria-label="Mapa del viaje">
            <TripMap
              route={route}
              activeMoment={null}
              selectedChallengeId={null}
              onSelectMoment={() => {}}
            />
          </section>
        )}

        {/* Stats del viaje (recuerdos, retos, jugadores). */}
        <section className={styles.stats} aria-label="Resumen en cifras">
          {stats.map((s) => (
            <div key={s.label} className={styles.stat}>
              <span className={styles.statIcon} aria-hidden="true">
                <Icon icon={s.icon} size={18} />
              </span>
              <span className={styles.statValue}>{s.value.toLocaleString('es-ES')}</span>
              <span className={styles.statLabel}>{s.label}</span>
            </div>
          ))}
        </section>

        {/* Podio de la clasificación (top-3); con menos de 3, lista a secas. */}
        {leaderboard.length > 0 && (
          <section className={styles.standings} aria-label="Clasificación final">
            <header className={styles.blockHead}>
              <span className={styles.blockKicker}>La liga del viaje</span>
              <h2 className={styles.blockTitle}>Clasificación final</h2>
            </header>
            {hasPodium ? (
              <Podium
                top3={podium}
                prizes={prizes}
                totalEntries={leaderboard.length}
                classes={podiumClasses}
              />
            ) : (
              <ol className={styles.board}>
                {leaderboard.map((entry, i) => {
                  const width = top > 0 ? Math.max(8, Math.round((entry.points / top) * 100)) : 0
                  return (
                    <li
                      key={entry.userId}
                      className={styles.row}
                      style={{ '--i': i } as CSSProperties}
                    >
                      <span className={styles.rank}>{i + 1}</span>
                      <div className={styles.player}>
                        <Avatar
                          userId={entry.userId}
                          avatarUrl={entry.avatar}
                          name={entry.name}
                          size="sm"
                        />
                        <span className={styles.playerName}>{entry.name}</span>
                      </div>
                      <div className={styles.rowRight}>
                        <span className={styles.bar} aria-hidden="true">
                          <i style={{ width: `${width}%` }} />
                        </span>
                        <span className={styles.rowPoints}>
                          {entry.points.toLocaleString('es-ES')}
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>
        )}

        {/* Timeline-RESUMEN: TODOS los momentos en orden, con el resultado del reto. */}
        {moments.length > 0 && (
          <section className={styles.timeline} aria-label="Resumen del recorrido">
            <header className={styles.blockHead}>
              <span className={styles.blockKicker}>El recorrido</span>
              <h2 className={styles.blockTitle}>Todos los momentos</h2>
            </header>
            <ol className={styles.tlList}>
              {moments.map((m) => {
                const winner = m.isChallenge ? winnersByChallenge.get(m.challengeId) : undefined
                return (
                  <li key={m.challengeId} className={styles.tlItem}>
                    <span className={styles.tlThumb} aria-hidden="true">
                      {m.imageUrl ? (
                        <img src={m.imageUrl} alt="" loading="lazy" />
                      ) : (
                        <span className={styles.tlThumbFallback}>
                          <Icon icon={ImageOff} size={22} />
                        </span>
                      )}
                    </span>
                    <div className={styles.tlBody}>
                      <span className={styles.tlDate}>{shortDate(m.date)}</span>
                      <span className={styles.tlTitle}>{m.title}</span>
                      {m.isChallenge && (
                        <span className={styles.tlResult}>
                          {winner && winner.name ? (
                            <>
                              <Icon icon={Target} size={14} /> Ganó <b>{winner.name}</b>
                              {winner.guessedCount > 0 &&
                                ` · ${winner.guessedCount} ${
                                  winner.guessedCount === 1 ? 'acierto' : 'aciertos'
                                }`}
                            </>
                          ) : (
                            <>
                              <Icon icon={Target} size={14} /> Reto sin jugadas
                            </>
                          )}
                        </span>
                      )}
                    </div>
                    {m.isChallenge && (
                      <span className={styles.tlBadge} aria-hidden="true">
                        <Icon icon={Target} size={13} />
                      </span>
                    )}
                  </li>
                )
              })}
            </ol>
          </section>
        )}

        <footer className={styles.foot}>
          <span className={styles.footIcon} aria-hidden="true">
            <Icon icon={Footprints} size={16} />
          </span>
          <p className={styles.footText}>Hasta el próximo viaje.</p>
          <button type="button" className={styles.footClose} onClick={onClose}>
            Volver al viaje
          </button>
        </footer>
      </div>
    </div>
  )
}
