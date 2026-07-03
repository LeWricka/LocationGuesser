import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Crown, MapPin, Play, Plus } from 'lucide-react'
import { Avatar } from './Avatar'
import { Chip } from './Chip'
import { Icon } from './Icon'
import type { GroupStatus } from './GroupCard'
import { HomeGlobe } from './HomeGlobe'
import type { GlobePin } from './HomeGlobe'
import { IconPin, LogoTabide, WordmarkTabide } from './icons'
import { normalizePlaceName, resolvePlaceCover } from '../lib/placeCover'
import styles from './HomeDashboard.module.css'

/*
 * Transición héroe home↔diario (issue #589): la foto de la tarjeta TOCADA crece
 * hasta ser el mapa-héroe del Diario (TripDiario aplica el mismo nombre a su
 * capa de mapa, ver ese fichero); al volver, se contrae de vuelta. El nombre
 * debe ser ÚNICO en pantalla, así que NUNCA se pone de forma estática en el JSX
 * de todas las tarjetas — solo se asigna, de forma imperativa, sobre la tarjeta
 * que se toca (ver TripCard más abajo).
 *
 * La "vuelta" es el caso difícil: App.tsx desmonta la Home entera al navegar a
 * un viaje (router por hash) y la vuelve a montar de cero al volver, así que un
 * simple useState no sobrevive ese viaje de ida y vuelta. sessionStorage sí:
 * guardamos solo el id del viaje tocado y lo consumimos (leer + borrar) una
 * única vez al montar, para reclamar el nombre en la tarjeta correcta antes de
 * que la View Transition capture el estado "new" de esta pantalla.
 */
const HERO_TRIP_KEY = 'lg-hero-trip-id'

/*
 * Filtro Míos/De amigos (issue #609): sessionStorage para "recordar" la elección
 * dentro de la sesión (mismo patrón que el puente de la transición héroe de
 * arriba) — un login nuevo no debe arrastrar el filtro de otra persona/sesión.
 *
 * A propósito NO se resetea el filtro cuando cambia la composición de `groups`
 * (p.ej. tras un realtime reload): si el usuario tenía "De amigos" activo y esos
 * viajes desaparecen, los chips se ocultan (ya no aportan, ver `showFilterChips`
 * en el componente) pero el filtro sigue aplicado — de ahí que el carrusel pueda
 * quedar vacío sin que haya chip visible para arreglarlo. Es justo el caso que
 * cubre el aviso de "sin resultados" más abajo: mensaje corto + botón para volver
 * a "Todos", en vez de un carrusel vacío sin explicación.
 */
type TripFilter = 'all' | 'mine' | 'friends'
const TRIP_FILTER_KEY = 'lg-home-trip-filter'

function readStoredFilter(): TripFilter {
  try {
    const value = sessionStorage.getItem(TRIP_FILTER_KEY)
    return value === 'mine' || value === 'friends' ? value : 'all'
  } catch {
    return 'all' // Storage no disponible: arrancamos sin filtro, no rompe nada.
  }
}

function storeFilter(value: TripFilter): void {
  try {
    sessionStorage.setItem(TRIP_FILTER_KEY, value)
  } catch {
    // Sin storage: el filtro no sobrevive a un remount, pero sigue funcionando ahora.
  }
}

function matchesFilter(group: HomeGroup, filter: TripFilter): boolean {
  if (filter === 'mine') return Boolean(group.owned)
  if (filter === 'friends') return !group.owned
  return true
}

function heroTransitionName(groupId: string): string {
  return `trip-hero-${groupId}`
}

/**
 * Centra el carrusel sobre la tarjeta `id` (issue #632): recorre las `[data-gid]`
 * (mismo patrón que el scroll-sync de abajo) y fija `scrollLeft` para que el
 * CENTRO de esa tarjeta coincida con el centro del visor. Asignación directa a
 * la propiedad (no `.scrollTo()`, que jsdom no implementa en los tests) — sin
 * animación: es un ajuste "de reposo", no un gesto del usuario.
 */
