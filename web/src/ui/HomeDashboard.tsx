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
   * Mapamundi satélite (héroe visual). Si no se pasa, no se pinta el mapa (p.ej. en
   * tests/stories que solo verifican el listado). El componente del mapa lo inyecta
   * HomePage (vive en features/home) para no acoplar el UI kit a la capa de mapa.
   */
  worldMap?: ReactNode
  onOpenProfile?: () => void
  onCreateGroup?: () => void
  onJoinGroup?: () => void
  onOpenGroup?: (id: string) => void
  className?: string
}

// Layout presentacional de la home logueada — variante A "el globo" (maqueta home-wow):
// IMAGEN-DOMINANTE. El mapamundi satélite a sangre es el protagonista; el chrome (marca,
// perfil, lema) son pastillas papel translúcidas que flotan, no tarjetas blancas. Debajo,
// los viajes son unidades visuales GRANDES y separadas (su portada-foto manda), no un
// carrusel apretado. SIN "cómo funciona" ni panel de números: la promesa es guardar y
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
      {/* HÉROE: el mapamundi a sangre con el chrome flotando encima. */}
      <section className={styles.hero}>
        {/* Topbar flotante: marca + acceso a perfil, en pastillas papel translúcidas. */}
        <div className={styles.topbar}>
          <span className={styles.brand}>
            <b>Lugares</b>
            <i>tu mundo</i>
          </span>
          <button
            type="button"
            className={styles.avatarButton}
            onClick={onOpenProfile}
            aria-label="Abrir tu perfil"
          >
            <Avatar userId={userId} name={displayName} avatarUrl={avatarUrl} size="sm" />
          </button>
        </div>

        {/* El mapamundi satélite (lo inyecta HomePage). Si no llega, no se pinta. */}
        {worldMap}
      </section>

      {/* TUS VIAJES (los que posees) y, aparte, DONDE PARTICIPAS. Portadas a todo el
          ancho, una por fila (imagen-dominante). Cada sección solo si tiene viajes. */}
      {owned.length > 0 && (
        <TripSection title="Tus viajes" trips={owned} onOpenGroup={onOpenGroup} />
      )}
      {others.length > 0 && (
        <TripSection title="Donde participas" trips={others} onOpenGroup={onOpenGroup} />
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

// Sección de viajes con su título eyebrow + lista a todo el ancho (una portada por fila).
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
    <section aria-label={title} className={styles.tripSection}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.list}>
        {trips.map((group) => (
          <TripCard
            key={group.id}
            group={group}
            onClick={onOpenGroup ? () => onOpenGroup(group.id) : undefined}
          />
        ))}
      </div>
    </section>
  )
}

// Tarjeta-portada de un viaje (variante A): la FOTO es la tarjeta. Velo inferior, nombre
// serif sobre el velo e indicadores sutiles ("en juego"/"te toca"/"tuyo"). Tocar abre el
// viaje. La foto es decorativa (la etiqueta del botón da el nombre).
function TripCard({ group, onClick }: { group: HomeGroup; onClick?: () => void }) {
  const isButton = typeof onClick === 'function'
  const live = group.status === 'live' || group.status === 'toplay'
  const liveLabel = group.status === 'toplay' ? 'Te toca' : 'En juego'

  return (
    <article className={styles.tripCard}>
      <button
        type="button"
        className={styles.tripButton}
        onClick={onClick}
        disabled={!isButton}
        aria-label={`Abrir viaje ${group.name}`}
      >
        <div
          className={styles.tripCover}
          style={group.coverUrl ? { backgroundImage: `url('${group.coverUrl}')` } : undefined}
        >
          {live && (
            <span className={styles.tripLive}>
              <span className={styles.tripBlip} aria-hidden="true" />
              {liveLabel}
            </span>
          )}
          {group.owned && (
            <span className={styles.tripOwned}>
              <span aria-hidden="true">👑</span> Tuyo
            </span>
          )}
          <h3 className={styles.tripName}>{group.name}</h3>
        </div>
      </button>
    </article>
  )
}
