import type { CSSProperties, ReactNode } from 'react'
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
  /** Nº de momentos situados del viaje (metadato editorial bajo el nombre). */
  momentCount?: number
  /** Etiqueta de fecha legible del viaje (p.ej. "jun 2026"), metadato sutil. */
  dateLabel?: string
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
//
// La galería abre con UNA portada destacada (la primera, a doble alto, estilo editorial)
// y el resto en una rejilla generosa; cada portada revela con un fade-in escalonado al
// montar (respeta prefers-reduced-motion).
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

        {/* Degradado papel que funde el satélite con la galería de abajo (sin costura). */}
        <div className={styles.heroFade} aria-hidden="true" />
      </section>

      {/* GALERÍA: lámina de papel que sube sobre el héroe. TUS VIAJES (los que posees) y,
          aparte, DONDE PARTICIPAS. Portadas grandes (la 1ª destacada). Cada sección solo
          si tiene viajes. */}
      <div className={styles.gallery}>
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
    </div>
  )
}

// Sección de viajes con su título eyebrow + galería editorial: la PRIMERA portada va
// destacada (ancho completo, a más alto) y el resto en una rejilla generosa. Cada portada
// revela con un fade escalonado (delay por índice) al entrar.
function TripSection({
  title,
  trips,
  onOpenGroup,
}: {
  title: string
  trips: HomeGroup[]
  onOpenGroup?: (id: string) => void
}) {
  const [featured, ...rest] = trips

  return (
    <section aria-label={title} className={styles.tripSection}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.list}>
        {featured && (
          <TripCard
            featured
            index={0}
            group={featured}
            onClick={onOpenGroup ? () => onOpenGroup(featured.id) : undefined}
          />
        )}
        {rest.length > 0 && (
          <div className={styles.grid}>
            {rest.map((group, i) => (
              <TripCard
                key={group.id}
                index={i + 1}
                group={group}
                onClick={onOpenGroup ? () => onOpenGroup(group.id) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

// Metadato editorial bajo el nombre: "N momentos · jun 2026" (puntos centrales sutiles).
// Solo pinta las piezas que existen; sin datos no renderiza nada.
function tripMeta(group: HomeGroup): string | null {
  const parts: string[] = []
  if (typeof group.momentCount === 'number' && group.momentCount > 0) {
    parts.push(group.momentCount === 1 ? '1 momento' : `${group.momentCount} momentos`)
  }
  if (group.dateLabel) parts.push(group.dateLabel)
  return parts.length > 0 ? parts.join(' · ') : null
}

// Tarjeta-portada de un viaje (variante A): la FOTO es la tarjeta. Velo inferior, nombre
// serif sobre el velo, metadato sutil (momentos · fecha) e indicadores ("en juego"/"te
// toca"/"tuyo"). `featured` la pinta a doble alto (apertura de la galería). `index` da el
// retardo del fade-in escalonado. Tocar abre el viaje.
function TripCard({
  group,
  onClick,
  featured = false,
  index = 0,
}: {
  group: HomeGroup
  onClick?: () => void
  featured?: boolean
  index?: number
}) {
  const isButton = typeof onClick === 'function'
  const live = group.status === 'live' || group.status === 'toplay'
  const liveLabel = group.status === 'toplay' ? 'Te toca' : 'En juego'
  const meta = tripMeta(group)
  // Retardo del reveal acotado: a partir de la 6ª portada no escalonamos más (evita
  // que las del final aparezcan con un retraso perceptible).
  const revealDelay = `${Math.min(index, 5) * 70}ms`

  return (
    <article
      className={[styles.tripCard, featured ? styles.tripCardFeatured : '']
        .filter(Boolean)
        .join(' ')}
      style={{ '--reveal-delay': revealDelay } as CSSProperties}
    >
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
          <div className={styles.tripText}>
            <h3 className={styles.tripName}>{group.name}</h3>
            {meta && <p className={styles.tripMeta}>{meta}</p>}
          </div>
        </div>
      </button>
    </article>
  )
}