function centerCarouselOn(container: HTMLElement, id: string): void {
  for (const slide of container.querySelectorAll<HTMLElement>('[data-gid]')) {
    if (slide.dataset.gid === id) {
      container.scrollLeft = slide.offsetLeft + slide.offsetWidth / 2 - container.clientWidth / 2
      return
    }
  }
}

/** Lee y BORRA el id pendiente (consumo único): una vuelta futura sin relación
 * con este viaje no debe reclamar el nombre por error. */
function takeHeroReturnId(): string | null {
  try {
    const id = sessionStorage.getItem(HERO_TRIP_KEY)
    if (id) sessionStorage.removeItem(HERO_TRIP_KEY)
    return id
  } catch {
    return null // Storage no disponible (privado/bloqueado): sin restauración; no rompe nada.
  }
}

function rememberHeroTrip(groupId: string): void {
  try {
    sessionStorage.setItem(HERO_TRIP_KEY, groupId)
  } catch {
    // Sin storage: la vuelta no reclamará el nombre, pero la ida (más abajo, en el
    // propio click) sigue funcionando igual.
  }
}

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

/** Reto abierto fijado ("Te toca jugar"): foto + cuenta atrás + CTA jugar. */
export interface HomePinned {
  groupId: string
  challengeId: string
  /** Título del reto (la pregunta corta del chip). */
  title: string
  /** Nombre del viaje al que pertenece (subtítulo). */
  groupName: string | null
  /** Plazo absoluto (ISO) para la cuenta atrás, o null (sin plazo). */
  deadlineAt: string | null
  /** Foto del reto, o null (cae a un fondo de papel). */
  coverUrl?: string | null
}

// Orden del carrusel: PRIMERO los viajes que piden acción (te toca → en juego), luego
// el resto por más reciente. Así lo que urge queda más a mano (el reto concreto,
// además, va fijado en el chip de vidrio flotante).
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
  /** Reto abierto a fijar en el chip ("Te toca jugar"). Sin reto → no se pinta nada. */
  pinned?: HomePinned | null
  onOpenProfile?: () => void
  onCreateGroup?: () => void
  onOpenGroup?: (id: string) => void
  /** Jugar el reto fijado (lo cablea HomePage a #g=<id>&c=<challengeId>). */
  onPlayPinned?: () => void
  className?: string
}

/** Id sentinela de la tarjeta "Nuevo viaje" (no es un viaje real: sin targetId). */
const NEW_TRIP_SENTINEL = ''

