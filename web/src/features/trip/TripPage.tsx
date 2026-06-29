import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, MoreHorizontal, Plus } from 'lucide-react'
import { EmptyState, Icon, useReducedMotion } from '../../ui'
import { useSession } from '../../lib/session-context'
import { getGroupMembers, isMember, myGroups } from '../../lib/membership'
import type { Moment } from '../../lib/trip'
import { useTripData } from './useTripData'
import { TripDiario } from './TripDiario'
import { TripRetos } from './TripRetos'
import { MomentSheet } from './MomentSheet'
import styles from './TripPage.module.css'

interface Props {
  groupId: string
  /** Lanza el flujo de adivinar de un momento (reto). Lo cablea App al router. */
  onPlayChallenge: (challengeId: string) => void
  /** Abre el flujo de añadir momento (crear reto) del grupo. */
  onAddMoment: () => void
  /** Salta a la GroupPage clásica (marcador completo, todos los retos, ajustes…). */
  onOpenClassic: () => void
  /** Vuelve a la home. */
  onBack: () => void
}

/** Las dos páginas hermanas del viaje. El orden importa: Diario a la izquierda. */
type Section = 'diario' | 'retos'
const SECTIONS: Section[] = ['diario', 'retos']

/**
 * Construye la línea "Tú, Amaia y N más" a partir de los nombres del grupo,
 * poniendo al usuario actual primero como "Tú". Vacía si aún no hay miembros.
 */
function membersLine(names: string[], myName: string | null): string {
  const others = myName ? names.filter((n) => n !== myName) : names
  const label: string[] = []
  if (myName) label.push('Tú')
  label.push(...others.slice(0, myName ? 1 : 2))
  const shown = label.length
  const rest = (myName ? 1 : 0) + others.length - shown
  const base = label.join(', ')
  if (rest > 0) return `${base} y ${rest} más`
  return base
}

// Saltos al "reproducir" el viaje (igual que antes): da tiempo al flyTo del mapa.
const PLAYBACK_INTERVAL_MS = 2300

/**
 * Pantalla "Viaje" en DOS SECCIONES hermanas que se navegan deslizando: DIARIO
 * (mapa satélite + momentos) ↔ RETOS (hub de juego con clasificación). Fuera la
 * pestaña ancha: la navegación es swipe horizontal + teclado + un pager de dos
 * puntos (el activo se alarga) bajo la cabecera, con edge-peek (flecha que late)
 * que telegrafía el gesto. `role=tablist`/`aria-selected` y foco visible.
 *
 * La lógica de selección carrusel↔mapa y de reproducción del recorrido vive aquí
 * (es transversal a la sección Diario) y se delega a TripDiario por props.
 */
