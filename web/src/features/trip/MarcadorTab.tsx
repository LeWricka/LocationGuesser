import { Avatar, IconMedalla, IconTrofeo } from '../../ui'
import type { LeaderboardEntry } from '../../lib/leaderboard'
import styles from './MarcadorTab.module.css'

interface Props {
  leaderboard: LeaderboardEntry[]
  /** userId del usuario en sesión: resalta su fila con acento teal. */
  myUserId?: string | null
}

/**
 * Pestaña Marcador del viaje: clasificación clara por puntos.
 *
 * Diseño Grafito+teal:
 *  - Podio (1º–3º): IconMedalla con colores semánticos de medalla (oro/plata/bronce).
 *  - Resto de posiciones: nº en sans, tinta suave.
 *  - Fila del usuario activo: borde + fondo teal tenue (solo acento en detalle).
 *  - Puntos en teal en el podio y en la fila propia.
 *  - Sin fondos de color en filas genéricas.
 *
 * Si no hay clasificación (nadie ha jugado aún), muestra un estado vacío descriptivo.
 */
export function MarcadorTab({ leaderboard, myUserId }: Props) {
  if (leaderboard.length === 0) {
    return (
      <div className={styles.vacio} role="status">
        <IconTrofeo size={32} className={styles.vacioCabeza} />
        <p>Cuando alguien adivine un reto, aquí aparecerá la clasificación.</p>
      </div>
    )
  }

  return (
    <ol className={styles.lista} aria-label="Clasificación del viaje">
      {leaderboard.map((entry, i) => {
        const rank = i + 1
        const esMio = entry.userId === myUserId
        const esPodio = rank <= 3

        return (
          <li
            key={entry.userId}
            className={[styles.fila, esMio ? styles.miPosicion : ''].filter(Boolean).join(' ')}
            aria-current={esMio ? 'true' : undefined}
          >
            {/* Posición: medalla para el podio, nº para el resto. */}
            <span
              className={[
                styles.posicion,
                rank === 1 ? styles.oro : '',
                rank === 2 ? styles.plata : '',
                rank === 3 ? styles.bronce : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label={`Posición ${rank}`}
            >
              {esPodio ? <IconMedalla size={22} rank={rank as 1 | 2 | 3} /> : rank}
            </span>

            {/* Avatar: usa el Avatar del UI kit (animal de línea por defecto). */}
            <Avatar userId={entry.userId} avatarUrl={entry.avatar} name={entry.name} size="sm" />

            {/* Nombre + nº de partidas. */}
            <div className={styles.info}>
              <div className={styles.nombre}>{entry.name}</div>
              <div className={styles.partidas}>
                {entry.plays} {entry.plays === 1 ? 'partida' : 'partidas'}
              </div>
            </div>

            {/* Puntos: teal si podio o es el propio usuario. */}
            <span
              className={[styles.puntos, esPodio || esMio ? styles.destaca : '']
                .filter(Boolean)
                .join(' ')}
              aria-label={`${entry.points.toLocaleString('es')} puntos`}
            >
              {entry.points.toLocaleString('es')}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