// Layout presentacional de la home logueada — ESCENA ÚNICA inmersiva (issue #568,
// sin hoja blanca): el globo llena la pantalla a sangre (misma gramática que la
// sección Diario del viaje: mapa a sangre + dock inferior flotante) y TODO el
// chrome —marca, ajustes, chip "Te toca jugar", carrusel de viajes— flota encima con
// vidrio/tinta de escena. La tarjeta CENTRADA del carrusel manda: su id enciende el
// pin del globo (`activeTargetId`, contrato de #567) y su portada tiñe la escena de
// ambiente (`useAmbientTint`). Antes había una hoja de papel debajo del globo (#536);
// la regla de sistema nueva es ESCENA = inmersivo oscuro, TAREA = papel — esta
// pantalla es pura escena.
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
  const carouselRef = useRef<HTMLUListElement>(null)

  // Chips de filtro (issue #609): solo aportan si hay AMBOS tipos de viaje — si
  // el usuario solo tiene propios (o solo de amigos), un filtro no distingue nada
  // y solo sería ruido, así que se ocultan.
  const hasOwnTrips = feed.some((g) => g.owned)
  const hasFriendTrips = feed.some((g) => !g.owned)
  const showFilterChips = hasOwnTrips && hasFriendTrips

  const [filter, setFilter] = useState<TripFilter>(() => readStoredFilter())
  const visibleFeed = feed.filter((g) => matchesFilter(g, filter))
  const noResults = filter !== 'all' && visibleFeed.length === 0

  // Tarjeta centrada del carrusel: arranca en el primer viaje VISIBLE (el que más
  // urge, ver sortTrips). '' = la tarjeta "Nuevo viaje" está centrada (sin viaje
  // activo, o filtro sin resultados).
  const [activeId, setActiveId] = useState<string>(visibleFeed[0]?.id ?? NEW_TRIP_SENTINEL)
  const activeTrip = visibleFeed.find((g) => g.id === activeId) ?? null
  const tint = useAmbientTint(activeTrip?.coverUrl ?? null)

  // Cambiar de chip salta a la primera tarjeta del resultado filtrado (el globo la
  // sigue vía `activeTargetId`, ya cableado más abajo); el centrado real del
  // carrusel sobre esa tarjeta lo hace el efecto de abajo (depende de `filter`) una
  // vez el DOM ya tiene el nuevo `visibleFeed` pintado (aquí, en el propio click,
  // aún es el anterior).
  function handleFilterChange(next: TripFilter) {
    setFilter(next)
    storeFilter(next)
    const nextFeed = feed.filter((g) => matchesFilter(g, next))
    setActiveId(nextFeed[0]?.id ?? NEW_TRIP_SENTINEL)
  }

  // Transición héroe (issue #589), mitad de "vuelta": se consume UNA vez al montar
  // (el initializer de useState solo corre en el mount, no en re-renders) para que
  // la tarjeta del viaje del que venimos reclame el nombre compartido.
  const [heroReturnId] = useState<string | null>(() => takeHeroReturnId())

  // Detección de la tarjeta activa "en reposo" al cargar (issue #632): con
  // `scrollLeft` en 0, la primera tarjeta queda pegada al padding izquierdo del
  // carrusel, NO centrada bajo el criterio que usa el propio scroll-sync de abajo
  // (`syncToCenteredCard`) — a simple vista, ninguna tarjeta parecía "la activa"
  // (captura del dueño). Solo depende de `filter` (montar cuenta como un cambio de
  // filtro implícito) a propósito: `activeId` también cambia por scroll, y si
  // estuviera en las deps este efecto "pelearía" con el gesto de arrastre del
  // usuario, forzando el centrado exacto en cada asentamiento del scroll-sync.
  useLayoutEffect(() => {
    const el = carouselRef.current
    if (!el) return
    centerCarouselOn(el, activeId)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ver comentario de arriba
  }, [filter])

  // Scroll-sync del carrusel (mismo patrón que TripPage/TripDiario): tras cada
  // scroll, con un pequeño reposo (140ms) para no recalcular en cada frame,
  // seleccionamos la tarjeta más cercana al centro del visor.
  useEffect(() => {
    const el = carouselRef.current
    if (!el) return
    let settleTimer: number | null = null

    const syncToCenteredCard = () => {
      const center = el.scrollLeft + el.clientWidth / 2
      let closestId = NEW_TRIP_SENTINEL
      let closestDist = Infinity
      for (const slide of el.querySelectorAll<HTMLElement>('[data-gid]')) {
        const slideCenter = slide.offsetLeft + slide.offsetWidth / 2
        const dist = Math.abs(slideCenter - center)
        if (dist < closestDist) {
          closestDist = dist
          closestId = slide.dataset.gid ?? NEW_TRIP_SENTINEL
        }
      }
      setActiveId(closestId)
    }

    const onScroll = () => {
      if (settleTimer != null) window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(syncToCenteredCard, 140)
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (settleTimer != null) window.clearTimeout(settleTimer)
    }
  }, [visibleFeed])

  return (
    <div className={[styles.scene, className].filter(Boolean).join(' ')}>
      {/* Globo A SANGRE: llena la escena entera (protagonista, misma gramática que el
          Diario). El pin del viaje centrado en el carrusel se enciende vía
          `activeTargetId` — #567 añade esta prop a HomeGlobe (vuelo suave + anillo
          "lead"); aquí ya la consumimos según el contrato acordado entre ambas piezas. */}
      <div className={styles.globeLayer}>
        <HomeGlobe
          pins={pins}
          onOpenPin={onOpenGroup}
          framing="pins"
          activeTargetId={activeId || null}
        />
      </div>

      {/* Tinte ambiental: color medio de la portada del viaje centrado (o el fallback
          teal fijo si no hay portada o el canvas queda "tainted" por CORS). Sutil,
          radial, se funde 600ms al cambiar de tarjeta. */}
      <div
        className={styles.tint}
        style={tint ? ({ '--tint-color': tint } as CSSProperties) : undefined}
        data-visible={activeTrip ? 'true' : undefined}
        aria-hidden="true"
      />

      {/* Chrome superior: marca + avatar (tinta de escena). Un solo acceso al perfil
          (issue #616): antes el engranaje duplicaba el mismo destino que el avatar —
          patrón universal, el avatar basta. */}
      <div className={styles.overlay}>
        <span className={styles.brand}>
          {/* Variante `oscuro`: el símbolo lleva su paleta propia (papel + oro + teal)
              sobre la escena oscura del globo, en vez de aplanarse a un solo tono. */}
          <LogoTabide variant="oscuro" size={22} />
          <WordmarkTabide size={18} />
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

      {/* Deja respirar la escena entre el chrome y el chip/dock (el globo se ve). */}
      <div className={styles.spacer} aria-hidden="true" />

      {/* Reto fijado: chip de vidrio flotante y corto (la pregunta del reto), tap →
          jugar. Sustituye al Banner ancho de la hoja de papel; sin reto pendiente no
          se pinta nada. */}
      {pinned && <PinnedChip pinned={pinned} onPlay={onPlayPinned} />}

      {/* Dock inferior: label "Tus viajes" + carrusel de tarjetas-foto flotando sobre
          la escena (misma gramática que el dock del Diario). Snap al centro; la
          tarjeta activa manda (globo + tinte). Cierra con "Nuevo viaje" — SIN FAB
          aparte: sería un "+" redundante con esta tarjeta (mismo criterio que ya usa
          la bienvenida sin viajes, ver HomePage). */}
      <div className={styles.dock}>
        <div className={styles.dockHead}>
          <h2 className={styles.dockLabel}>Tus viajes</h2>
          <span className={styles.dockCount}>
            {visibleFeed.length === 1 ? '1 viaje' : `${visibleFeed.length} viajes`}
          </span>
        </div>

        {/* Chips Todos · Míos · De amigos (issue #609): solo si distinguen algo (ver
            `showFilterChips`). Vidrio compacto, un único filtro activo a la vez. */}
        {showFilterChips && (
          <div
            className={[styles.filterChips, 'lg-glass'].join(' ')}
            role="group"
            aria-label="Filtrar tus viajes"
          >
            <FilterChip
              label="Todos"
              active={filter === 'all'}
              onClick={() => handleFilterChange('all')}
            />
            <FilterChip
              label="Míos"
              active={filter === 'mine'}
              onClick={() => handleFilterChange('mine')}
            />
            <FilterChip
              label="De amigos"
              active={filter === 'friends'}
              onClick={() => handleFilterChange('friends')}
            />
          </div>
        )}

        {noResults ? (
          // Filtro sin resultados (p.ej. el filtro guardado ya no encaja con tus
          // viajes actuales, ver comentario de `TRIP_FILTER_KEY` arriba): aviso corto
          // + salida directa a "Todos", en vez de un carrusel vacío sin explicación.
          <div className={styles.emptyFilter}>
            <p className={styles.emptyFilterText}>
              {filter === 'mine'
                ? 'No tienes viajes propios con este filtro.'
                : 'No tienes viajes de amigos con este filtro.'}
            </p>
            <button
              type="button"
              className={['lg-press', 'lg-glass', styles.emptyFilterButton].join(' ')}
              onClick={() => handleFilterChange('all')}
            >
              Ver todos
            </button>
          </div>
        ) : (
          <ul ref={carouselRef} className={styles.carousel} aria-label="Tus viajes">
            {visibleFeed.map((group) => (
              <li key={group.id} className={styles.slide} data-gid={group.id}>
                <TripCard
                  group={group}
                  active={group.id === activeId}
                  isReturningHero={group.id === heroReturnId}
                  onFocus={() => setActiveId(group.id)}
                  onClick={onOpenGroup ? () => onOpenGroup(group.id) : undefined}
                />
              </li>
            ))}

            {/* Cierre del carrusel: empezar un viaje (estado de crecimiento). */}
            <li className={styles.slide} data-gid={NEW_TRIP_SENTINEL}>
              <button
                type="button"
                className={['lg-press', styles.newCard].join(' ')}
                data-active={activeId === NEW_TRIP_SENTINEL}
                onFocus={() => setActiveId(NEW_TRIP_SENTINEL)}
                onClick={onCreateGroup}
                aria-label="Empezar un viaje nuevo"
              >
                <span className={styles.newIcon} aria-hidden="true">
                  <Icon icon={Plus} size={22} />
                </span>
                <span className={styles.newText}>Nuevo viaje</span>
              </button>
            </li>
          </ul>
        )}
      </div>
    </div>
  )
}

