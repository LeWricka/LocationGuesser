import { useEffect, useState } from 'react'
import { ArrowRight, Crown, Link2, MapPin, Pin, Plus } from 'lucide-react'
import { Avatar } from './Avatar'
import { Icon } from './Icon'
import { Logo } from './Logo'
import type { GroupStatus } from './GroupCard'
import styles from './HomeDashboard.module.css'

export interface HomeGroup {
  id: string
  name: string
  status: GroupStatus
  owned?: boolean
  /** URL de la foto de portada del viaje, o null (cae a un fondo de papel). */
  coverUrl?: string | null
  /** Path en Storage de la portada propia del viaje (la firma HomePage). Opcional. */
  coverPath?: string | null
  /** Temporada cerrada/archivada: chip "Cerrado" en vez del estado en vivo. */
  closed?: boolean
  /** Rango de fechas de calendario del viaje ('YYYY-MM-DD'), o null si no se fijó. */
  startsOn?: string | null
  endsOn?: string | null
  /** Fecha de creación (ISO) para ordenar por más reciente. Opcional en tests. */
  createdAt?: string
}

/** Reto abierto fijado arriba ("Te toca jugar"): foto + cuenta atrás + CTA jugar. */
export interface HomePinned {
  groupId: string
  challengeId: string
  /** Título del reto (encabezado de la tarjeta destacada). */
  title: string
  /** Nombre del viaje al que pertenece (subtítulo). */
  groupName: string | null
  /** Plazo absoluto (ISO) para la cuenta atrás, o null (sin plazo). */
  deadlineAt: string | null
  /** Foto del reto, o null (cae a un fondo de papel). */
  coverUrl?: string | null
}

// Orden del feed: PRIMERO los viajes que piden acción (te toca → en juego), luego el
// resto por más reciente. Así lo que urge sube en la lista (el reto concreto, además,
// va fijado arriba como tarjeta destacada).
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

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Parte una fecha de calendario 'YYYY-MM-DD' sin pasar por Date (evita saltos de huso). */
function parseDay(iso: string): { y: number; m: number; d: number } | null {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) }
}

/**
 * Rango de fechas del viaje para la meta de la tarjeta ("15–28 jun 2026", "abr 2026",
 * "desde 2 jun 2026"). Devuelve null si no hay fechas: la tarjeta omite la línea.
 * Fechas de CALENDARIO (sin hora): se formatean a mano para no depender del huso.
 */
export function formatTripDates(startsOn?: string | null, endsOn?: string | null): string | null {
  const start = startsOn ? parseDay(startsOn) : null
  const end = endsOn ? parseDay(endsOn) : null

  if (start && end) {
    // Mismo mes y año → "15–28 jun 2026".
    if (start.y === end.y && start.m === end.m) {
      return `${start.d}–${end.d} ${MONTHS[start.m - 1]} ${start.y}`
    }
    // Mismo año, distinto mes → "28 jun – 3 jul 2026".
    if (start.y === end.y) {
      return `${start.d} ${MONTHS[start.m - 1]} – ${end.d} ${MONTHS[end.m - 1]} ${start.y}`
    }
    // Años distintos → fechas completas a ambos lados.
    return `${start.d} ${MONTHS[start.m - 1]} ${start.y} – ${end.d} ${MONTHS[end.m - 1]} ${end.y}`
  }
  if (start) return `desde ${start.d} ${MONTHS[start.m - 1]} ${start.y}`
  if (end) return `hasta ${end.d} ${MONTHS[end.m - 1]} ${end.y}`
  return null
}

interface Props {
  /** Id del usuario: deriva el avatar por defecto (animal + fondo). */
  userId: string
  /** Nombre a mostrar del usuario (display_name). */
  displayName: string
  avatarUrl?: string | null
  /** Grupos (viajes) del usuario. Vacío → estado de bienvenida (lo decide HomePage). */
  groups?: HomeGroup[]
  /** Reto abierto a fijar arriba ("Te toca jugar"). Sin reto → no se fija nada. */
  pinned?: HomePinned | null
  onOpenProfile?: () => void
  onCreateGroup?: () => void
  onJoinGroup?: () => void
  onOpenGroup?: (id: string) => void
  /** Jugar el reto fijado (lo cablea HomePage a #g=<id>&c=<challengeId>). */
  onPlayPinned?: () => void
  className?: string
}

