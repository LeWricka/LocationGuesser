import type { CSSProperties } from 'react'
import { ChevronRight } from 'lucide-react'
import { Avatar, ChallengePhoto, Icon, useReducedMotion } from '../../ui'
import type { LeaderboardEntry } from '../../lib/leaderboard'
import type { Moment } from '../../lib/trip'
import { Podium, type PodiumClasses } from '../group/Podium'
import { Countdown } from './Countdown'
import {
  CompassIcon,
  FlagIcon,
  LiveDotIcon,
  MedalIcon,
  PinTargetIcon,
  PlayBadgeIcon,
  TrophyIcon,
} from './RetosIcons'
import type { RecentResult } from './useTripData'
import styles from './TripRetos.module.css'

interface Props {
  /** Reto EN JUEGO (si lo hay): foto + "Adivina dónde es" + cuenta atrás + Jugar. */
  activeMoment: Moment | null
  /** Cuántos jugadores distintos han votado YA el reto en juego (para el pie social). */
  activeGuessedCount: number
  /** Resultados del último reto cerrado (quién acertó, km), del más certero al menos. */
  recentResults: RecentResult[]
  /** Título del reto cuyos resultados se muestran, o null. */
  recentTitle: string | null
  /** Clasificación general del grupo (suma de puntos), orden desc. */
  leaderboard: LeaderboardEntry[]
  /** Id del usuario actual: resalta su fila en el marcador. */
  meId?: string
  /** Nº total de retos jugados (cerrados) — para el pie de "Todos los retos". */
  playedCount: number
  /** Nº de retos en juego — para el pie de "Todos los retos". */
  liveCount: number
  /** Lanza el flujo de adivinar EXISTENTE para el reto en juego. */
  onPlay: (challengeId: string) => void
  /** Abre la GroupPage clásica (clasificación completa / todos los retos). */
  onOpenClassic: () => void
}

// Clases del podio en escala de PANTALLA (no la del poster 1080px). Reusamos el
// markup compartido `Podium` (orden 2-1-3, disco con avatar, pedestales) y solo
// inyectamos la escala con este módulo CSS.
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

