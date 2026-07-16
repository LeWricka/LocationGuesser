import { Crown, Gift } from 'lucide-react'
import type { LeaderboardEntry } from '../../lib/leaderboard'
import type { GroupPrizes } from '../../lib/database.types'
import { ANIMAL_SVG_VIEWBOX, parseAvatar, svgForEmoji } from '../../lib/avatar'
import { Icon } from '../../ui'
import { Medal } from '../../ui/Medal'
import { prizeForRow } from './prizes'

// Puesto del podio (1, 2 o 3) a partir del índice 0-based del top-3.
type PodiumRank = 1 | 2 | 3

// Mapa de clases CSS que cada contexto inyecta. Compartimos el MARKUP del podio
// (mismo orden 2-1-3, disco con avatar, pedestales) pero NO la escala: la tarjeta
// para compartir se rasteriza a 1080px (fuentes/discos enormes), mientras que en
// la página del grupo el podio va a tamaño de pantalla. Cada quien pasa su módulo
// CSS y así el visual se reutiliza sin acoplar dimensiones.
export interface PodiumClasses {
  podium: string
  podiumCol: string
  placeFirst: string
  placeSecond: string
  placeThird: string
  crown: string
  podiumDisc: string
  podiumAvatar?: string
  podiumName: string
  podiumPoints: string
  podiumPrize: string
  pedestal: string
  pedestalMedal: string
  gold: string
  silver: string
  bronze: string
}

interface Props {
  /** Top-3 ya ordenado (índice 0 = 1º). Si hay menos de 3, no se renderiza. */
  top3: LeaderboardEntry[]
  prizes: GroupPrizes | null
  /** Total de jugadores: lo necesita prizeForRow para resolver el premio "último". */
  totalEntries: number
  classes: PodiumClasses
}

// Clase de color del puesto (oro/plata/bronce) para disco y pedestal.
function rankClassOf(classes: PodiumClasses, index: number): string {
  if (index === 0) return classes.gold
  if (index === 1) return classes.silver
  return classes.bronze
}

// Una columna del podio: avatar-disco + nombre + puntos + premio + pedestal. El
// orden visual (2-1-3) lo dan las clases de plaza vía CSS `order`.
function PodiumColumn({
  entry,
  index,
  prize,
  place,
  classes,
}: {
  entry: LeaderboardEntry
  index: number
  prize: string | null
  place: string
  classes: PodiumClasses
}) {
  const rankClass = rankClassOf(classes, index)
  // Avatar del jugador en el disco: el MISMO dibujo de línea que `Avatar.tsx`
  // (issue #801) — nunca el emoji crudo. Antes se pintaba `{avatar.emoji}` como
  // texto plano sobre un fondo de color; al rasterizar la tarjeta a PNG
  // (html-to-image) el glifo depende de la fuente emoji del cliente y puede
  // salir roto/partido. El SVG es autocontenido: viaja igual en pantalla y en
  // el póster.
  const avatar = parseAvatar(entry.avatar, entry.userId)
  return (
    <div className={`${classes.podiumCol} ${place}`}>
      {index === 0 && (
        <span className={classes.crown} aria-hidden="true">
          <Icon icon={Crown} />
        </span>
      )}
      <span className={`${classes.podiumDisc} ${rankClass}`}>
        {avatar.kind === 'emoji' ? (
          <svg
            className={classes.podiumAvatar}
            viewBox={ANIMAL_SVG_VIEWBOX}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: svgForEmoji(avatar.emoji) ?? '' }}
          />
        ) : (
          <img className={classes.podiumAvatar} src={avatar.src} alt="" aria-hidden="true" />
        )}
      </span>
      <span className={classes.podiumName}>{entry.name}</span>
      <span className={classes.podiumPoints}>{entry.points.toLocaleString('es-ES')}</span>
      {prize && (
        <span className={classes.podiumPrize}>
          <Icon icon={Gift} /> {prize}
        </span>
      )}
      <span className={`${classes.pedestal} ${rankClass}`}>
        {/* Medalla de línea (SVG, color por token --medal-*); reemplaza al emoji.
            La clase `pedestalMedal` fija el tamaño (1em vía su font-size) para que
            escale igual en pantalla y en el póster 1080px. */}
        <Medal rank={(index + 1) as PodiumRank} className={classes.pedestalMedal} />
      </span>
    </div>
  )
}

/**
 * Podio del top-3 (orden visual 2-1-3, disco con avatar y pedestales por altura).
 * Markup compartido entre la tarjeta para compartir (`LeaderboardCard`) y la
 * clasificación de la página del grupo; cada contexto inyecta su módulo CSS para
 * fijar la escala. Presentacional puro. Requiere al menos 3 entradas.
 */
export function Podium({ top3, prizes, totalEntries, classes }: Props) {
  if (top3.length < 3) return null
  return (
    <div className={classes.podium}>
      {/* Orden DOM 2-1-3: el CSS coloca la 1ª plaza al centro y más alta. */}
      <PodiumColumn
        entry={top3[1]}
        index={1}
        place={classes.placeSecond}
        prize={prizeForRow(prizes, 1, totalEntries)}
        classes={classes}
      />
      <PodiumColumn
        entry={top3[0]}
        index={0}
        place={classes.placeFirst}
        prize={prizeForRow(prizes, 0, totalEntries)}
        classes={classes}
      />
      <PodiumColumn
        entry={top3[2]}
        index={2}
        place={classes.placeThird}
        prize={prizeForRow(prizes, 2, totalEntries)}
        classes={classes}
      />
    </div>
  )
}
