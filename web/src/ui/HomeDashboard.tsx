import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { Avatar } from './Avatar'
import { Icon } from './Icon'
import { Button } from './Button'
import type { GroupStatus } from './GroupCard'
import styles from './HomeDashboard.module.css'

export interface HomeGroup {
  id: string
  name: string
  status: GroupStatus
  owned?: boolean
  meta?: ReactNode
  /** URL de la foto de portada del viaje, o null (cae a un fondo de papel). */
  coverUrl?: string | null
  /** Fecha de creación (ISO) para ordenar por más reciente. Opcional en tests. */
  createdAt?: string
}

// Orden de los viajes: PRIMERO los que piden acción (te toca → en juego), luego el
// resto por más reciente. Así el usuario ve antes lo que tiene que hacer.
function actionRank(status: GroupStatus): number {
  if (status === 'toplay') return 0 // 🟡 te toca jugar
  if (status === 'live') return 1 // 🔴 hay reto abierto
  return 2 // ⚪ sin acción pendiente
}
function sortTrips(list: HomeGroup[]): HomeGroup[] {
  return [...list].sort(
    (a, b) =>
      actionRank(a.status) - actionRank(b.status) ||
      (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
  )
}

interface Props {
  /** Id del usuario: deriva el avatar por defecto (animal + fondo). */
  userId: string
  /** Nombre a mostrar del usuario (display_name). */
  displayName: string
  avatarUrl?: string | null
  /** Grupos (viajes) del usuario. Vacío → estado de bienvenida (lo decide HomePage). */
  groups?: HomeGroup[]
  /**
   * Mapamundi satélite, ahora DEGRADADO a banda "atlas" secundaria (no el héroe). Si no
   * se pasa, no se pinta la banda (p.ej. en tests/stories que solo verifican el mosaico).
   * El componente del mapa lo inyecta HomePage (vive en features/home) para no acoplar el
   * UI kit a la capa de mapa.
   */
  worldMap?: ReactNode
  onOpenProfile?: () => void
  onCreateGroup?: () => void
  onJoinGroup?: () => void
  onOpenGroup?: (id: string) => void
  className?: string
}

// Layout presentacional de la home logueada — variante "MOSAICO EDITORIAL" (revista de
// viaje): las FOTOS mandan. Una cabecera editorial (masthead serif), un MOSAICO de
// portadas con ritmo de revista (una portada-reportaje grande + teselas variadas), y el
// mapamundi DEGRADADO a una banda "atlas" compacta más abajo (sección secundaria, no el
// héroe absoluto). SIN "cómo funciona" ni panel de números: la promesa es guardar y
// compartir recuerdos; adivinar es un guiño que vive dentro del viaje.
export function HomeDashboard({
  userId,
  displayName,
  avatarUrl,
  groups = [],
  worldMap,
  onOpenProfile,
  onCreateGroup,
  onJoinGroup,
  onOpenGroup,
  className,
}: Props) {
  // Separamos TUS viajes (los que posees) del RESTO (donde solo participas); cada
  // grupo ordenado con los que piden acción primero y luego por más reciente.
  const owned = sortTrips(groups.filter((g) => g.owned))
  const others = sortTrips(groups.filter((g) => !g.owned))

  return (
    <div className={[styles.home, className].filter(Boolean).join(' ')}>
      {/* MASTHEAD: cabecera de revista. El "título" es el nombre del usuario en serif. */}
      <header className={styles.masthead}>
        <div className={styles.mastheadText}>
          <p className={styles.folio}>Tu diario de viaje</p>
          <h1 className={styles.title}>{displayName}</h1>
        </div>
        <button
          type="button"
          className={styles.avatarButton}
          onClick={onOpenProfile}
          aria-label="Abrir tu perfil"
        >
          <Avatar userId={userId} name={displayName} avatarUrl={avatarUrl} size="md" />
        </button>
      </header>

      {/* TUS VIAJES (los que posees) como MOSAICO editorial. DONDE PARTICIPAS aparte.
          Cada sección solo si tiene viajes. */}
      {owned.length > 0 && (
        <TripSection title="Tus viajes" trips={owned} onOpenGroup={onOpenGroup} />
      )}
      {others.length > 0 && (
        <TripSection title="Donde participas" trips={others} onOpenGroup={onOpenGroup} />
      )}

      {/* ATLAS: el mapamundi, ahora banda secundaria compacta (lo inyecta HomePage). */}
      {worldMap && (
        <section aria-label="Atlas de tus viajes" className={styles.atlas}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Tu atlas</h2>
          </div>
          <div className={styles.atlasFrame}>{worldMap}</div>
        </section>
      )}

      {/* Acciones: empezar un viaje (primaria) / unirse con un código. */}
      <div className={styles.ctas}>
        <Button onClick={onCreateGroup} className={styles.ctaPrimary}>
          <Icon icon={Plus} size={18} /> Empezar un viaje
        </Button>
        <Button variant="secondary" onClick={onJoinGroup} className={styles.ctaSecondary}>
          Unirme
        </Button>
      </div>
    </div>
  )
}

// Sección de viajes: eyebrow editorial + contador serif y el MOSAICO de portadas.
function TripSection({
  title,
  trips,
  onOpenGroup,
}: {
  title: string
  trips: HomeGroup[]
  onOpenGroup?: (id: string) => void
}) {
  return (
    <section aria-label={title} className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <span className={styles.sectionCount} aria-hidden="true">
          {trips.length}
        </span>
      </div>
      <div className={styles.mosaic}>
        {trips.map((group, i) => (
          <TripTile
            key={group.id}
            group={group}
            // Ritmo de revista: el 1.º es la "portada-reportaje" (ancha); luego alternamos
            // teselas altas para romper la cuadrícula sin perder la malla.
            variant={i === 0 ? 'feature' : i % 3 === 1 ? 'tall' : 'regular'}
            onClick={onOpenGroup ? () => onOpenGroup(group.id) : undefined}
          />
        ))}
      </div>
    </section>
  )
}

// Tesela-portada de un viaje (mosaico): la FOTO es la tesela. Velo inferior, nombre serif
// sobre el velo, kicker editorial e indicadores sutiles. Tocar abre el viaje. La foto es
// decorativa (la etiqueta del botón da el nombre).
function TripTile({
  group,
  variant,
  onClick,
}: {
  group: HomeGroup
  variant: 'feature' | 'tall' | 'regular'
  onClick?: () => void
}) {
  const isButton = typeof onClick === 'function'
  const live = group.status === 'live' || group.status === 'toplay'
  const liveLabel = group.status === 'toplay' ? 'Te toca' : 'En juego'
  const hasCover = Boolean(group.coverUrl)
  const initial = group.name.trim().charAt(0).toUpperCase() || '·'

  const tileClass = [
    styles.tile,
    variant === 'feature' && styles.feature,
    variant === 'tall' && styles.tall,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <article className={tileClass}>
      <button
        type="button"
        className={styles.tileButton}
        onClick={onClick}
        disabled={!isButton}
        aria-label={`Abrir viaje ${group.name}`}
      >
        <div
          className={[styles.tileCover, !hasCover && styles.placeholder].filter(Boolean).join(' ')}
          style={hasCover ? { backgroundImage: `url('${group.coverUrl}')` } : undefined}
        >
          {/* Tesela sin foto: inicial serif gigante de marca de agua (no un hueco gris). */}
          {!hasCover && (
            <span className={styles.tileWatermark} aria-hidden="true">
              {initial}
            </span>
          )}
          {live && (
            <span className={styles.tileLive}>
              <span className={styles.tileBlip} aria-hidden="true" />
              {liveLabel}
            </span>
          )}
          {group.owned && (
            <span className={styles.tileOwned}>
              <span aria-hidden="true">👑</span> Tuyo
            </span>
          )}
          {variant === 'feature' && <span className={styles.tileKicker}>Reportaje</span>}
          <h3 className={styles.tileName}>{group.name}</h3>
        </div>
      </button>
    </article>
  )
}
