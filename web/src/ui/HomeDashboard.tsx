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

      {/* Lema editorial (cumple el contrato de copy: "Guarda tus recuerdos y compártelos"). */}
      <header className={styles.lede}>
        <h1 className={styles.ledeTitle}>
          Guarda tus recuerdos <em>y compártelos</em>.
        </h1>
        <p className={styles.subcopy}>
          Los lugares que viviste, en un mapa que cuentas con quien más quieres.
        </p>
      </header>

      {/* TUS VIAJES: rejilla de portadas GRANDES y separadas (imagen-dominante). */}
      <section aria-labelledby="home-trips">
        <h2 id="home-trips" className={styles.sectionTitle}>
          Tus viajes
        </h2>
        <div className={styles.grid}>
          {groups.map((group) => (
            <TripCard
              key={group.id}
              group={group}
              onClick={onOpenGroup ? () => onOpenGroup(group.id) : undefined}
            />
          ))}
          {/* Portada-fantasma "nuevo": empezar un viaje sin romper la rejilla de fotos. */}
          <button type="button" className={styles.ghostCard} onClick={onCreateGroup}>
            <span className={styles.ghostPlus} aria-hidden="true">
              +
            </span>
            <span className={styles.ghostLabel}>Nuevo viaje</span>
          </button>
        </div>
      </section>

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