// Chip de filtro individual: vidrio compacto, `aria-pressed` marca el activo (un
// único filtro a la vez, no checkboxes independientes).
function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={['lg-press', styles.filterChip].join(' ')}
      data-active={active}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

// Chip "Te toca jugar": vidrio flotante y corto, la pregunta del reto + CTA implícito
// (todo el chip es el botón). Countdown solo si hay plazo (recuerdo → sin plazo, se
// omite).
function PinnedChip({ pinned, onPlay }: { pinned: HomePinned; onPlay?: () => void }) {
  const countdown = useCountdown(pinned.deadlineAt)
  const meta = [pinned.groupName, countdown].filter(Boolean).join(' · ')

  return (
    <button
      type="button"
      className={[styles.pinnedChip, 'lg-glass', 'lg-press'].join(' ')}
      onClick={onPlay}
      disabled={typeof onPlay !== 'function'}
    >
      <span className={styles.pinnedIcon} aria-hidden="true">
        <Icon icon={Play} size={16} />
      </span>
      <span className={styles.pinnedBody}>
        <span className={styles.pinnedLabel}>Te toca jugar</span>
        <span className={styles.pinnedTitle}>{pinned.title}</span>
        {meta && <span className={styles.pinnedMeta}>{meta}</span>}
      </span>
    </button>
  )
}

