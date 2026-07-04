import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Flag,
  Globe,
  ImagePlus,
  ListOrdered,
  MoreHorizontal,
  Plus,
  Settings,
  Share2,
  Trash2,
  Users,
} from 'lucide-react'
import { EmptyState, Icon, IconDiana, useReducedMotion, useToast } from '../../ui'
import { AppHeader } from '../../ui/AppHeader'
import { BottomSheet } from '../../ui/BottomSheet'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { useSession } from '../../lib/session-context'
import { getGroupMembers, isMember, myGroups } from '../../lib/membership'
import { getChallenge, type ChallengeForPlay } from '../../lib/challenges'
import { tripShareUrl } from '../../lib/shareLinks'
import { marcadorGroupHash } from '../../lib/route'
import type { Moment } from '../../lib/trip'
import { EditChallenge } from '../group/EditChallenge'
import { InviteModal } from '../group/InviteModal'
import { MembersModal } from '../group/MembersModal'
import { GroupSettingsModal, type SettingsSection } from '../group/GroupSettingsModal'
import { useTripData } from './useTripData'
import { TripDiario } from './TripDiario'
import { BitacoraTab } from './BitacoraTab'
import { MarcadorTab } from './MarcadorTab'
import { TripWrap } from './TripWrap'
import { MomentSheet } from './MomentSheet'
import styles from './TripPage.module.css'

/**
 * Las TRES secciones del viaje (tab, issue #645). Solo la activa se monta en el
 * DOM. El valor interno de la segunda sigue siendo `'fotos'` (así como
 * `v=fotos` en `lib/route.ts`): es un identificador interno, no copy — ahora
 * se ETIQUETA "Bitácora" (el diario que se hojea, ver `BitacoraTab`), pero
 * cambiar el id no aportaría nada al usuario y arrastraría enlaces `#g=…&v=fotos`
 * ya compartidos. Decisión deliberada: lo simple es no tocarlo.
 */
type Section = 'diario' | 'fotos' | 'marcador'

const SECTION_OPTIONS = [
  { value: 'diario' as const, label: 'Diario' },
  { value: 'fotos' as const, label: 'Bitácora' },
  { value: 'marcador' as const, label: 'Marcador' },
]

interface Props {
  groupId: string
  /**
   * Sección inicial al abrir el viaje. Por defecto "Diario"; los enlaces antiguos
   * a la GroupPage clásica (`#g=…&v=clasico`) entran ya en "Marcador"; `v=fotos`
   * entra en "Bitácora" (issue #645, renombrada de "Fotos").
   */
  initialSection?: Section
  /** Lanza el flujo de adivinar de un momento (reto). Lo cablea App al router. */
  onPlayChallenge: (challengeId: string) => void
  /** Abre el flujo de añadir momento (recuerdo: foto, lugar y texto). */
  onAddMoment: () => void
  /** Abre el asistente de crear reto (clásico) del grupo. */
  onAddChallenge: () => void
  /** Vuelve a la home. */
  onBack: () => void
}

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

// Saltos al "reproducir" el viaje: ágil, justo lo que tarda el flyTo del mapa.
const PLAYBACK_INTERVAL_MS = 1100

/**
 * UNA vista por viaje (modelo de navegación, oleada 1): el viaje tiene DOS
 * secciones con un tab — DIARIO (mapa satélite + momentos) y MARCADOR (el marcador
 * completo + retos + miembros, que reutiliza `GroupPage` en modo incrustado). Ya no
 * hay una segunda pantalla "clásica" suelta: los enlaces viejos `#g=…&v=clasico`
 * aterrizan en la pestaña Marcador (compatibilidad).
 *
 * Un solo chrome: la cabecera es el `AppHeader` (atrás · nombre del viaje · ⋯). El
 * menú ⋯ tiene contenido FIJO (Invitar · Miembros · Marcador · Ajustes · Cerrar viaje · Borrar)
 * y el FAB "＋" es el ÚNICO punto de crear (Recuerdo / Reto).
 *
 * La lógica de selección carrusel↔mapa y de reproducción del recorrido vive aquí
 * (es transversal a la sección Diario) y se delega a TripDiario por props.
 */
