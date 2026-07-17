import { AlertTriangle } from 'lucide-react'
import { Avatar, Icon } from '../../ui'
import { Medal } from '../../ui/Medal'
import type { VoteWithName } from '../../lib/leaderboard'
import { fmtDist, fmtNumber } from '../../lib/geo'
import { fmtElapsed } from '../../lib/time'
import styles from './ChallengeBoard.module.css'

/** Fila ya ordenada y con el PUESTO calculado (issue #811: el mismo orden
 * alimenta el badge de los pines del mapa — ver `rankOf` más abajo). */
export interface ChallengeBoardRow {
  rank: number
  userId: string
  name: string
  avatar: string | null
  points: number
  distanceKm: number | null
  guessNumber: number | null
  absError: number | null
  elapsedSeconds: number | null
  leftApp: boolean
  isMe: boolean
}

/**
 * Clasificación DE UN RETO a partir de sus votos: puntos desc; empate, quien
 * cayó más cerca (distancia o error absoluto, según el tipo de reto) — más
 * informativo que el nombre; empate total, nombre asc para un orden estable.
 * Puro y exportado: `AllGuessesMap` (vía `ChallengeDetail`/`PlayChallenge`)
 * necesita el MISMO puesto para el badge de cada pin, no solo esta tabla.
 */
