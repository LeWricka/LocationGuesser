import { useEffect, useState } from 'react'
import { Crown, MapPin, Play, Plus, Settings } from 'lucide-react'
import { Avatar } from './Avatar'
import { Banner } from './Banner'
import { Button } from './Button'
import { Chip } from './Chip'
import { Icon } from './Icon'
import { Logo } from './Logo'
import type { GroupStatus } from './GroupCard'
import { GlobeSheet } from './GlobeSheet'
import type { GlobePin } from './HomeGlobe'
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
// va fijado arriba como banner).
function actionRank(status: GroupStatus): number {
  if (status === 'toplay') return 0 // te toca jugar
  if (status === 'live') return 1 // hay reto abierto
  return 2 // sin acción pendiente
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
function formatTripDates(startsOn?: string | null, endsOn?: string | null): string | null {
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
  /** Pines-foto de los viajes para el globo héroe (los situados; los compone HomePage). */
  pins?: GlobePin[]
  /** Reto abierto a fijar arriba ("Te toca jugar"). Sin reto → no se fija nada. */
  pinned?: HomePinned | null
  onOpenProfile?: () => void
  onCreateGroup?: () => void
  onOpenGroup?: (id: string) => void
  /** Jugar el reto fijado (lo cablea HomePage a #g=<id>&c=<challengeId>). */
  onPlayPinned?: () => void
  className?: string
}

// Layout presentacional de la home logueada — patrón GLOBO + HOJA (referencia
// Polarsteps): globo héroe a sangre arriba (con los pines-foto de tus viajes, tocables) y
// una HOJA BLANCA debajo con el contenido legible: un Banner "Te toca jugar" si hay reto
// pendiente, la sección "Tus viajes" con tarjetas-portada y el FAB "+" constante. La
// marca "Tabide" y los ajustes flotan en un overlay mínimo sobre el globo. El feed va EN
// la hoja (legible), no sobre el globo oscuro.
export function HomeDashboard({
  userId,
  displayName,
  avatarUrl,
  groups = [],
  pins = [],
  pinned,
  onOpenProfile,
  onCreateGroup,
  onOpenGroup,
  onPlayPinned,
  className,
}: Props) {
  const feed = sortTrips(groups)

  return (
    <GlobeSheet
      pins={pins}
      onOpenPin={onOpenGroup}
      sheetLabel="Tus viajes"
      fab={
        <button
          type="button"
          className={styles.fab}
          onClick={onCreateGroup}
          aria-label="Empezar un viaje nuevo"
        >
          <Icon icon={Plus} size={26} />
        </button>
      }
      overlay={
        <>
          <span className={styles.brand}>
            <Logo variant="wordmark" size={20} monochrome />
          </span>
          <button
            type="button"
            className={styles.sceneButton}
            onClick={onOpenProfile}
            aria-label="Abrir tus ajustes"
          >
            <Icon icon={Settings} size={20} />
          </button>
          <button
            type="button"
            className={styles.avatarButton}
            onClick={onOpenProfile}
            aria-label="Abrir tu perfil"
          >
            <Avatar userId={userId} name={displayName} avatarUrl={avatarUrl} size="sm" />
          </button>
        </>
      }
    >
      <div className={[styles.content, className].filter(Boolean).join(' ')}>
        {/* Reto fijado arriba: lo urgente, como Banner del kit. Sin reto → nada. */}
        {pinned && <PinnedBanner pinned={pinned} onPlay={onPlayPinned} />}

        {/* Feed de viajes: una portada por fila, scroll de la hoja. */}
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
              className={styles.rise}
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
      </div>
    </GlobeSheet>
  )
}

// Banner "Te toca jugar": aviso ancho con el título del reto, su viaje + cuenta atrás y un
// CTA primario "Jugar". Usa el componente Banner del kit (tono oferta = lo urgente, oro).
function PinnedBanner({ pinned, onPlay }: { pinned: HomePinned; onPlay?: () => void }) {
  const countdown = useCountdown(pinned.deadlineAt)
  const meta = [pinned.groupName ? `Viaje a ${pinned.groupName}` : null, countdown]
    .filter(Boolean)
    .join(' · ')

  return (
    <Banner
      tone="oferta"
      className={[styles.pinned, styles.rise].join(' ')}
      action={
        <Button size="sm" onClick={onPlay} disabled={typeof onPlay !== 'function'}>
          <Icon icon={Play} size={16} /> Jugar
        </Button>
      }
    >
      <span className={styles.pinnedLabel}>Te toca jugar</span>
      <span className={styles.pinnedTitle}>{pinned.title}</span>
      {meta && <span className={styles.pinnedMeta}>{meta}</span>}
    </Banner>
  )
}

// Tarjeta-portada de un viaje del feed: la FOTO es la tarjeta. Velo inferior, nombre
// serif sobre el velo, fechas (chip) + estado, corona si es tuyo y mini-cinta de mapa.
// Tocar abre el viaje. La foto es decorativa (la etiqueta del botón da el nombre).
function TripCard({
  group,
  onClick,
  className,
}: {
  group: HomeGroup
  onClick?: () => void
  className?: string
}) {
  const isButton = typeof onClick === 'function'
  const dates = formatTripDates(group.startsOn, group.endsOn)
  const live = !group.closed && (group.status === 'live' || group.status === 'toplay')

  return (
    <button
      type="button"
      className={[styles.card, className].filter(Boolean).join(' ')}
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
        {dates && (
          <Chip tone="neutral" className={styles.dates}>
            {dates}
          </Chip>
        )}
      </span>
    </button>
  )
}

// Cuenta atrás VIVA del plazo del reto fijado: refresca cada minuto. Sin plazo
// (recuerdo) → null: el banner omite la cuenta atrás.
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
  if (days > 0) return hours > 0 ? `cierra en ${days} d ${hours} h` : `cierra en ${days} d`
  if (hours > 0) return `cierra en ${hours} h ${minutes} m`
  if (minutes > 0) return `cierra en ${minutes} m`
  return 'cierra en menos de 1 m'
}
