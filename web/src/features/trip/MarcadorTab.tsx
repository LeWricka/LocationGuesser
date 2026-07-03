import type { CSSProperties } from 'react'
import { Crown, Share2, Target } from 'lucide-react'
import { Avatar, Button, CountUp, Icon, IconTrofeo } from '../../ui'
// `Medal` no está en el barril de `../../ui` (igual que en el podio de temporada de
// GroupPage/Podium.tsx, que lo importa así): reutilizamos ese mismo componente para
// el pedestal en vez de un dígito de texto — un SVG de medalla no se confunde con
// una letra a ningún tamaño (un "1" en fuente sans, en el pedestal más dorado y
// pequeño, se leyó como una "I" mayúscula en pruebas reales — issue #594).
import { Medal } from '../../ui/Medal'
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

// Orden de ENTRADA del podio: 3º → 2º → 1º (el ganador remata la coreografía).
// Mapea el rank real (1|2|3) al índice de aparición que alimenta --i (stagger).
const PODIO_ENTRY_ORDER: Record<1 | 2 | 3, number> = { 3: 0, 2: 1, 1: 2 }

/**
 * Pestaña Marcador del viaje: el tablón de un JUEGO, no una lista administrativa
 * (oleada 3, issue #546 — diagnóstico: tarjetas planas, sin jerarquía, 60% de
 * pantalla vacío). v2 (issue #594): el dueño vio la v1 de barras (#547) y la sintió
 * "pocha, poco visual" con datos reales (8 jugadores) — la mecánica es un JUEGO con
 * podio, no una tabla. Sube el listón con dos bloques:
 *
 *  1. PODIO (top-3): columnas escalonadas (2º–1º–3º) con el mismo lenguaje que el
 *     podio de temporada de GroupPage (Podium.tsx) — avatar grande con anillo de
 *     medalla (oro/plata/bronce), corona sobre el líder, nombre + puntos con
 *     count-up y un PEDESTAL cerrado y teñido por puesto, con altura escalonada
 *     (la del 1º, la más alta) y el icono `Medal` centrado (no un número: un
 *     dígito de texto en el pedestal dorado se leyó como una letra en pruebas
 *     reales). El oro es EXCLUSIVO de la insignia/anillo/pedestal del líder — el
 *     resto de medallas usan sus propios colores semánticos, nunca oro genérico;
 *     los puntos del líder van en acento teal (no oro: el oro es solo cromo de
 *     medalla, igual que en el podio de temporada).
 *  2. RESTO (4º en adelante): la lista compacta de barras de #547, sin cambios —
 *     solo deja de dibujar el podio (ya cubierto arriba) y arranca en el puesto 4.
 *     La fila propia destacada (borde+fondo teal) vive AQUÍ; en el podio, "soy yo"
 *     se marca con una etiqueta "Tú" ligera junto al nombre — un acento de color
 *     de página entera ahí competiría con el oro/plata/bronce del puesto.
 *
 * Con ≤3 jugadores solo hay podio (sin lista vacía debajo); con 1 jugador, el líder
 * va solo y centrado (issue #594, punto 3).
 *
 * Motion: la columna de cada puesto entra escalonada en el orden 3º→2º→1º
 * (`PODIO_ENTRY_ORDER` alimenta `--i`); el líder usa un easing "spring" sutil
 * (`--motion-ease-spring`) para que se note quién ganó. `animation-fill-mode:
 * backwards` SIEMPRE (nunca `both`/`forwards`, ver gotcha en el .css). Reduced-motion
 * apaga toda animación (igual que la lista de #547).
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

  // El líder marca el 100% de la barra de la lista compacta; el resto (4º+) es
  // relativo a él (leaderboard ya viene ordenado desc por puntos —
  // aggregateLeaderboard). El podio (1º-3º) no lleva barra: su jerarquía la da la
  // composición (alturas de peana), no un porcentaje.
  const topPoints = leaderboard[0].points
  const podio = leaderboard.slice(0, 3)
  const resto = leaderboard.slice(3)
  // Con pocos jugadores en la lista compacta sobra pantalla (issue #546, "aprovecha
  // el vacío"): más aire arriba y entre filas. El podio ya llena la parte de arriba,
  // así que el umbral aplica al tamaño de la lista compacta, no al total.
  const listaClasses = [
    styles.lista,
    resto.length > 0 && resto.length <= 2 ? styles.listaRespira : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={styles.marcador}>
      <ol className={styles.podio} aria-label="Podio">
        {podio.map((entry, i) => {
          const rank = (i + 1) as 1 | 2 | 3
          const esMio = entry.userId === myUserId
          const esLider = rank === 1
          const rankClass = rank === 1 ? styles.podio1 : rank === 2 ? styles.podio2 : styles.podio3
          const anilloClass =
            rank === 1 ? styles.anillo1 : rank === 2 ? styles.anillo2 : styles.anillo3

          return (
            <li
              key={entry.userId}
              className={[styles.podioItem, rankClass].filter(Boolean).join(' ')}
              style={{ '--i': PODIO_ENTRY_ORDER[rank] } as CSSProperties}
              aria-current={esMio ? 'true' : undefined}
            >
              {/* Corona SOLO en el líder (igual que Podium.tsx): 2º/3º no llevan
               * insignia sobre el avatar — su medalla ya vive en el pedestal. */}
              {esLider && (
                <span className={styles.corona} aria-hidden="true">
                  <Icon icon={Crown} size={22} />
                </span>
              )}

              {/* Avatar grande con anillo de medalla: mismo componente del UI kit
               * (tamaño `lg`) escalado por CSS para no tocar Avatar.tsx — el
               * líder ~72px, 2º/3º ~56px (issue #594, punto 1). */}
              <span className={[styles.avatarRing, anilloClass].join(' ')}>
                <Avatar
                  userId={entry.userId}
                  avatarUrl={entry.avatar}
                  name={entry.name}
                  size="lg"
                />
              </span>

              <span className={styles.podioNombreFila}>
                <span className={styles.podioNombre}>{entry.name}</span>
                {/* "Tú" en vez de teñir toda la columna de teal: en el podio ese
                 * acento competiría con el oro/plata/bronce del puesto. */}
                {esMio && <span className={styles.tuTag}>Tú</span>}
              </span>

              <span role="img" aria-label={`${entry.points.toLocaleString('es')} puntos`}>
                <CountUp value={entry.points} className={styles.podioPuntos} />
              </span>

              {/* Pedestal: cerrado y teñido por puesto, con altura escalonada (la
               * del 1º, la más alta) — el gesto que lee "podio" de un vistazo. El
               * icono `Medal` (no un número de texto) lleva la posición accesible. */}
              <div className={styles.podioPeana}>
                <Medal rank={rank} size={22} />
              </div>
            </li>
          )
        })}
      </ol>

      {resto.length > 0 && (
        <ol className={listaClasses} aria-label="Resto de la clasificación">
          {resto.map((entry, i) => {
            const rank = i + 4
            const esMio = entry.userId === myUserId
            const barPct = topPoints > 0 ? Math.max(0.08, entry.points / topPoints) : 0

            return (
              <li
                key={entry.userId}
                className={[styles.fila, esMio ? styles.miPosicion : ''].filter(Boolean).join(' ')}
                style={{ '--i': i } as CSSProperties}
                aria-current={esMio ? 'true' : undefined}
              >
                <div className={styles.filaTop}>
                  <span className={styles.posicion} role="img" aria-label={`Posición ${rank}`}>
                    {rank}
                  </span>

                  <Avatar
                    userId={entry.userId}
                    avatarUrl={entry.avatar}
                    name={entry.name}
                    size="sm"
                  />

                  {/* Nombre + nº de partidas. */}
                  <div className={styles.info}>
                    <div className={styles.nombre}>{entry.name}</div>
                    <div className={styles.partidas}>
                      {entry.plays} {entry.plays === 1 ? 'partida' : 'partidas'}
                    </div>
                  </div>

                  {/* Puntos: count-up al entrar; teal si es la propia fila. */}
                  <span role="img" aria-label={`${entry.points.toLocaleString('es')} puntos`}>
                    <CountUp
                      value={entry.points}
                      className={[styles.puntos, esMio ? styles.destaca : '']
                        .filter(Boolean)
                        .join(' ')}
                    />
                  </span>
                </div>

                {/* Barra de puntuación: proporcional al líder del viaje (no solo
                 * del resto), decorativa (los puntos ya están anunciados arriba). */}
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
    </div>
  )
}