export function TripPage({ groupId, onPlayChallenge, onAddMoment, onOpenClassic, onBack }: Props) {
  const { user, profile } = useSession()
  const {
    group,
    moments,
    route,
    leaderboard,
    recentResults,
    recentTitle,
    loading,
    error,
    refresh,
  } = useTripData(groupId)
  const reducedMotion = useReducedMotion()

  // Página activa (diario|retos). Gobierna el desplazamiento de la pista.
  const [section, setSection] = useState<Section>('diario')
  // Momento abierto en la hoja de detalle (null = cerrada).
  const [openMoment, setOpenMoment] = useState<Moment | null>(null)
  // Momento seleccionado (centra su pin en el mapa). Se sincroniza carrusel↔mapa.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // ¿Puede el usuario añadir/editar? (dueño del viaje). El RLS lo respalda igual.
  const [canCreate, setCanCreate] = useState(false)
  const [memberNames, setMemberNames] = useState<string[]>([])

  const carouselRef = useRef<HTMLDivElement>(null)
  const selectionFromCarousel = useRef(false)
  const programmaticScroll = useRef(false)
  const scrollSettleTimer = useRef<number | null>(null)
  const programmaticScrollTimer = useRef<number | null>(null)
  const didAutoSelect = useRef(false)

  const [playing, setPlaying] = useState(false)
  const stepperSelecting = useRef(false)

  // Permisos + miembros (tolerante: si falla, no bloquea ver el viaje).
  useEffect(() => {
    if (!user) return
    let cancelled = false
    void (async () => {
      try {
        const member = await isMember(groupId, user.id)
        if (cancelled || !member) return
        const [mine, members] = await Promise.all([myGroups(user.id), getGroupMembers(groupId)])
        if (cancelled) return
        setCanCreate(mine.find((g) => g.id === groupId)?.isOwner ?? false)
        setMemberNames(members.map((m) => m.name))
      } catch {
        // Permisos/miembros no resueltos: tratamos como miembro sin gestión.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [groupId, user])

  const activeMoment = useMemo(() => moments.find((m) => m.status === 'active') ?? null, [moments])
  const liveCount = useMemo(() => moments.filter((m) => m.status === 'active').length, [moments])
  const playedCount = useMemo(() => moments.filter((m) => m.status === 'closed').length, [moments])

  const subtitle = useMemo(
    () => membersLine(memberNames, profile?.display_name ?? null),
    [memberNames, profile],
  )
  const title = group?.name?.trim() || groupId

  // --- Selección y reproducción (transversal a Diario) -----------------------
  const stopPlaybackOnUserSelect = () => {
    if (stepperSelecting.current) return
    setPlaying(false)
  }
  const selectFromCarousel = (challengeId: string) => {
    stopPlaybackOnUserSelect()
    selectionFromCarousel.current = true
    setSelectedId(challengeId)
  }
  const selectFromMap = (challengeId: string) => {
    stopPlaybackOnUserSelect()
    selectionFromCarousel.current = false
    setSelectedId(challengeId)
  }

  const scrollCardIntoView = (challengeId: string) => {
    const el = carouselRef.current?.querySelector<HTMLElement>(`[data-cid="${challengeId}"]`)
    if (!el) return
    programmaticScroll.current = true
    if (programmaticScrollTimer.current != null)
      window.clearTimeout(programmaticScrollTimer.current)
    el.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      inline: 'center',
      block: 'nearest',
    })
    programmaticScrollTimer.current = window.setTimeout(
      () => {
        programmaticScroll.current = false
      },
      reducedMotion ? 80 : 600,
    )
  }

  useEffect(() => {
    if (!selectedId || selectionFromCarousel.current) return
    scrollCardIntoView(selectedId)
    // scrollCardIntoView es estable (cierra sobre refs); no lo listamos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  // Al abrir el viaje, si hay un momento en juego lo seleccionamos solo (una vez).
  useEffect(() => {
    if (didAutoSelect.current || selectedId || !activeMoment) return
    didAutoSelect.current = true
    selectFromMap(activeMoment.challengeId)
    scrollCardIntoView(activeMoment.challengeId)
    // selectFromMap es estable; no lo listamos para no re-disparar la auto-selección.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMoment, selectedId])

  // Stepper de reproducción del recorrido (igual que antes).
  useEffect(() => {
    if (!playing) return
    let index = 0
    const step = () => {
      const moment = moments[index]
      if (!moment) {
        setPlaying(false)
        return
      }
      stepperSelecting.current = true
      selectFromMap(moment.challengeId)
      stepperSelecting.current = false
    }
    step()
    const id = window.setInterval(() => {
      index += 1
      if (index >= moments.length) {
        window.clearInterval(id)
        setPlaying(false)
        return
      }
      step()
    }, PLAYBACK_INTERVAL_MS)
    return () => window.clearInterval(id)
    // selectFromMap es estable; no lo listamos para no reiniciar el recorrido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, moments])

  // Scroll-sync del carrusel (selecciona la tarjeta centrada al hacer swipe).
  useEffect(() => {
    const el = carouselRef.current
    if (!el || moments.length === 0) return

    const syncToCenteredCard = () => {
      const center = el.scrollLeft + el.clientWidth / 2
      let closestId: string | null = null
      let closestDist = Infinity
      for (const slide of el.querySelectorAll<HTMLElement>('[data-cid]')) {
        const slideCenter = slide.offsetLeft + slide.offsetWidth / 2
        const dist = Math.abs(slideCenter - center)
        if (dist < closestDist) {
          closestDist = dist
          closestId = slide.dataset.cid ?? null
        }
      }
      if (closestId && closestId !== selectedId) selectFromCarousel(closestId)
    }

    const onScroll = () => {
      if (programmaticScroll.current) return
      if (scrollSettleTimer.current != null) window.clearTimeout(scrollSettleTimer.current)
      scrollSettleTimer.current = window.setTimeout(syncToCenteredCard, 140)
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (scrollSettleTimer.current != null) window.clearTimeout(scrollSettleTimer.current)
    }
    // selectFromCarousel es estable; dependemos de selectedId (no-op) y moments.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, moments])

  useEffect(() => {
    return () => {
      if (programmaticScrollTimer.current != null)
        window.clearTimeout(programmaticScrollTimer.current)
    }
  }, [])

  const togglePlay = () => setPlaying((p) => !p)

  // --- Navegación entre secciones (botón "›"/"‹" + pager + teclado) ----------
  // SIN swipe horizontal de página: chocaba con el scroll del carrusel de fotos del
  // Diario (ambos gestos horizontales). Se navega solo con el botón de borde, los dos
  // puntos del pager y el teclado.
  const trackRef = useRef<HTMLDivElement>(null)

  // Teclado en el pager: flechas mueven de página. Home/End van a los extremos.
  const onPagerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      setSection('retos')
      e.preventDefault()
    } else if (e.key === 'ArrowLeft') {
      setSection('diario')
      e.preventDefault()
    }
  }

  if (loading) {
    return (
      <div className={styles.screen} role="status" aria-label="Cargando el viaje">
        <header className={styles.chrome} aria-hidden="true">
          <span className={`${styles.skelPill} ${styles.skelIcon} lg-shimmer-surface`} />
          <span className={`${styles.skelPill} ${styles.skelTitle} lg-shimmer-surface`} />
          <span className={`${styles.skelPill} ${styles.skelIcon} lg-shimmer-surface`} />
        </header>
        <div className={styles.panel}>
          <span className={`${styles.skelHero} lg-shimmer-surface`} />
          <span className={`${styles.skelCard} lg-shimmer-surface`} />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <main className={styles.center}>
        <EmptyState
          tone="danger"
          icon="🌍"
          title="No hemos podido cargar el viaje"
          description={error}
        />
      </main>
    )
  }

  const activeIndex = SECTIONS.indexOf(section)

  return (
    <div className={styles.screen}>
      {/* Cabecera: marca del viaje + pager de dos puntos (sin pestaña ancha). */}
      <header className={styles.chrome}>
        <button type="button" className={styles.iconPill} onClick={onBack} aria-label="Volver">
          <Icon icon={ArrowLeft} />
        </button>

        <div className={styles.titleBlock}>
          <span className={styles.tripName}>{title}</span>
          {subtitle && <span className={styles.tripMeta}>{subtitle}</span>}
        </div>

        <button
          type="button"
          className={styles.iconPill}
          onClick={onOpenClassic}
          aria-label="Marcador y ajustes"
        >
          <Icon icon={MoreHorizontal} />
        </button>
      </header>

      {/* Fila de navegación: título de la sección actual (cross-fade) + pager. */}
      <div className={styles.headNav}>
        <div className={styles.secTitle} aria-hidden="true">
          <span className={section === 'diario' ? styles.secOn : styles.secOff}>Diario</span>
          <span className={section === 'retos' ? styles.secOn : styles.secOff}>Retos</span>
        </div>
        <div
          className={styles.pager}
          role="tablist"
          aria-label="Páginas del viaje"
          onKeyDown={onPagerKeyDown}
        >
          {SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={section === s}
              aria-label={s === 'diario' ? 'Diario' : 'Retos'}
              className={`${styles.pagerDot} ${section === s ? styles.pagerActive : ''}`}
              onClick={() => setSection(s)}
            >
              <span className={styles.blip} />
            </button>
          ))}
        </div>
      </div>

      {/* Pista deslizable: dos paneles hermanos (Diario / Retos). */}
      <div className={styles.viewport}>
        <div
          ref={trackRef}
          className={styles.track}
          style={{ transform: `translateX(-${activeIndex * 50}%)` }}
        >
          <section
            className={`${styles.panel} ${styles.panelBleed}`}
            role="tabpanel"
            aria-label="Diario"
            aria-hidden={section !== 'diario'}
          >
            <TripDiario
              ref={carouselRef}
              moments={moments}
              route={route}
              activeMoment={activeMoment}
              selectedId={selectedId}
              canCreate={canCreate}
              playing={reducedMotion ? undefined : playing}
              onTogglePlay={reducedMotion ? undefined : togglePlay}
              onSelectFromMap={selectFromMap}
              onSelectFromCarousel={selectFromCarousel}
              onExpand={(m) => setOpenMoment(m)}
              onPlay={onPlayChallenge}
              onAddMoment={onAddMoment}
            />
          </section>

          <section
            className={styles.panel}
            role="tabpanel"
            aria-label="Retos"
            aria-hidden={section !== 'retos'}
          >
            <TripRetos
              activeMoment={activeMoment}
              activeGuessedCount={activeMoment?.guessedCount ?? 0}
              recentResults={recentResults}
              recentTitle={recentTitle}
              leaderboard={leaderboard}
              meId={user?.id}
              playedCount={playedCount}
              liveCount={liveCount}
              onPlay={onPlayChallenge}
              onOpenClassic={onOpenClassic}
            />
          </section>
        </div>

        {/* Edge-peek: insinúa la página vecina con una flecha que late. */}
        {section === 'diario' && (
          <button
            type="button"
            className={`${styles.peek} ${styles.peekRight}`}
            onClick={() => setSection('retos')}
            aria-label="Ir a Retos"
          >
            <span className={`${styles.nudge} ${styles.nudgeR}`} aria-hidden="true">
              ›
            </span>
          </button>
        )}
        {section === 'retos' && (
          <button
            type="button"
            className={`${styles.peek} ${styles.peekLeft}`}
            onClick={() => setSection('diario')}
            aria-label="Ir a Diario"
          >
            <span className={`${styles.nudge} ${styles.nudgeL}`} aria-hidden="true">
              ‹
            </span>
          </button>
        )}
      </div>

      {/* FAB de añadir momento: solo el dueño y solo en la sección Diario (es donde
          viven los momentos). En vacío el CTA ya está en el EmptyState. */}
      {canCreate && moments.length > 0 && section === 'diario' && (
        <button
          type="button"
          className={styles.fab}
          onClick={onAddMoment}
          aria-label="Añadir momento"
        >
          <Icon icon={Plus} size={26} />
        </button>
      )}

      {/* Hoja de detalle del momento: descripción editable + (en un recuerdo del
          dueño) "Convertir en reto". Al promover, refrescamos el viaje para que el
          momento aparezca ya como reto en el mapa y el carrusel. */}
      <MomentSheet
        moment={openMoment}
        canEdit={canCreate}
        onClose={() => setOpenMoment(null)}
        onPlay={
          openMoment?.status === 'active'
            ? () => onPlayChallenge(openMoment.challengeId)
            : undefined
        }
        onPromoted={() => void refresh()}
      />
    </div>
  )
}