// Tarjeta-portada de un viaje del carrusel: la FOTO es la tarjeta, protagonista
// (~72% del viewport, alto 3:2, ver `.slide` — issue #573). Velo inferior, nombre
// serif sobre el velo, fechas (chip) + estado, corona si es tuyo y mini-cinta de
// mapa. Tocar abre el viaje; la tarjeta
// CENTRADA (`active`) va a opacidad/escala plenas, las demás atenuadas (issue #568,
// sin animar bajo `prefers-reduced-motion`: transición "a corte").
//
// Avatares del grupo (issue #536, punto 5): NO se pintan todavía. `HomeGroup` (y
// `MyGroup` en lib/membership) no traen miembros/avatares del viaje, solo metadatos
// del viaje en sí — ampliar esa consulta se sale del área de este cambio (ui/features
// de home, sin tocar lib/membership). Cuando esa consulta exista, este es el sitio:
// junto a `.mapChip`, en `.cardTop`.
function TripCard({
  group,
  active,
  isReturningHero,
  onClick,
  onFocus,
}: {
  group: HomeGroup
  active: boolean
  /** Venimos de este viaje (issue #589): reclama el nombre de la transición
   * héroe en cuanto se monta, para que la foto se contraiga de vuelta sobre ella. */
  isReturningHero?: boolean
  onClick?: () => void
  onFocus?: () => void
}) {
  const isButton = typeof onClick === 'function'
  const dates = formatTripDates(group.startsOn, group.endsOn)
  const live = !group.closed && (group.status === 'live' || group.status === 'toplay')
  // Portada AUTOMÁTICA del nombre del lugar cuando el viaje no tiene foto propia. Solo
  // se intenta si falta `coverUrl`; mientras carga (o si no hay foto) cae al placeholder.
  const autoCover = useAutoCover(group.coverUrl ? null : group.name)
  const coverUrl = group.coverUrl ?? autoCover
  const hasCover = Boolean(coverUrl)
  // Fundido de la portada al cargar (issue #623, mismo patrón lg-photo-in de
  // ChallengePhoto): `.cover` es un `background-image`, sin evento `onLoad`
  // propio, así que precargamos con un `Image()` de apoyo para saber cuándo el
  // bitmap ya está listo y activar el fundido — evita el "pop" de golpe sobre el
  // tinte de carga (`--photo-loading-bg`).
  const coverLoaded = useImagePreload(coverUrl)

  // Elemento foto/placeholder que hace de héroe en la transición (issue #589). El
  // nombre se gestiona SIEMPRE de forma imperativa (ref), nunca en el objeto
  // `style` de React: así no compite con los re-renders (React solo reconcilia las
  // propiedades que él mismo puso) y podemos asignarlo en el instante exacto que
  // hace falta (ver los dos sitios de abajo).
  const heroRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    // Vuelta (issue #589): el diario YA lleva puesto este nombre en su mapa
    // mientras existe (TripDiario, siempre activo), así que hace de "old" en el
    // instante en que se navega de vuelta. Aquí reclamamos el "new": debe pasar en
    // un layout effect (antes de pintar) para llegar a tiempo al snapshot que
    // toma la View Transition ya en marcha (arrancada por App.tsx al cambiar el
    // hash, ver ui/motion.ts).
    if (isReturningHero && heroRef.current) {
      heroRef.current.style.viewTransitionName = heroTransitionName(group.id)
    }
  }, [isReturningHero, group.id])

  const handleActivate = () => {
    if (!onClick) return
    // Ida (issue #589): el nombre debe ser ÚNICO en pantalla, así que solo la
    // tarjeta TOCADA lo lleva — se asigna aquí, antes de navegar, porque el
    // hashchange (y con él el startViewTransition de App.tsx) llega en una tarea
    // aparte: para cuando el navegador tome el snapshot "old", este nodo ya debe
    // tener el nombre puesto.
    rememberHeroTrip(group.id)
    if (heroRef.current) heroRef.current.style.viewTransitionName = heroTransitionName(group.id)
    onClick()
  }

  return (
    <button
      type="button"
      className={['lg-press', styles.card].join(' ')}
      data-active={active}
      data-owned={group.owned ? 'true' : undefined}
      onClick={handleActivate}
      onFocus={onFocus}
      disabled={!isButton}
      aria-label={`Abrir viaje ${group.name}`}
    >
      {hasCover ? (
        // Fundido al cargar (issue #623, mismo patrón lg-photo-in de ChallengePhoto):
        // el span SIEMPRE está montado con su `backgroundImage` (así `.card` puede
        // reservar sitio y una prueba puede leer la URL desde el primer render);
        // solo la OPACIDAD se retiene hasta que el bitmap decodifica. Mientras
        // tanto se ve el relleno propio de `.card` (`--accent-deep`), no un hueco
        // en blanco. `heroRef` sigue en este nodo: es el que lleva el nombre de la
        // View Transition (issue #589).
        <span
          ref={heroRef}
          className={[styles.cover, coverLoaded ? 'lg-photo-in' : styles.coverHidden].join(' ')}
          style={{ backgroundImage: `url('${coverUrl}')` }}
          aria-hidden="true"
        />
      ) : (
        // Sin portada todavía: fondo discreto de "mapa nocturno" (gradiente grafito/teal
        // con tokens de escena) más un pin a tamaño moderado y baja opacidad.
        <span ref={heroRef} className={styles.placeholder} aria-hidden="true">
          <IconPin size={32} className={styles.placeholderIcon} />
        </span>
      )}
      <span className={styles.cardBody}>
        <span className={styles.cardTop}>
          {group.owned && (
            <span className={styles.crown} title="Es tu viaje" aria-hidden="true">
              <Icon icon={Crown} size={12} />
            </span>
          )}
          {live ? (
            <span className={[styles.chip, styles.chipLive, 'lg-glass'].join(' ')}>
              <span className={styles.pulse} aria-hidden="true" />
              {group.status === 'toplay' ? 'Te toca' : 'En curso'}
            </span>
          ) : group.closed ? (
            <span className={[styles.chip, styles.chipQuiet, 'lg-glass'].join(' ')}>Cerrado</span>
          ) : null}
          <span className={[styles.mapChip, 'lg-glass'].join(' ')} aria-hidden="true">
            <Icon icon={MapPin} size={11} />
          </span>
        </span>

        <span className={styles.name}>{group.name}</span>
        {dates && (
          <Chip tone="neutral" className={[styles.dates, 'lg-glass'].join(' ')}>
            {dates}
          </Chip>
        )}
      </span>
    </button>
  )
}

