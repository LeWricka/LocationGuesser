import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { Avatar } from './Avatar'
import { Icon } from './Icon'
import { Button } from './Button'
import type { GroupStatus } from './GroupCard'
import { Stack } from './Stack'
import styles from './HomeDashboard.module.css'

export interface HomeGroup {
  id: string
  name: string
  status: GroupStatus
  owned?: boolean
  meta?: ReactNode
  /** URL de la foto de portada del viaje, o null (cae a un fondo de papel). */
  coverUrl?: string | null
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

// Layout presentacional de la home logueada (fase "nuevo enfoque", variante A de la
// maqueta): el RELATO de recuerdos manda. Cabecera con el lema en serif + subcopy,
// el MAPAMUNDI satélite como héroe (inyectado por HomePage), el carrusel de "Tus
// viajes" y las acciones (Empezar un viaje / Unirme). SIN "cómo funciona" y sin el
// panel de números: la promesa es guardar y compartir recuerdos, no el juego.
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
  return (
    <div className={[styles.home, className].filter(Boolean).join(' ')}>
      <Stack gap={6} className="lg-stagger">
        {/* Cabecera: eyebrow con avatar (acceso a perfil) + lema serif + subcopy. */}
        <header className={styles.header}>
          <button
            type="button"
            className={styles.eyebrowButton}
            onClick={onOpenProfile}
            aria-label="Abrir tu perfil"
          >
            <Avatar userId={userId} name={displayName} avatarUrl={avatarUrl} size="sm" />
            <span className={styles.eyebrowText}>Tus lugares</span>
          </button>
          <h1 className={styles.lede}>
            Guarda tus recuerdos <em>y compártelos</em>.
          </h1>
          <p className={styles.subcopy}>
            Los lugares que viviste, en un mapa que cuentas con quien más quieres.
          </p>
        </header>

        {/* MAPAMUNDI satélite — el héroe visual. Lo inyecta HomePage (capa de mapa). */}
        {worldMap}

        {/* Tus viajes — carrusel horizontal de tarjetas-portada (variante A). */}
        <section aria-labelledby="home-trips">
          <h2 id="home-trips" className={styles.sectionTitle}>
            Tus viajes
          </h2>
          <div className={styles.rail}>
            {groups.map((group) => (
              <TripCard
                key={group.id}
                group={group}
                onClick={onOpenGroup ? () => onOpenGroup(group.id) : undefined}
              />
            ))}
          </div>
        </section>
      </Stack>

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

// Tarjeta-portada de un viaje (variante A): foto de portada con velo inferior, nombre
// serif sobre el velo y un indicador SUTIL de estado ("en juego" / "te toca"). Tocar
// abre el viaje. La foto es decorativa (aria-hidden); el nombre da la etiqueta del botón.
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
