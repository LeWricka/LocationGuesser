import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Crown, Gift, ListOrdered, Users } from 'lucide-react'
import { Avatar, Button, CountUp, Icon, IconDiana, useReducedMotion } from '../../ui'
import type { LeaderboardEntry } from '../../lib/leaderboard'
import type { GroupPrizes } from '../../lib/database.types'
import { Podium, type PodiumClasses } from '../group/Podium'
import { prizeForRow } from '../group/prizes'
import styles from './StandingsBoard.module.css'

/**
 * Clases del podio (`PodiumClasses`, compartidas) + las de la lista compacta
 * que se pinta en su lugar con MENOS de 3 jugadores (sin podio posible).
 * Vive SOLO en el modo LEGACY (`classes` presente, ver `Props`): el recap de
 * cierre (`TripWrap`) inyecta su propia escala sobre el podio compartido
 * `../group/Podium` — mismo patrón documentado allí: el MARKUP se comparte,
 * la escala visual no.
 */
export interface StandingsClasses extends PodiumClasses {
  board: string
  row: string
  rank: string
  player: string
  playerName: string
  rowRight: string
  bar: string
  rowPoints: string
}

interface Props {
  /** Clasificación general, orden desc (ya agregada, `aggregateLeaderboard`). */
  leaderboard: LeaderboardEntry[]
  prizes: GroupPrizes | null
  /**
   * LEGACY (recap `TripWrap`, issue #822 original): con `classes`, el
   * componente pinta SOLO el podio/lista (el podio compartido `../group/Podium`
   * + una lista compacta), sin cabecera/resumen/CTA propios — el llamador ya
   * los pone alrededor con su propia escala.
   *
   * INMERSIVO (cierre de la Bitácora, issue #849 — rediseño oscuro): SIN
   * `classes`, el componente se pinta ENTERO (cabecera "La liga del
   * viaje"/"Clasificación", podio/lista con el MISMO lenguaje que la cumbre
   * del Marcador — avatares con anillo de medalla, corona en el líder, peana
   * con ordinal —, el resumen de la liga y el CTA "Ver marcador"). Antes este
   * modo reutilizaba el podio de PAPEL compartido con clases inyectadas por
   * `BitacoraTab`; se separa en un modo propio porque el remate de la
   * Bitácora ya no es una tarjeta de papel sobre la escena oscura, sino parte
   * de la propia escena (issue #849: "chirría muchísimo contra la Bitácora
   * oscura" — feedback de producto sobre el diseño anterior).
   */
  classes?: StandingsClasses
  /** Solo modo INMERSIVO: nº de retos con clasificación resuelta (cerrados),
   * para el resumen "N retos jugados · M jugadores" bajo el podio — M sale de
   * `leaderboard.length`, no hace falta pasarlo aparte. */
  challengesPlayed?: number
  /** Solo modo INMERSIVO: CTA "Ver marcador" -> salta a la pestaña completa. */
  onViewMarcador?: () => void
}

/**
 * Top-3 en podio o, con menos de 3 jugadores, una lista compacta a secas —
 * mismo criterio en ambos modos (legacy e inmersivo). Sin ninguna jugada, no
 * pinta nada (el llamador decide si mostrar la sección entera).
 */
export function StandingsBoard({
  leaderboard,
  prizes,
  classes,
  challengesPlayed,
  onViewMarcador,
}: Props) {
  if (leaderboard.length === 0) return null

  // ---- Modo LEGACY (issue #822 original): recap `TripWrap`, sin tocar ----
  if (classes) {
    if (leaderboard.length >= 3) {
      return (
        <Podium
          top3={leaderboard.slice(0, 3)}
          prizes={prizes}
          totalEntries={leaderboard.length}
          classes={classes}
        />
      )
    }

    const top = leaderboard[0]?.points ?? 0
    return (
      <ol className={classes.board}>
        {leaderboard.map((entry, i) => {
          const width = top > 0 ? Math.max(8, Math.round((entry.points / top) * 100)) : 0
          return (
            <li key={entry.userId} className={classes.row} style={{ '--i': i } as CSSProperties}>
              <span className={classes.rank}>{i + 1}</span>
              <div className={classes.player}>
                <Avatar
                  userId={entry.userId}
                  avatarUrl={entry.avatar}
                  name={entry.name}
                  size="sm"
                />
                <span className={classes.playerName}>{entry.name}</span>
              </div>
              <div className={classes.rowRight}>
                <span className={classes.bar} aria-hidden="true">
                  <i style={{ width: `${width}%` }} />
                </span>
                <span className={classes.rowPoints}>{entry.points.toLocaleString('es-ES')}</span>
              </div>
            </li>
          )
        })}
      </ol>
    )
  }

  // ---- Modo INMERSIVO (issue #849): cierre de la Bitácora ----
  return (
    <ImmersiveClose
      leaderboard={leaderboard}
      prizes={prizes}
      challengesPlayed={challengesPlayed}
      onViewMarcador={onViewMarcador}
    />
  )
}