// Layout presentacional de la home logueada — maqueta B "diario visual": un FEED
// vertical de portadas a sangre (la foto del viaje ES la tarjeta) con scroll natural,
// y el reto abierto FIJADO arriba como tarjeta destacada ("Te toca jugar", en oro: lo
// urgente). Cabecera fina sticky con el wordmark + crear/unirse + avatar. SIN mapamundi
// a sangre de héroe: el mapa, si acaso, es una mini-cinta CSS dentro de cada tarjeta.
export function HomeDashboard({
  userId,
  displayName,
  avatarUrl,
  groups = [],
  pinned,
  onOpenProfile,
  onCreateGroup,
  onJoinGroup,
  onOpenGroup,
  onPlayPinned,
  className,
}: Props) {
  const feed = sortTrips(groups)

  return (
    <div className={[styles.home, className].filter(Boolean).join(' ')}>
      {/* Cabecera fina, sticky: marca + unirse/crear + perfil. */}
      <header className={styles.header}>
        <span className={styles.brand}>
          <Logo variant="wordmark" size={22} />
        </span>

        <button
          type="button"
          className={styles.iconButton}
          onClick={onJoinGroup}
          aria-label="Unirme a un viaje con un código"
        >
          <Icon icon={Link2} size={20} />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          onClick={onCreateGroup}
          aria-label="Empezar un viaje nuevo"
        >
          <Icon icon={Plus} size={20} />
        </button>
        <button
          type="button"
          className={styles.avatarButton}
          onClick={onOpenProfile}
          aria-label="Abrir tu perfil"
        >
          <Avatar userId={userId} name={displayName} avatarUrl={avatarUrl} size="sm" />
        </button>
      </header>

      <main className={styles.main}>
        {/* Reto fijado arriba: lo urgente. Sin reto → no se pinta nada (solo el feed). */}
        {pinned && <PinnedCard pinned={pinned} onPlay={onPlayPinned} />}

        {/* Feed de viajes: una portada por fila, scroll natural de la página. */}
        <section aria-label="Tus viajes" className={styles.feed}>
          <div className={styles.feedHead}>
            <h2 className={styles.feedTitle}>Tus viajes</h2>
            <span className={styles.feedCount}>
              {feed.length === 1 ? '1 viaje' : `${feed.length} viajes`}
            </span>
          </div>

          {feed.map((group) => (
            <TripCard
              key={group.id}
              group={group}
              onClick={onOpenGroup ? () => onOpenGroup(group.id) : undefined}
            />
          ))}

          {/* Cierre del feed: empezar un viaje (estado de crecimiento). */}
          <button type="button" className={styles.newCard} onClick={onCreateGroup}>
            <span className={styles.newIcon} aria-hidden="true">
              <Icon icon={Plus} size={22} />
            </span>
            <span className={styles.newText}>
              <strong>Empieza un viaje</strong>
              <span>Comparte tus momentos de una forma diferente.</span>
            </span>
          </button>
        </section>
      </main>
    </div>
  )
}