// Distancia legible: "0,3 km" o "340 m" para las muy cortas. Pura.
function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toLocaleString('es-ES', { maximumFractionDigits: 1 })} km`
}

/**
 * HUB de juego del viaje (la sección Retos, protagonista del nuevo enfoque). De
 * arriba a abajo, con jerarquía editorial (eyebrow → héroe → bloques con regla):
 *   (a) EN JUEGO — héroe de la sección: foto grande con ken-burns, "Adivina dónde
 *       es", cuenta atrás viva y botón Jugar → enruta al flujo de adivinar.
 *   (b) RESULTADOS RECIENTES — quién acertó y a cuántos km en el último cerrado.
 *   (c) CLASIFICACIÓN — marcador del grupo con PODIO (reusa `Podium`) + lista.
 *   (d) TODOS LOS RETOS + pie de marcador/ajustes clásicos.
 *
 * Datos reales (live/past/votos) vía `useTripData`. Iconografía propia (SVG inline
 * en `RetosIcons`, no emojis sueltos). Respeta reduced-motion vía utilidades de
 * `index.css` (ken-burns, reveals, pulso del punto en juego).
 */
export function TripRetos({
  activeMoment,
  activeGuessedCount,
  recentResults,
  recentTitle,
  leaderboard,
  meId,
  playedCount,
  liveCount,
  onPlay,
  onOpenClassic,
}: Props) {
  const reducedMotion = useReducedMotion()
  const hasPodium = leaderboard.length >= 3
  const podium = hasPodium ? leaderboard.slice(0, 3) : []
  const listEntries = hasPodium ? leaderboard.slice(3) : leaderboard
  const listStart = hasPodium ? 3 : 0
  const top = leaderboard[0]?.points ?? 0
  const leader = leaderboard[0] ?? null

  return (
    <div className={`${styles.hub} lg-stagger`}>
      {/* (a) EN JUEGO — héroe de la sección ------------------------------- */}
      <header className={styles.eyebrow}>
        <span className={styles.eyebrowLabel}>El juego del viaje</span>
        <h2 className={styles.eyebrowTitle}>Retos</h2>
      </header>

      {activeMoment ? (
        <section className={styles.nowPlaying}>
          <div className={styles.npPhoto}>
            <ChallengePhoto
              src={activeMoment.imageUrl}
              alt={activeMoment.title}
              ratio="wide"
              size="lg"
              zoomable={false}
              className={reducedMotion ? styles.npImg : `${styles.npImg} lg-ken-burns`}
            />
            <div className={styles.npGrad} aria-hidden="true" />
            <span className={styles.npTag}>
              <LiveDotIcon
                size={13}
                className={reducedMotion ? styles.liveDot : `${styles.liveDot} ${styles.livePulse}`}
              />
              En juego
            </span>
            <div className={styles.npFoot}>
              <p className={styles.npKicker}>
                <PinTargetIcon size={13} className={styles.npKickerIcon} />
                Adivina dónde es
              </p>
              <p className={styles.npPrompt}>{activeMoment.title || '¿Dónde estoy?'}</p>
              <div className={styles.npBottom}>
                <Countdown deadlineAt={activeMoment.deadlineAt} />
                <button
                  type="button"
                  className={styles.ctaPlay}
                  onClick={() => onPlay(activeMoment.challengeId)}
                >
                  <PlayBadgeIcon size={14} />
                  Jugar
                </button>
              </div>
            </div>
          </div>
          {activeGuessedCount > 0 && (
            <p className={styles.npSocial}>
              <span className={styles.npSocialDot} aria-hidden="true" />
              <b>{activeGuessedCount}</b>{' '}
              {activeGuessedCount === 1 ? 'ya ha jugado' : 'ya han jugado'}
            </p>
          )}
        </section>
      ) : (
        <section className={styles.npEmpty}>
          <span className={styles.npEmptyArt} aria-hidden="true">
            <CompassIcon size={52} />
          </span>
          <p className={styles.npEmptyTitle}>Sin reto vivo</p>
          <p className={styles.npEmptyText}>
            Cuando alguien comparta un momento, aparecerá aquí para que lo adivinéis.
          </p>
        </section>
      )}

      {/* (b) RESULTADOS RECIENTES ---------------------------------------- */}
      {recentResults.length > 0 && (
        <section>
          <header className={styles.blockHead}>
            <span className={styles.blockEyebrow}>
              <FlagIcon size={14} className={styles.blockEyebrowIcon} />
              Resultados recientes
            </span>
            {recentTitle && <span className={styles.blockMeta}>{recentTitle}</span>}
          </header>
          <ul className={styles.results}>
            {recentResults.slice(0, 4).map((r, i) => {
              const isWin = i === 0 && r.distanceKm != null
              return (
                <li key={r.userId} className={`${styles.result} ${isWin ? styles.resultWin : ''}`}>
                  <span className={styles.resultRank} aria-hidden="true">
                    {isWin ? (
                      <MedalIcon rank={1} size={22} className={styles.resultMedal} />
                    ) : (
                      <span className={styles.resultPos}>{i + 1}</span>
                    )}
                  </span>
                  <Avatar userId={r.userId} avatarUrl={r.avatar} name={r.name} size="sm" />
                  <div className={styles.resultInfo}>
                    <span className={styles.resultName}>{r.name}</span>
                    <span className={styles.resultSub}>
                      {r.distanceKm == null ? 'No marcó a tiempo' : `${r.points} pts`}
                    </span>
                  </div>
                  <span className={styles.resultKm}>
                    <span className={styles.resultKmValue}>
                      {r.distanceKm == null ? '—' : formatKm(r.distanceKm)}
                    </span>
                    <span className={styles.resultKmTag}>de distancia</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* (c) CLASIFICACIÓN protagonista ---------------------------------- */}
      <section className={styles.standings}>
        <header className={styles.standingsHead}>
          <div className={styles.standingsTitleWrap}>
            <span className={styles.standingsBadge} aria-hidden="true">
              <TrophyIcon size={18} />
            </span>
            <div>
              <span className={styles.standingsKicker}>Liga del viaje</span>
              <span className={styles.standingsTitle}>Clasificación</span>
            </div>
          </div>
          {leader && (
            <div className={styles.standingsMeta}>
              <span className={styles.leaderLine}>
                Lidera <b>{leader.name}</b>
              </span>
              <span className={styles.standingsMetaSub}>
                {leaderboard.length} {leaderboard.length === 1 ? 'jugador' : 'jugadores'}
              </span>
            </div>
          )}
        </header>

        {leaderboard.length === 0 ? (
          <p className={styles.standingsEmpty}>
            Aún no hay puntos. Jugad un reto para abrir el marcador.
          </p>
        ) : (
          <>
            {hasPodium && (
              <Podium
                top3={podium}
                prizes={null}
                totalEntries={leaderboard.length}
                classes={podiumClasses}
              />
            )}
            {listEntries.length > 0 && (
              <ol className={styles.board} start={listStart + 1}>
                {listEntries.map((entry, j) => {
                  const i = listStart + j
                  const isMe = meId != null && entry.userId === meId
                  const width = top > 0 ? Math.max(8, Math.round((entry.points / top) * 100)) : 0
                  return (
                    <li
                      key={entry.userId}
                      className={`${styles.row} ${isMe ? styles.rowMe : ''}`}
                      style={{ '--i': j } as CSSProperties}
                    >
                      <span className={styles.rank}>{i + 1}</span>
                      <div className={styles.player}>
                        <Avatar
                          userId={entry.userId}
                          avatarUrl={entry.avatar}
                          name={entry.name}
                          size="sm"
                        />
                        <span className={styles.playerName}>
                          {entry.name}
                          {isMe && <span className={styles.youTag}>Tú</span>}
                        </span>
                      </div>
                      <div className={styles.rowRight}>
                        <span className={styles.bar} aria-hidden="true">
                          <i
                            className="lg-bar-grow"
                            style={{ '--bar-w': `${width}%` } as CSSProperties}
                          />
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
            <div className={styles.standingsFoot}>
              <button type="button" className={styles.allLink} onClick={onOpenClassic}>
                Ver clasificación completa
                <Icon icon={ChevronRight} size={15} />
              </button>
            </div>
          </>
        )}
      </section>

      {/* (d) TODOS LOS RETOS --------------------------------------------- */}
      <button type="button" className={styles.allChallenges} onClick={onOpenClassic}>
        <span className={styles.acIcon} aria-hidden="true">
          <FlagIcon size={18} />
        </span>
        <span className={styles.acText}>
          <span className={styles.acTitle}>Todos los retos</span>
          <span className={styles.acSub}>
            {playedCount} {playedCount === 1 ? 'jugado' : 'jugados'}
            {liveCount > 0 && ` · ${liveCount} en juego`} · revívelos
          </span>
        </span>
        <span className={styles.acGo} aria-hidden="true">
          <Icon icon={ChevronRight} size={16} />
        </span>
      </button>

      {/* Pie discreto: hogar del marcador completo y los ajustes clásicos (antes
          colgaba del "⋯" de la cabecera; ahora toda la info del reto vive aquí). */}
      <button type="button" className={styles.settingsLink} onClick={onOpenClassic}>
        Ver marcador completo y ajustes
        <Icon icon={ChevronRight} size={14} />
      </button>
    </div>
  )
}
