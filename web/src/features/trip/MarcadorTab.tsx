import type { CSSProperties } from 'react'
import { Share2, Target } from 'lucide-react'
import { Avatar, Button, CountUp, Icon, IconMedalla, IconTrofeo } from '../../ui'
import type { LeaderboardEntry } from '../../lib/leaderboard'
import styles from './MarcadorTab.module.css'

interface Props {
  leaderboard: LeaderboardEntry[]
  /** userId del usuario en sesión: resalta su fila con acento teal. */
  myUserId?: string | null
  /** Abre la hoja de invitar (CTA del vacío: sin retos ni marcador, invitar es el
   * siguiente paso obvio, no un texto sin acción — issue #510). */
  onInvite: () => void
  /** Abre el flujo de crear reto. Solo se ofrece a quien puede crear (dueño). */
  onAddChallenge: () => void
  /** ¿Puede el usuario crear retos? (dueño) — gobierna el CTA "Crear un reto". */
  canCreate: boolean
}

/**
 * Pestaña Marcador del viaje: el tablón de un JUEGO, no una lista administrativa
 * (oleada 3, issue #546 — diagnóstico: tarjetas planas, sin jerarquía, 60% de
 * pantalla vacío).
 *
 * Diseño Grafito+teal:
 *  - Cada fila lleva una BARRA proporcional a sus puntos (líder = 100%, resto
 *    relativo) que crece al entrar. Comunica de un vistazo cuánto le falta a
 *    cada uno para alcanzar al líder — la lectura que una lista de números no da.
 *  - Líder (①): barra en degradado oro, anillo dorado sutil alrededor del
 *    avatar y brillo discreto en la medalla. El oro es SOLO del líder — el resto
 *    va en teal, incluida la fila del usuario activo.
 *  - Puntos con count-up al entrar (una vez por visita a la pestaña).
 *  - Filas escalonadas al entrar (--motion-stagger-step).
 *  - Podio (1º–3º): IconMedalla con colores semánticos de medalla.
 *  - Resto de posiciones: nº en sans, tinta suave.
 *  - Fila del usuario activo: borde + fondo teal tenue (solo acento en detalle).
 *
 * Si no hay clasificación (nadie ha jugado aún), muestra un estado vacío descriptivo.
 */
export function MarcadorTab({ leaderboard, myUserId, onInvite, onAddChallenge, canCreate }: Props) {
  if (leaderboard.length === 0) {
    return (
      <div className={styles.vacio} role="status">
        <IconTrofeo size={32} className={styles.vacioCabeza} />
        <p>Cuando alguien adivine un reto, aquí aparecerá la clasificación.</p>
        {/* Poco texto, visual-first: acción, no solo un párrafo sin salida. */}
        <div className={styles.vacioAcciones}>
          <Button variant="secondary" size="sm" onClick={onInvite}>
            <Icon icon={Share2} size={16} /> Invitar
          </Button>
          {canCreate && (
            <Button size="sm" onClick={onAddChallenge}>
              <Icon icon={Target} size={16} /> Crear un reto
            </Button>
          )}
        </div>
      </div>
    )
  }

  // El líder marca el 100% de la barra; el resto es relativo a él (leaderboard
  // ya viene ordenado desc por puntos — aggregateLeaderboard). Suelo del 8% para
  // que ningún jugador se quede sin barra visible (mismo criterio que el recap
  // de fin de viaje en TripWrap).
  const topPoints = leaderboard[0].points
  // Con pocos jugadores sobra pantalla: que la lista respire en vez de quedar
  // pegada arriba (issue #546, "aprovecha el vacío"). No cambia estructura ni CTAs.
  const listaClasses = [styles.lista, leaderboard.length <= 2 ? styles.listaRespira : '']
    .filter(Boolean)
    .join(' ')

  return (
    <ol className={listaClasses} aria-label="Clasificación del viaje">
      {leaderboard.map((entry, i) => {
        const rank = i + 1
        const esMio = entry.userId === myUserId
        const esPodio = rank <= 3
        const esLider = rank === 1
        const barPct = topPoints > 0 ? Math.max(0.08, entry.points / topPoints) : 0

        return (
          <li
            key={entry.userId}
            className={[styles.fila, esMio ? styles.miPosicion : '', esLider ? styles.lider : '']
              .filter(Boolean)
              .join(' ')}
            style={{ '--i': i } as CSSProperties}
            aria-current={esMio ? 'true' : undefined}
          >
            <div className={styles.filaTop}>
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
                // role="img": la posición se comunica como medalla/nº. Sin un rol
                // que admita nombre, aria-label en un span es un atributo prohibido.
                role="img"
                aria-label={`Posición ${rank}`}
              >
                {esPodio ? <IconMedalla size={22} rank={rank as 1 | 2 | 3} /> : rank}
              </span>

              {/* Avatar: usa el Avatar del UI kit (animal de línea por defecto). El
               * líder lleva un anillo dorado sutil alrededor (wrapper propio: no
               * toca el box-shadow interno del componente Avatar). */}
              <span className={esLider ? styles.avatarLider : undefined}>
                <Avatar
                  userId={entry.userId}
                  avatarUrl={entry.avatar}
                  name={entry.name}
                  size="sm"
                />
              </span>

              {/* Nombre + nº de partidas. */}
              <div className={styles.info}>
                <div className={styles.nombre}>{entry.name}</div>
                <div className={styles.partidas}>
                  {entry.plays} {entry.plays === 1 ? 'partida' : 'partidas'}
                </div>
              </div>

              {/* Puntos: count-up al entrar; teal si podio o es el propio usuario.
               * role="img" con aria-label fija: el número accesible no depende de
               * en qué punto del count-up esté el render. */}
              <span role="img" aria-label={`${entry.points.toLocaleString('es')} puntos`}>
                <CountUp
                  value={entry.points}
                  className={[styles.puntos, esPodio || esMio ? styles.destaca : '']
                    .filter(Boolean)
                    .join(' ')}
                />
              </span>
            </div>

            {/* Barra de puntuación: proporcional al líder, decorativa (los puntos
             * ya están anunciados arriba). Crece al entrar con la misma cadencia
             * escalonada que la fila. */}
            <div className={styles.barraTrack} aria-hidden="true">
              <div
                className={[styles.barraFill, esLider ? styles.barraLider : '']
                  .filter(Boolean)
                  .join(' ')}
                style={{ '--bar-pct': barPct } as CSSProperties}
              />
            </div>
          </li>
        )
      })}
    </ol>
  )
}
