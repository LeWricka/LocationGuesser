import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronUp, Crown, Plus } from 'lucide-react'
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

// Layout presentacional de la home logueada — enfoque "GLOBO INMERSIVO DOMINANTE":
// el mapamundi satélite ocupa TODA la pantalla a sangre (como la pantalla de viaje) y es
// el lienzo permanente. El chrome (marca, perfil) flota en pastillas papel translúcidas.
// Los viajes viven en una BANDEJA inferior translúcida tipo "sheet": plegada deja ver una
// fila de portadas que flotan sobre el globo; al subirla se despliega la lista completa
// con secciones y CTAs. El mundo del usuario es el protagonista; la lista nunca tapa los
// pines (plegada solo ocupa la franja inferior). SIN "cómo funciona" ni panel de números.
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
  // Bandeja plegada por defecto: el globo manda al entrar. Subirla despliega la lista.
  const [expanded, setExpanded] = useState(false)

  // Separamos TUS viajes (los que posees) del RESTO (donde solo participas); cada
  // grupo ordenado con los que piden acción primero y luego por más reciente.
  const owned = sortTrips(groups.filter((g) => g.owned))
  const others = sortTrips(groups.filter((g) => !g.owned))
  // Fila plegada: una sola tira con todo, acción primero (lo que urge se ve sin desplegar).
  const peekTrips = sortTrips(groups)
  const tripCount = groups.length

  return (
    <div className={[styles.home, className].filter(Boolean).join(' ')}>
      {/* HÉROE INMERSIVO: el mapamundi a sangre ocupa toda la pantalla, detrás del chrome. */}
      <div className={styles.globe}>{worldMap}</div>

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

      {/* BANDEJA inferior translúcida que flota sobre el globo. Plegada: tira de portadas.
          Desplegada: lista completa por secciones + CTAs. */}
      <section
        className={[styles.tray, expanded ? styles.trayOpen : ''].filter(Boolean).join(' ')}
        aria-label="Tus viajes"
      >
        {/* Asa: pulsar pliega/despliega la bandeja. El recuento da contexto sin desplegar. */}
        <button
          type="button"
          className={styles.grabber}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Plegar tus viajes' : 'Desplegar tus viajes'}
        >
          <span className={styles.grabberBar} aria-hidden="true" />
          <span className={styles.grabberRow}>
            <span className={styles.grabberLabel}>
              {tripCount === 1 ? '1 viaje' : `${tripCount} viajes`}
            </span>
            <Icon
              icon={ChevronUp}
              size={18}
              className={[styles.grabberChevron, expanded ? styles.grabberChevronOpen : '']
                .filter(Boolean)
                .join(' ')}
            />
          </span>
        </button>

        {/* Plegada: tira horizontal de portadas que flotan (se oculta al desplegar). */}
        <div className={styles.peek} aria-hidden={expanded}>
          {peekTrips.map((group) => (
            <PeekCard
              key={group.id}
              group={group}
              onClick={onOpenGroup ? () => onOpenGroup(group.id) : undefined}
            />
          ))}
        </div>

        {/* Desplegada: la lista completa por secciones + acciones (scrollea dentro). */}
        <div className={styles.sheetBody}>
          {/* Headings SIEMPRE en el DOM (contrato de la home): se muestran al desplegar. */}
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
      </section>
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

// Indicador SUTIL del estado del viaje ("en juego"/"te toca"), reutilizado por ambas
// tarjetas. Devuelve null si el viaje no pide acción.
function LiveTag({ status }: { status: GroupStatus }) {
  if (status !== 'live' && status !== 'toplay') return null
  const liveLabel = status === 'toplay' ? 'Te toca' : 'En juego'
  return (
    <span className={styles.tripLive}>
      <span className={styles.tripBlip} aria-hidden="true" />
      {liveLabel}
    </span>
  )
}

// Tarjeta-portada de un viaje (lista desplegada): la FOTO es la tarjeta. Velo inferior,
// nombre serif sobre el velo e indicadores sutiles. Tocar abre el viaje. La foto es
// decorativa (la etiqueta del botón da el nombre).
function TripCard({ group, onClick }: { group: HomeGroup; onClick?: () => void }) {
  const isButton = typeof onClick === 'function'

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
          <LiveTag status={group.status} />
          {group.owned && (
            <span className={styles.tripOwned}>
              <Icon icon={Crown} size={14} /> Tuyo
            </span>
          )}
          <h3 className={styles.tripName}>{group.name}</h3>
        </div>
      </button>
    </article>
  )
}

// Mini-portada de la tira plegada: una foto cuadrada que flota sobre el globo. Tocar abre
// el viaje. Es un PREVIEW visual del mismo viaje que ya está en la lista desplegada, así
// que se marca aria-hidden + tabIndex=-1: no duplica el botón accesible "Abrir viaje X"
// (lo posee la tarjeta de la lista); el lector de pantalla y el foco usan esa.
function PeekCard({ group, onClick }: { group: HomeGroup; onClick?: () => void }) {
  const isButton = typeof onClick === 'function'

  return (
    <button
      type="button"
      className={styles.peekCard}
      onClick={onClick}
      disabled={!isButton}
      aria-hidden="true"
      tabIndex={-1}
    >
      <span
        className={styles.peekCover}
        style={group.coverUrl ? { backgroundImage: `url('${group.coverUrl}')` } : undefined}
      >
        {/* En la mini-portada el estado se reduce a un PUNTO de acento que palpita (sin
            texto): la etiqueta legible "Te toca"/"En juego" vive en la lista desplegada
            (y evita duplicar ese texto en el DOM, que es el contrato accesible). */}
        {(group.status === 'live' || group.status === 'toplay') && (
          <span className={styles.peekLive} aria-hidden="true">
            <span className={styles.tripBlip} />
          </span>
        )}
      </span>
      <span className={styles.peekName}>{group.name}</span>
    </button>
  )
}