export function TripPage({
  groupId,
  initialSection = 'diario',
  onPlayChallenge,
  onAddMoment,
  onAddChallenge,
  onBack,
}: Props) {
  const { user, profile } = useSession()
  const {
    group,
    moments,
    route,
    leaderboard,
    winnersByChallenge,
    pastChallenges,
    loading,
    error,
    refresh,
  } = useTripData(groupId, user?.id ?? null)
  const reducedMotion = useReducedMotion()
  const toast = useToast()

  // Sección activa (diario|marcador). Gobierna el desplazamiento de la pista.
  const [section, setSection] = useState<Section>(initialSection)
  // Momento abierto en la hoja de detalle (null = cerrada).
  const [openMoment, setOpenMoment] = useState<Moment | null>(null)
  // Reto en edición a pantalla completa (null = no editando). Editar un reto toca su
  // mecánica (plazo, Street View, votos), así que reutilizamos el editor completo
  // `EditChallenge` montado aquí en vez de hacerlo dentro de la hoja.
  const [editingChallenge, setEditingChallenge] = useState<ChallengeForPlay | null>(null)
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

  // Menú del FAB "＋": elegir entre crear un Momento o un Reto.
  const [fabOpen, setFabOpen] = useState(false)
  const fabWrapRef = useRef<HTMLDivElement>(null)

  // Menú ⋯ de la cabecera (hoja inferior con acciones fijas del viaje).
  const [menuOpen, setMenuOpen] = useState(false)
  // Invitar al viaje: hoja de compartir (reusa InviteModal). Cuelga del menú ⋯ y
  // es SIEMPRE accesible (P0): cualquier miembro puede repartir el enlace.
  const [inviting, setInviting] = useState(false)
  // Miembros del viaje (#616): lista + gestión (co-dueños, expulsar, salir,
  // transferir). Cuelga del menú ⋯ y la ve CUALQUIER miembro (las acciones de
  // gestión ya se filtran dentro según el rol).
  const [membersOpen, setMembersOpen] = useState(false)
  // Ajustes del viaje (renombrar / cerrar temporada / borrar): solo dueño. La
  // sección viaja aparte: "Ajustes", "Cerrar/Reabrir viaje" y "Borrar viaje" abren
  // el mismo modal pero cada uno debe aterrizar en SU sección, no en el formulario
  // genérico (issue #510: "Borrar viaje" aterrizaba en Ajustes sin la confirmación).
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('settings')
  const openSettings = (section: SettingsSection) => {
    setMenuOpen(false)
    setSettingsSection(section)
    setSettingsOpen(true)
  }

  // Recap de cierre: el viaje está cerrado (closed_at) → ofrecemos el "wrap".
  const isClosed = group?.closed_at != null
  const [wrapOpen, setWrapOpen] = useState(false)
  // Auto-mostrar el recap la PRIMERA vez que se entra a un viaje ya cerrado, una
  // sola vez por viaje (lo recordamos en localStorage para no atrapar al usuario
  // cada vez que vuelve). Si falla el storage, no bloquea: solo no auto-muestra.
  const autoShownRef = useRef(false)
  useEffect(() => {
    if (!isClosed || autoShownRef.current) return
    autoShownRef.current = true
    const key = `lg-wrap-seen-${groupId}`
    try {
      if (!localStorage.getItem(key)) {
        // setState directo en efecto: es un disparo ÚNICO por viaje (guardado en ref
        // + localStorage), no un bucle de render. Patrón aceptado aquí.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setWrapOpen(true)
        localStorage.setItem(key, '1')
      }
    } catch {
      // Sin storage (modo privado, etc.): no auto-mostramos; el banner basta.
    }
  }, [isClosed, groupId])

  // Permisos + miembros (tolerante: si falla, no bloquea ver el viaje). En
  // useCallback para poder RE-cargar tras gestionar miembros desde el modal
  // "Miembros" (#616): expulsar/transferir cambian la línea de gente y mis
  // propios permisos (canCreate) sin cambiar groupId/user.
  const reloadMembership = useCallback(async () => {
    if (!user) return
    try {
      const member = await isMember(groupId, user.id)
      if (!member) return
      const [mine, members] = await Promise.all([myGroups(user.id), getGroupMembers(groupId)])
      setCanCreate(mine.find((g) => g.id === groupId)?.isOwner ?? false)
      setMemberNames(members.map((m) => m.name))
    } catch {
      // Permisos/miembros no resueltos: tratamos como miembro sin gestión.
    }
  }, [groupId, user])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reloadMembership es async: setState corre tras el fetch, no síncrono
    void reloadMembership()
  }, [reloadMembership])

  const activeMoment = useMemo(() => moments.find((m) => m.status === 'active') ?? null, [moments])
  // Nº de RETOS (no recuerdos) para el preview de la hoja de invitar.
  const challengeCount = useMemo(() => moments.filter((m) => m.isChallenge).length, [moments])

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

  // Editar un RETO: cargamos su fila completa (sin la respuesta oculta; el editor
  // la pide aparte con derecho del dueño) y abrimos el editor a pantalla completa.
  // La hoja se cierra para que el editor sea el foco. Falla en silencio con aviso.
  const openChallengeEditor = async (challengeId: string) => {
    try {
      const challenge = await getChallenge(challengeId)
      setOpenMoment(null)
      setEditingChallenge(challenge)
    } catch (err) {
      toast.show(
        `No se pudo abrir el editor: ${err instanceof Error ? err.message : String(err)}`,
        {
          tone: 'danger',
        },
      )
    }
  }

  // Menú del FAB: cerrar al tocar fuera o con Escape (accesible con teclado).
  useEffect(() => {
    if (!fabOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (!fabWrapRef.current?.contains(e.target as Node)) setFabOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFabOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [fabOpen])

  // Editor de reto a pantalla completa: toma la pantalla mientras está abierto.
  // Al guardar/cancelar volvemos al viaje y refrescamos (la tarjeta y el mapa
  // reflejan los cambios). Reutiliza el editor completo de la GroupPage clásica.
  if (editingChallenge) {
    return (
      <EditChallenge
        challenge={editingChallenge}
        onBack={() => setEditingChallenge(null)}
        onSaved={() => {
          setEditingChallenge(null)
          void refresh()
        }}
      />
    )
  }

  if (loading) {
    // `key="loading"` (issue #623): sin él, React reconcilia este `<div>` contra el
    // de la carga siguiente (mismo tipo host en la misma posición) y REUTILIZA el
    // nodo `.panel.panelMarcador` de abajo para pintar `.tabs` encima —de una
    // superficie a pantalla completa a una píldora flotante en el mismo frame, el
    // salto de layout más grande medido en esta pantalla (CLS ~0.066, ver PR). La
    // key fuerza un desmontaje/montaje limpio entre esqueleto y contenido real.
    return (
      <div key="loading" className={styles.screen} role="status" aria-label="Cargando el viaje">
        <header className={`${styles.overlay} ${styles.overlayLight}`} aria-hidden="true">
          <span className={`${styles.skelPill} ${styles.skelIcon} lg-shimmer-surface`} />
          <span className={`${styles.skelPill} ${styles.skelTitle} lg-shimmer-surface`} />
          <span className={`${styles.skelPill} ${styles.skelIcon} lg-shimmer-surface`} />
        </header>
        <div className={`${styles.panel} ${styles.panelMarcador}`}>
          <span className={`${styles.skelHero} lg-shimmer-surface`} />
          <span className={`${styles.skelCard} lg-shimmer-surface`} />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <main key="error" className={styles.center}>
        <EmptyState
          tone="danger"
          icon={<Icon icon={Globe} size={32} />}
          title="No hemos podido cargar el viaje"
          description={error}
        />
      </main>
    )
  }

  // Escena PAPEL solo en Marcador; Diario Y Bitácora son escenas OSCURAS a
  // sangre (mapa satélite / diario sobre grafito), así que comparten el chrome
  // de vidrio esmerilado (regla #537: sobre fondo oscuro, vidrio).
  const isPaperScene = section === 'marcador'

  return (
    <div
      key="trip"
      className={`${styles.screen} ${isPaperScene ? styles.scenePaper : styles.sceneDiario} lg-content-in`}
    >
      {/* Cabecera ÚNICA del producto (AppHeader floating): atrás · nombre del viaje
          · menú ⋯. Flota SIEMPRE sobre el contenido (overlay absoluto, layout estable
          entre secciones). Sobre el mapa satélite (Diario) lee con tinta clara + velo;
          sobre papel (Marcador) ajustamos los tokens de escena para que lea oscuro. El
          patrón de cabecera flotante hecho a mano se retira. */}
      <AppHeader
        variant="floating"
        className={styles.header}
        lead="back"
        leadLabel="Volver"
        onLead={onBack}
        title={
          <span className={styles.headerTitle}>
            <span className={styles.tripName}>{title}</span>
            {subtitle && <span className={styles.tripMeta}>{subtitle}</span>}
          </span>
        }
        action={
          <button
            type="button"
            className={[styles.menuButton, 'lg-press'].join(' ')}
            onClick={() => setMenuOpen(true)}
            aria-label="Más opciones del viaje"
            aria-haspopup="dialog"
          >
            <Icon icon={MoreHorizontal} size={22} />
          </button>
        }
      />
      {/* Tab Diario · Bitácora · Marcador (issue #645): el control segmentado
          conmuta de sección. Flota bajo la cabecera, centrado, sobre cada fondo
          (mapa, bitácora o papel). */}
      <div className={styles.tabs}>
        <SegmentedControl
          options={SECTION_OPTIONS}
          value={section}
          onChange={setSection}
          label="Secciones del viaje"
          fullWidth={false}
        />
      </div>

      {/* Cinta de cierre: con el viaje cerrado, ofrece abrir el recap a pantalla
          completa. Flota bajo la cabecera para no robar sitio al mapa/contenido. */}
      {isClosed && (
        <button
          type="button"
          className={styles.wrapBanner}
          onClick={() => setWrapOpen(true)}
          aria-label="Ver el resumen del viaje"
        >
          <span className={styles.wrapBannerText}>
            <Icon icon={Flag} size={16} /> Viaje cerrado — Ver resumen
          </span>
        </button>
      )}

      {/* Viewport de UN SOLO panel: renderizamos SOLO la sección activa (la inactiva
          NO está en el DOM). Antes había una pista al 200% con dos paneles hermanos y
          translateX; el panel inactivo, pegado al borde y oculto solo por overflow,
          asomaba al menor sub-píxel o frame del canvas del mapa (el solapamiento que
          se reportó una y otra vez). Sin pista 200% no hay nada que asome. La
          transición entre tabs es un cross-fade del único panel montado (key=section),
          anulado bajo reduced-motion. */}
      <div className={styles.viewport}>
        {section === 'diario' && (
          <section
            key="diario"
            className={`${styles.panel} ${styles.panelBleed} ${reducedMotion ? '' : styles.panelEnter}`}
            role="tabpanel"
            aria-label="Diario"
          >
            <TripDiario
              ref={carouselRef}
              groupId={groupId}
              moments={moments}
              route={route}
              selectedId={selectedId}
              canCreate={canCreate}
              playing={reducedMotion ? undefined : playing}
              onTogglePlay={reducedMotion ? undefined : togglePlay}
              onSelectFromMap={selectFromMap}
              onExpand={(m) => setOpenMoment(m)}
              onPlay={onPlayChallenge}
              onAddMoment={onAddMoment}
              onInvite={() => setInviting(true)}
            />
          </section>
        )}
        {section === 'fotos' && (
          /* BITÁCORA (issue #645; antes "Fotos"): el diario del viaje que se
             hojea, día a día. Reusa los MISMOS `moments` ya cargados por
             useTripData (sin pedir el grupo/los retos de nuevo); "Ver el
             momento" (título o visor) abre la MISMA hoja de detalle que el
             Diario (`setOpenMoment`). */
          <section
            key="fotos"
            className={`${styles.panel} ${styles.panelFotos} ${reducedMotion ? '' : styles.panelEnter}`}
            role="tabpanel"
            aria-label="Bitácora"
          >
            <BitacoraTab
              groupId={groupId}
              moments={moments}
              canCreate={canCreate}
              onAddMoment={onAddMoment}
              onOpenMoment={(m) => setOpenMoment(m)}
            />
          </section>
        )}
        {section === 'marcador' && (
          /* MARCADOR: clasificación foto-first Grafito+teal. MarcadorTab muestra
             la clasificación general del viaje con IconMedalla para el podio y
             acento teal en la fila del usuario activo. El wiring de datos viene
             de useTripData (leaderboard ya calculado). */
          <section
            key="marcador"
            className={`${styles.panel} ${styles.panelMarcador} ${reducedMotion ? '' : styles.panelEnter}`}
            role="tabpanel"
            aria-label="Marcador"
          >
            <MarcadorTab
              leaderboard={leaderboard}
              myUserId={user?.id ?? null}
              onInvite={() => setInviting(true)}
              onAddChallenge={onAddChallenge}
              canCreate={canCreate}
              groupId={groupId}
              groupName={title}
              prizes={group?.prizes ?? null}
              pastChallenges={pastChallenges}
              // Mismo hash `#g=…&c=…` que "Adivina"/"Ya jugaste" (issue #608): un
              // reto cerrado con voto propio reabre su revelado; sin voto, entra
              // al reto (que ya rechaza jugar fuera de plazo).
              onOpenChallenge={onPlayChallenge}
              onPrizesSaved={() => void refresh()}
            />
          </section>
        )}
      </div>

      {/* FAB "＋" flotante con menú de dos acciones: Momento (recuerdo) o Reto (a
          adivinar). ÚNICO punto de crear del viaje. Solo el dueño y siempre disponible
          (fijo abajo), salvo con el recap abierto (es una pantalla de cierre). */}
      {canCreate && !wrapOpen && (
        <div className={styles.fabWrap} ref={fabWrapRef}>
          {fabOpen && (
            <div className={styles.fabMenu} role="menu" aria-label="Crear">
              <button
                type="button"
                role="menuitem"
                className={styles.fabItem}
                onClick={() => {
                  setFabOpen(false)
                  onAddMoment()
                }}
              >
                <span className={styles.fabItemIcon}>
                  <Icon icon={ImagePlus} size={18} />
                </span>
                Momento
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.fabItem}
                onClick={() => {
                  setFabOpen(false)
                  onAddChallenge()
                }}
              >
                <span className={styles.fabItemIcon}>
                  <IconDiana size={18} />
                </span>
                Reto
              </button>
            </div>
          )}
          <button
            type="button"
            className={`${styles.fab} ${fabOpen ? styles.fabActive : ''}`}
            onClick={() => setFabOpen((o) => !o)}
            aria-label="Crear momento o reto"
            aria-haspopup="menu"
            aria-expanded={fabOpen}
          >
            <Icon icon={Plus} size={26} />
          </button>
        </div>
      )}

      {/* Menú ⋯ del viaje: hoja inferior con contenido FIJO. Invitar · Miembros ·
          Marcador · Ajustes · Cerrar viaje · Borrar. Ajustes/Cerrar/Borrar viven
          dentro del modal de ajustes (solo dueño); aquí enlazamos a él. */}
      <BottomSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Opciones del viaje"
        ariaLabel="Opciones del viaje"
      >
        <nav className={styles.menu} aria-label="Opciones del viaje">
          <button
            type="button"
            className={[styles.menuItem, 'lg-press'].join(' ')}
            onClick={() => {
              setMenuOpen(false)
              setInviting(true)
            }}
          >
            <span className={styles.menuItemIcon}>
              <Icon icon={Share2} size={18} />
            </span>
            Invitar
          </button>
          {/* Miembros (#616): quién está en el viaje y su gestión (co-dueños,
              expulsar, salir, transferir). Visible para cualquier miembro. */}
          <button
            type="button"
            className={[styles.menuItem, 'lg-press'].join(' ')}
            onClick={() => {
              setMenuOpen(false)
              setMembersOpen(true)
            }}
          >
            <span className={styles.menuItemIcon}>
              <Icon icon={Users} size={18} />
            </span>
            Miembros
          </button>
          <button
            type="button"
            className={[styles.menuItem, 'lg-press'].join(' ')}
            onClick={() => {
              setMenuOpen(false)
              setSection('marcador')
            }}
          >
            <span className={styles.menuItemIcon}>
              <Icon icon={ListOrdered} size={18} />
            </span>
            Marcador
          </button>
          {/* Ajustes (renombrar), Cerrar/Reabrir temporada y Borrar son del dueño y
              viven en el modal de ajustes; los miembros no ven estas tres acciones. */}
          {canCreate && (
            <>
              <button
                type="button"
                className={[styles.menuItem, 'lg-press'].join(' ')}
                onClick={() => openSettings('settings')}
              >
                <span className={styles.menuItemIcon}>
                  <Icon icon={Settings} size={18} />
                </span>
                Ajustes
              </button>
              <button
                type="button"
                className={[styles.menuItem, 'lg-press'].join(' ')}
                onClick={() => openSettings('season')}
              >
                <span className={styles.menuItemIcon}>
                  <Icon icon={Flag} size={18} />
                </span>
                {isClosed ? 'Reabrir viaje' : 'Cerrar viaje'}
              </button>
              <button
                type="button"
                className={[styles.menuItem, styles.menuItemDanger, 'lg-press'].join(' ')}
                onClick={() => openSettings('danger')}
              >
                <span className={styles.menuItemIcon}>
                  <Icon icon={Trash2} size={18} />
                </span>
                Borrar viaje
              </button>
            </>
          )}
        </nav>
      </BottomSheet>

      {/* Hoja de detalle del momento: descripción editable + (en un recuerdo del
          dueño) "Convertir en reto". Al promover, refrescamos el viaje para que el
          momento aparezca ya como reto en el mapa y el carrusel. */}
      <MomentSheet
        moment={openMoment}
        canEdit={canCreate}
        myUserId={user?.id ?? null}
        tripStartsOn={group?.starts_on ?? null}
        tripEndsOn={group?.ends_on ?? null}
        onClose={() => setOpenMoment(null)}
        onPlay={
          openMoment?.status === 'active'
            ? () => onPlayChallenge(openMoment.challengeId)
            : undefined
        }
        // "Ver marcador" (#580): cierra la hoja y salta a la pestaña Marcador. El
        // salto real es `setSection` (misma instancia de TripPage, igual que el
        // menú ⋯ → "Marcador"); actualizamos también el hash con `marcadorGroupHash`
        // (patrón de #513) para que la URL quede coherente si se comparte/recarga.
        onViewMarcador={() => {
          setOpenMoment(null)
          setSection('marcador')
          location.hash = marcadorGroupHash(groupId)
        }}
        onPromoted={() => void refresh()}
        onEdited={() => void refresh()}
        onEditChallenge={(challengeId) => void openChallengeEditor(challengeId)}
        onDeleted={() => void refresh()}
      />

      {/* Miembros del viaje (#616): lista + gestión según rol. Tras salir, a la
          home; tras cambiar roles/expulsar/transferir, recargamos permisos
          (canCreate puede cambiar al transferir) y el viaje. */}
      {membersOpen && (
        <MembersModal
          groupId={groupId}
          meId={user?.id ?? null}
          onClose={() => setMembersOpen(false)}
          onLeft={onBack}
          onChanged={() => {
            void reloadMembership()
            void refresh()
          }}
        />
      )}

      {/* Ajustes del viaje (solo dueño): renombrar, cerrar/reabrir temporada y borrar.
          Reutiliza el modal de la GroupPage; al cambiar algo refrescamos el viaje. */}
      {canCreate && settingsOpen && (
        <GroupSettingsModal
          groupId={groupId}
          currentName={group?.name ?? null}
          isClosed={isClosed}
          initialSection={settingsSection}
          onClose={() => setSettingsOpen(false)}
          onRenamed={() => {
            setSettingsOpen(false)
            void refresh()
          }}
          onSeasonChanged={() => {
            setSettingsOpen(false)
            void refresh()
          }}
          onDeleted={onBack}
        />
      )}

      {/* Recap de cierre a pantalla completa: solo con el viaje cerrado y abierto
          (por el banner o auto-mostrado la primera vez). Reúne mapa, stats, podio
          y el timeline-resumen de TODOS los momentos. */}
      {isClosed && wrapOpen && (
        <TripWrap
          tripName={title}
          moments={moments}
          route={route}
          leaderboard={leaderboard}
          prizes={group?.prizes ?? null}
          winnersByChallenge={winnersByChallenge}
          onClose={() => setWrapOpen(false)}
        />
      )}

      {/* Hoja de invitar al viaje (reusa el InviteModal de la GroupPage clásica):
          preview de marca + Web Share / copiar / WhatsApp con el enlace LIMPIO
          (`…/v/<code>`) que genera la tarjeta OG. */}
      <InviteModal
        open={inviting}
        onClose={() => setInviting(false)}
        groupId={groupId}
        groupName={title}
        link={tripShareUrl(location.origin, groupId)}
        challengeCount={challengeCount}
      />
    </div>
  )
}