// Función pura compartida junto al componente (mismo patrón que
// `visibleLabelUserIds` en AllGuessesMap.tsx); un fichero aparte sería ruido.
// eslint-disable-next-line react-refresh/only-export-components
export function rankedRowsOf(votes: VoteWithName[], myUserId: string | null): ChallengeBoardRow[] {
  return votes
    .map((v) => ({
      userId: v.user_id,
      name: v.display_name,
      avatar: v.avatar,
      points: v.points,
      distanceKm: v.distance_km,
      guessNumber: v.guess_number,
      absError: v.abs_error,
      elapsedSeconds: v.elapsed_seconds,
      leftApp: v.left_app,
      isMe: v.user_id === myUserId,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      const aTie = a.distanceKm ?? a.absError
      const bTie = b.distanceKm ?? b.absError
      if (aTie != null && bTie != null && aTie !== bTie) return aTie - bTie
      if (aTie == null && bTie != null) return 1
      if (aTie != null && bTie == null) return -1
      return a.name.localeCompare(b.name)
    })
    .map((row, i) => ({ ...row, rank: i + 1 }))
}

/** Mapa puesto→jugador a partir de la MISMA clasificación de la tabla (issue
 * #811): para que el badge de cada pin en `AllGuessesMap` coincida siempre con
 * la fila de `ChallengeBoard`, en vez de recalcularlo con un criterio propio. */
// Ver el disable gemelo de `rankedRowsOf` justo arriba.
// eslint-disable-next-line react-refresh/only-export-components
export function rankByUserId(votes: VoteWithName[], myUserId: string | null): Map<string, number> {
  return new Map(rankedRowsOf(votes, myUserId).map((row) => [row.userId, row.rank]))
}

// Icono discreto "salió de la app durante la jugada" (issue #200) — title +
// aria-label duplican el aviso para ratón y lector de pantalla.
function LeftAppFlag() {
  return (
    <span
      className={styles.leftAppFlag}
      title="Salió de la app durante la jugada"
      aria-label="Salió de la app durante la jugada"
    >
      <Icon icon={AlertTriangle} size={13} />
    </span>
  )
}

interface Props {
  votes: VoteWithName[]
  /** userId del usuario en sesión: resalta su fila. Null en sesión anónima. */
  myUserId: string | null
  /** Reto de número ("¿Cuánto?"): la columna de detalle muestra la cifra
   * adivinada (con `numberDecimals`/`numberUnit`) en vez de la distancia. */
  isNumberChallenge?: boolean
  numberDecimals?: number
  numberUnit?: string | null
  /** Texto cuando nadie ha jugado todavía. Por defecto asume un reto que
   * puede seguir EN JUEGO; `ChallengeDetail` lo cambia a "Se cerró sin votos."
   * cuando ya sabe que está cerrado. */
  emptyLabel?: string
  className?: string
  /** userId de la fila seleccionada (issue #824): la fila marca su estado
   * (tinte + `aria-pressed`) y el padre resalta el pin correspondiente en el
   * mapa (`AllGuessesMap`). Null/undefined: ninguna fila seleccionada. */
  selectedUserId?: string | null
  /** Toca una fila: selecciona ese jugador, o deselecciona si ya lo estaba
   * (issue #824). Sin este prop, las filas siguen siendo botones pero tocarlas
   * no hace nada — no hace falta en ningún consumidor hoy (ambos, `ChallengeDetail`
   * y `PlayChallenge`, lo pasan). */
  onSelectUser?: (userId: string | null) => void
  /** 'light' (por defecto): filas de papel/superficie, como en `PlayChallenge`
   * (revelado sobre `lg-page`, papel claro). 'dark': filas de vidrio sobre
   * escena oscura (`ChallengeDetail`, detalle inmersivo del reto) — MISMO
   * componente/datos, solo cambia la superficie para no desentonar con el
   * fondo que lo rodea. */
  tone?: 'light' | 'dark'
}

/**
 * Clasificación DE UN RETO (issue #800, extraída a compartible en el #811):
 * puesto (medalla top-3 / número) + avatar + nombre + puntos + distancia (o
 * cifra, en un reto de número) + TIEMPO de respuesta (`votes.elapsed_seconds`).
 * La usan `ChallengeDetail` (histórico del viaje, detalle oscuro inmersivo —
 * `tone="dark"`) y `PlayChallenge` (revelado justo tras jugar, sobre papel —
 * `tone` por defecto) — mismo componente y mismos DATOS en los dos sitios,
 * solo cambia la superficie (`tone`) para que encaje con lo que la rodea.
 */
export function ChallengeBoard({
  votes,
  myUserId,
  isNumberChallenge = false,
  numberDecimals,
  numberUnit,
  emptyLabel = 'Nadie ha jugado todavía.',
  className,
  selectedUserId = null,
  onSelectUser,
  tone = 'light',
}: Props) {
  const rows = rankedRowsOf(votes, myUserId)
  return (
    <section
      className={[styles.board, tone === 'dark' ? styles.dark : '', className]
        .filter(Boolean)
        .join(' ')}
      aria-label="Clasificación del reto"
    >
      <h2 className={styles.boardTitle}>
        Clasificación
        {rows.length > 0 && (
          <span className={styles.boardCount}>
            {' · '}
            {rows.length} {rows.length === 1 ? 'jugador' : 'jugadores'}
          </span>
        )}
      </h2>
      {rows.length === 0 ? (
        <p className={styles.boardEmpty}>{emptyLabel}</p>
      ) : (
        <ol className={styles.boardList}>
          {rows.map((row) => {
            const selected = row.userId === selectedUserId
            return (
              <li key={row.userId}>
                <button
                  type="button"
                  className={[
                    styles.boardRow,
                    row.isMe ? styles.boardRowMine : '',
                    selected ? styles.boardRowSelected : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-pressed={selected}
                  onClick={() => onSelectUser?.(selected ? null : row.userId)}
                >
                  <span className={styles.boardRank} aria-hidden="true">
                    {row.rank <= 3 ? (
                      <Medal rank={row.rank as 1 | 2 | 3} size={18} />
                    ) : (
                      <span className={styles.boardRankNum}>{row.rank}</span>
                    )}
                  </span>
                  <Avatar userId={row.userId} avatarUrl={row.avatar} name={row.name} size="sm" />
                  <span className={styles.boardName}>
                    {row.name}
                    {row.isMe && <span className={styles.boardMeTag}>Tú</span>}
                    {row.leftApp && <LeftAppFlag />}
                  </span>
                  <span className={styles.boardPoints}>
                    {row.points.toLocaleString('es-ES')} pts
                  </span>
                  <span className={styles.boardDetail}>
                    {isNumberChallenge
                      ? row.guessNumber != null
                        ? fmtNumber(row.guessNumber, numberDecimals, numberUnit)
                        : '—'
                      : row.distanceKm != null
                        ? fmtDist(row.distanceKm)
                        : '—'}
                  </span>
                  <span className={styles.boardTime}>{fmtElapsed(row.elapsedSeconds)}</span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