// Orden de ENTRADA del podio: 3º → 2º → 1º (mismo criterio que MarcadorTab —
// el ganador remata la coreografía). Mapea el rank real (1|2|3) al índice de
// aparición que alimenta --i (stagger de la transición de entrada).
const PODIO_ENTRY_ORDER: Record<1 | 2 | 3, number> = { 3: 0, 2: 1, 1: 2 }

const ORDINAL: Record<1 | 2 | 3, string> = { 1: '1º', 2: '2º', 3: '3º' }

/**
 * Cierre INMERSIVO de la Bitácora (issue #849): a diferencia del modo legacy
 * (arriba), este bloque se pinta ENTERO — cabecera, podio/lista y resumen —
 * en vez de recibir clases inyectadas, porque ya no vive sobre una tarjeta de
 * papel (el diseño que sustituye): vive DIRECTAMENTE sobre la escena oscura
 * de la Bitácora, como un remate más de ella.
 *
 * Las reglas de `.podioItem`/`.avatarRing`/`.podioPeana`/etc. DUPLICAN a
 * propósito el lenguaje visual de la cumbre del Marcador
 * (`MarcadorTab.module.css`) en vez de importarlo — mismo criterio que
 * `Podium.tsx`: el MARKUP/lenguaje se comparte de un vistazo, la hoja de
 * estilos no (cada pestaña calibra su propia escala sin acoplar un import
 * cruzado entre features).
 *
 * Entrada por scroll (issue #849, punto 5): fundido+alza sutil al entrar en
 * viewport, mismo patrón IntersectionObserver + fallback de
 * `prefers-reduced-motion`/sin observer que `Camino.tsx`/`LandingShowcase`
 * — con una TRANSICIÓN (no una animación por keyframes): con la entrada
 * gateada por una clase (el elemento empieza oculto en su regla base para
 * poder activarse al hacerse visible), un `animation-fill-mode: backwards`
 * revertiría al estado oculto de la regla base al terminar (el gotcha que
 * documenta `MarcadorTab.module.css` solo evita esto cuando la regla base YA
 * es el estado final) — una transición no tiene ese problema: el valor final
 * es simplemente el que dicta la clase `.in`, sin revertir.
 */