// Tarjeta FIJADA "Te toca jugar": la foto del reto a sangre, chip "Reto abierto",
// cuenta atrás del plazo y un CTA primario "Jugar ahora". Es lo urgente → acento oro.
function PinnedCard({ pinned, onPlay }: { pinned: HomePinned; onPlay?: () => void }) {
  const isButton = typeof onPlay === 'function'
  const countdown = useCountdown(pinned.deadlineAt)

  return (
    <section className={styles.pinned} aria-labelledby="home-pinned-title">
      <p className={styles.pinLabel}>
        <Icon icon={Pin} size={13} /> Te toca jugar
      </p>

      <button
        type="button"
        className={[styles.card, styles.cardPinned].join(' ')}
        onClick={onPlay}
        disabled={!isButton}
        aria-labelledby="home-pinned-title"
      >
        <span
          className={styles.cover}
          style={pinned.coverUrl ? { backgroundImage: `url('${pinned.coverUrl}')` } : undefined}
          aria-hidden="true"
        />
        <span className={styles.cardBody}>
          <span className={styles.cardTop}>
            <span className={[styles.chip, styles.chipLive].join(' ')}>
              <span className={styles.pulse} aria-hidden="true" />
              Reto abierto
            </span>
          </span>

          <h3 className={styles.pinTitle} id="home-pinned-title">
            {pinned.title}
          </h3>
          {pinned.groupName && (
            <span className={styles.meta}>
              Viaje a <b>{pinned.groupName}</b>
            </span>
          )}

          {countdown && (
            <span className={styles.countdown}>
              <span className={styles.countdownLabel}>Cierra en</span>
              <span className={styles.countdownTime}>{countdown}</span>
            </span>
          )}

          <span className={styles.play} aria-hidden="true">
            Jugar ahora
            <Icon icon={ArrowRight} size={18} />
          </span>
        </span>
      </button>
    </section>
  )
}

// Tarjeta-portada de un viaje del feed: la FOTO es la tarjeta. Velo inferior, nombre
// serif sobre el velo, fechas + estado, corona si es tuyo y mini-cinta de mapa (CSS).
// Tocar abre el viaje. La foto es decorativa (la etiqueta del botón da el nombre).
function TripCard({ group, onClick }: { group: HomeGroup; onClick?: () => void }) {
  const isButton = typeof onClick === 'function'
  const dates = formatTripDates(group.startsOn, group.endsOn)
  const live = !group.closed && (group.status === 'live' || group.status === 'toplay')

  return (
    <button
      type="button"
      className={styles.card}
      onClick={onClick}
      disabled={!isButton}
      aria-label={`Abrir viaje ${group.name}`}
    >
      <span
        className={styles.cover}
        style={group.coverUrl ? { backgroundImage: `url('${group.coverUrl}')` } : undefined}
        aria-hidden="true"
      />
      <span className={styles.cardBody}>
        <span className={styles.cardTop}>
          {group.owned && (
            <span className={styles.crown} title="Es tu viaje" aria-hidden="true">
              <Icon icon={Crown} size={15} />
            </span>
          )}
          {live ? (
            <span className={[styles.chip, styles.chipLive].join(' ')}>
              <span className={styles.pulse} aria-hidden="true" />
              {group.status === 'toplay' ? 'Te toca' : 'En curso'}
            </span>
          ) : group.closed ? (
            <span className={[styles.chip, styles.chipQuiet].join(' ')}>Cerrado</span>
          ) : null}
          <span className={styles.mapChip} aria-hidden="true">
            <Icon icon={MapPin} size={13} />
          </span>
        </span>

        <span className={styles.name}>{group.name}</span>
        {dates && <span className={styles.meta}>{dates}</span>}
      </span>
    </button>
  )
}

// Cuenta atrás VIVA del plazo del reto fijado: refresca cada minuto (el plazo se mide
// en minutos, así que un tick por minuto basta y no malgasta renders). Sin plazo
// (recuerdo) → null: la tarjeta omite la cuenta atrás.
function useCountdown(deadlineIso: string | null): string | null {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!deadlineIso) return
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [deadlineIso])

  if (!deadlineIso) return null
  const remainingMs = new Date(deadlineIso).getTime() - now
  if (remainingMs <= 0) return 'cerrando'

  const totalMinutes = Math.floor(remainingMs / 60_000)
  const days = Math.floor(totalMinutes / 1_440)
  const hours = Math.floor((totalMinutes % 1_440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`
  if (hours > 0) return `${hours} h ${minutes} m`
  if (minutes > 0) return `${minutes} m`
  return 'menos de 1 m'
}