// Precarga de una URL de imagen (issue #623): devuelve `true` en cuanto el bitmap
// terminó de cargar (o ya estaba en caché — `img.complete`), para poder disparar
// un fundido de entrada sobre un `background-image` (que no tiene `onLoad`
// propio). Mismo espíritu que ChallengePhoto, adaptado a portadas por CSS.
function useImagePreload(url: string | null): boolean {
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!url) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- estado terminal sin url
      setLoaded(false)
      return
    }
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (!cancelled) setLoaded(true)
    }
    img.onerror = () => {
      // Si falla, no dejamos la tarjeta en tinte plano para siempre: se muestra
      // igual (el navegador ya intentó pintar el background-image real).
      if (!cancelled) setLoaded(true)
    }
    img.src = url
    if (img.complete) setLoaded(true)
    return () => {
      cancelled = true
    }
  }, [url])

  return loaded
}

// Portada AUTOMÁTICA derivada del nombre del lugar (fallback cuando el viaje no tiene
// foto propia). `resolvePlaceCover` nunca lanza y cachea; si no hay foto (o la Edge
// Function `place-cover` aún no está desplegada) devuelve null y la tarjeta se queda con
// su placeholder elegante — es el comportamiento correcto, no un error. No bloquea el
// render: arranca null y, si llega imagen y el viaje sigue vivo, la fija.
function useAutoCover(name: string | null): string | null {
  // Guardamos la foto JUNTO al nombre que la originó: si el nombre cambia, el render
  // descarta la anterior sin un setState de reseteo en el efecto (que el linter veta).
  const [resolved, setResolved] = useState<{ name: string; url: string } | null>(null)

  useEffect(() => {
    if (!name) return
    let active = true
    void resolvePlaceCover(normalizePlaceName(name)).then((cover) => {
      if (active && cover.imageUrl) setResolved({ name, url: cover.imageUrl })
    })
    return () => {
      active = false
    }
  }, [name])

  return resolved && resolved.name === name ? resolved.url : null
}