function ImmersiveClose({
  leaderboard,
  prizes,
  challengesPlayed,
  onViewMarcador,
}: {
  leaderboard: LeaderboardEntry[]
  prizes: GroupPrizes | null
  challengesPlayed?: number
  onViewMarcador?: () => void
}) {
  const rootRef = useRef<HTMLElement>(null)
  const reduced = useReducedMotion()
  const canObserve = typeof IntersectionObserver !== 'undefined'
  // Sin observer disponible (jsdom en tests, navegadores muy viejos) o con
  // menos movimiento: arranca YA revelado (inicializador perezoso, no un
  // `setState` síncrono dentro del efecto).
  const [revealed, setRevealed] = useState(() => reduced || !canObserve)

  useEffect(() => {
    if (reduced || !canObserve) return
    const node = rootRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setRevealed(true)
            observer.disconnect()
          }
        })
      },
      { threshold: 0.2 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [reduced, canObserve])

  const hasPodium = leaderboard.length >= 3
  const topPoints = leaderboard[0]?.points ?? 0
  const jugadores = leaderboard.length
  const jugadoresLabel = `${jugadores} ${jugadores === 1 ? 'jugador' : 'jugadores'}`
  const retosLabel =
    challengesPlayed != null
      ? `${challengesPlayed} ${challengesPlayed === 1 ? 'reto jugado' : 'retos jugados'}`
      : null

  return (
    <section
      ref={rootRef}
      className={[styles.cierre, revealed ? styles.in : ''].filter(Boolean).join(' ')}
      aria-label="Clasificación del viaje"
    >
      <header className={styles.head}>
        <span className={styles.kicker}>La liga del viaje</span>
        <h2 className={styles.title}>Clasificación</h2>
      </header>

      {hasPodium ? (
        <ol className={styles.podio} aria-label="Podio">
          {leaderboard.slice(0, 3).map((entry, i) => {
            const rank = (i + 1) as 1 | 2 | 3
            const esLider = rank === 1
            const rankClass =
              rank === 1 ? styles.podio1 : rank === 2 ? styles.podio2 : styles.podio3
            const anilloClass =
              rank === 1 ? styles.anillo1 : rank === 2 ? styles.anillo2 : styles.anillo3
            const premio = prizeForRow(prizes, i, leaderboard.length)

            return (
              <li
                key={entry.userId}
                className={[styles.podioItem, rankClass].filter(Boolean).join(' ')}
                style={{ '--i': PODIO_ENTRY_ORDER[rank] } as CSSProperties}
              >
                {esLider && (
                  <span className={styles.corona} aria-hidden="true">
                    <Icon icon={Crown} size={20} />
                  </span>
                )}

                <span className={[styles.avatarRing, anilloClass].join(' ')}>
                  <Avatar
                    userId={entry.userId}
                    avatarUrl={entry.avatar}
                    name={entry.name}
                    size="lg"
                  />
                </span>

                <span className={styles.podioNombre}>{entry.name}</span>

                <span role="img" aria-label={`${entry.points.toLocaleString('es')} puntos`}>
                  <CountUp value={entry.points} className={styles.podioPuntos} />
                </span>

                {premio && (
                  <span className={styles.podioPremio}>
                    <Icon icon={Gift} size={12} />
                    <span className={styles.podioPremioTexto}>{premio}</span>
                  </span>
                )}

                <div className={styles.podioPeana}>
                  <span className={styles.podioPeanaTexto}>{ORDINAL[rank]}</span>
                </div>
              </li>
            )
          })}
        </ol>
      ) : (
        <ol className={styles.lista} aria-label="Jugadores">
          {leaderboard.map((entry, i) => {
            const barPct = topPoints > 0 ? Math.max(0.08, entry.points / topPoints) : 0
            return (
              <li key={entry.userId} className={styles.fila} style={{ '--i': i } as CSSProperties}>
                <div className={styles.filaTop}>
                  <span className={styles.posicion}>{i + 1}</span>
                  <Avatar
                    userId={entry.userId}
                    avatarUrl={entry.avatar}
                    name={entry.name}
                    size="sm"
                  />
                  <span className={styles.nombre}>{entry.name}</span>
                  <span role="img" aria-label={`${entry.points.toLocaleString('es')} puntos`}>
                    <CountUp value={entry.points} className={styles.puntos} />
                  </span>
                </div>
                <div className={styles.barraTrack} aria-hidden="true">
                  <div
                    className={styles.barraFill}
                    style={{ '--bar-pct': barPct } as CSSProperties}
                  />
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {/* Resumen de la liga (issue #849, punto 3): 1-2 datos que cierran el
          diario con perspectiva de viaje entero, no solo "quién ganó". */}
      <p className={styles.resumen}>
        {retosLabel && (
          <span className={styles.resumenItem}>
            <IconDiana size={14} /> {retosLabel}
          </span>
        )}
        <span className={styles.resumenItem}>
          <Icon icon={Users} size={14} /> {jugadoresLabel}
        </span>
      </p>

      {onViewMarcador && (
        <Button
          variant="secondary"
          size="sm"
          fullWidth
          className={styles.cta}
          onClick={onViewMarcador}
        >
          <Icon icon={ListOrdered} size={16} /> Ver marcador
        </Button>
      )}
    </section>
  )
}