/**
 * Tinte ambiental de la escena: color medio de la portada del viaje CENTRADO,
 * muestreado con canvas (imagen pequeña, `crossOrigin="anonymous"`). Si el canvas
 * queda "tainted" (CORS) o la imagen falla al cargar, devuelve `null` en silencio —
 * el CSS cae entonces al fallback fijo (`--accent`, teal cálido de marca). Nunca
 * lanza ni bloquea el render de la escena.
 */
function useAmbientTint(coverUrl: string | null): string | null {
  const [color, setColor] = useState<string | null>(null)

  useEffect(() => {
    if (!coverUrl) {
      // Sin portada: estado terminal (fallback fijo vía CSS), no un ciclo de sync.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- estado terminal sin portada
      setColor(null)
      return
    }
    let cancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (cancelled) return
      try {
        const size = 12
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(img, 0, 0, size, size)
        const { data } = ctx.getImageData(0, 0, size, size)
        let r = 0
        let g = 0
        let b = 0
        let n = 0
        for (let i = 0; i < data.length; i += 4) {
          r += data[i]
          g += data[i + 1]
          b += data[i + 2]
          n += 1
        }
        if (n === 0 || cancelled) return
        const channel = (sum: number) =>
          Math.round(sum / n)
            .toString(16)
            .padStart(2, '0')
        setColor(`#${channel(r)}${channel(g)}${channel(b)}`)
      } catch {
        // Canvas "tainted" (CORS) u otro fallo de lectura de píxeles: fallback silencioso.
        if (!cancelled) setColor(null)
      }
    }
    img.onerror = () => {
      if (!cancelled) setColor(null)
    }
    img.src = coverUrl
    return () => {
      cancelled = true
    }
  }, [coverUrl])

  return color
}

// Cuenta atrás VIVA del plazo del reto fijado: refresca cada minuto. Sin plazo
// (recuerdo) → null: el chip omite la cuenta atrás.
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
