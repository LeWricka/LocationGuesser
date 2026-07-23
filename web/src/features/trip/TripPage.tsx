import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  CircleUser,
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
import {
  Badge,
  ChallengePhoto,
  EmptyState,
  Icon,
  IconDiana,
  TripRouteSkeleton,
  useReducedMotion,
  useToast,
} from '../../ui'
import { AppHeader } from '../../ui/AppHeader'
import { BottomSheet } from '../../ui/BottomSheet'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { useSession } from '../../lib/session-context'
import { getGroupMembers, isMember, myGroups } from '../../lib/membership'
import { getChallenge, type ChallengeForPlay } from '../../lib/challenges'
import { tripShareUrl } from '../../lib/shareLinks'
import { marcadorGroupHash, promoteChallengeHash } from '../../lib/route'
import { gotoProfile } from '../home/navigation'
import { isMomentPhotoVisible, pairedChallengeByMemoryId, type Moment } from '../../lib/trip'
import { EXAMPLE_TRIP_GROUP_ID, EXAMPLE_TRIP_SUBTITLE } from '../../lib/exampleTrip'
import { EditChallenge } from '../group/EditChallenge'
import { InviteModal } from '../group/InviteModal'
import { MembersModal } from '../group/MembersModal'
import { GroupSettingsModal, type SettingsSection } from '../group/GroupSettingsModal'
import { ShareLeaderboardModal } from '../group/ShareLeaderboardModal'
import { useTripData } from './useTripData'
import { TripDiario } from './TripDiario'
import { BitacoraTab } from './BitacoraTab'
import { MarcadorTab } from './MarcadorTab'
import { ChallengeDetail } from './ChallengeDetail'
import { TripWrap } from './TripWrap'
import { MomentSheet } from './MomentSheet'
import { ShareChallengeModal } from './ShareChallengeModal'
import { PushOptInPrompt } from './PushOptInPrompt'
import {
  CoachMark,
  CreadorIntroFrame,
  CreadorNudge,
  GuestRegisterPrompt,
  GuidedTour,
  useCreadorOnboarding,
  type TourStep,
} from '../onboarding'
// Alta real reutilizable (issue #891): la usa el cierre del tour del reto
// compartido (registro opcional) y el gate del "+" para anónimos.
import { AccountUpgradeModal } from '../auth'
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
  /**
   * Solo viaje de EJEMPLO servido a un VISITANTE SIN sesión desde la landing
   * (issue #916, `#g=ejemplo&tour=1&from=landing`): al cerrar la guía conducida,
   * en vez de navegar a `#nuevo` (que exige sesión), invitamos a REGISTRARSE. Lo
   * cablea App al flujo de auth. Sin esta prop, el cierre se comporta como
   * siempre (usuario logueado: → Crear viaje o cierre neutro).
   */
  onExampleRegister?: () => void
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
 * menú ⋯ tiene contenido FIJO (Miembros · Marcador · Ajustes · Cerrar viaje · Borrar),
 * el FAB "＋" (abajo-derecha) es el ÚNICO punto de crear (Recuerdo / Reto) y el FAB
 * "Compartir" (abajo-izquierda, issue #758 — misma posición/aspecto en los 3 tabs,
 * para cualquier miembro) abre Invitar al viaje / Compartir un reto / Compartir
 * clasificación: derecha crea, izquierda comparte.
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
  onExampleRegister,
}: Props) {
  // `isAnonymous` (issue #888): gatea los dos FABs flotantes (crear/compartir)
  // más abajo — un receptor anónimo que juega un reto se hace miembro (RLS) y
  // veía el "+" aunque crear/compartir de verdad sigan bloqueados/no le tocan.
  const { user, profile, isAnonymous } = useSession()
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

  // Viaje de EJEMPLO (onboarding nuevo, pieza 4/4): SOLO LECTURA — sin FAB de
  // crear/compartir, sin menú de miembros/ajustes, sin jugar de verdad. El
  // groupId centinela (`lib/exampleTrip.ts`) ya hace que `useTripData` sirva
  // datos curados sin red; aquí solo gobierna qué acciones de escritura se
  // capan y el marco "Ejemplo" de la cabecera.
  const isExampleTrip = groupId === EXAMPLE_TRIP_GROUP_ID

  // Sección activa (diario|marcador). Gobierna el desplazamiento de la pista.
  const [section, setSection] = useState<Section>(initialSection)
  // La sección se refleja en la URL (`&v=marcador`/`&v=fotos`) para que
  // REFRESCAR conserve la pestaña: sin esto, F5 en Marcador te devolvía a
  // Diario porque el estado solo vivía en React. `replaceState` a propósito:
  // no crea entradas de historial (atrás sigue saliendo del viaje, no
  // recorriendo pestañas) ni emite `hashchange` (no re-dispara el router).
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    // Solo se toca `v`: pisar el hash entero borraría parámetros de flujos
    // vivos (`add=…`, `adm=…`) o de otra ruta si el viaje está de salida.
    if (params.get('g') !== groupId) return
    if (section === 'diario') params.delete('v')
    else params.set('v', section)
    const hash = `#${params.toString()}`
    if (window.location.hash !== hash) {
      window.history.replaceState(window.history.state, '', hash)
    }
  }, [section, groupId])
  // Momento abierto en la hoja de detalle (null = cerrada).
  const [openMoment, setOpenMoment] = useState<Moment | null>(null)
  // Detalle de UN reto abierto desde "Retos anteriores" del Marcador (issue
  // #800): clasificación + mapa de jugadas + foto. Null = cerrado. Solo se
  // abre para un CERRADO o un EN JUEGO ya jugado — el anti-spoiler (un EN
  // JUEGO sin jugar) lo decide `MarcadorTab` llamando a `onPlayChallenge` en
  // su lugar, nunca a este estado.
  const [viewingChallengeId, setViewingChallengeId] = useState<string | null>(null)
  // Mismo patrón que la sección (#835): detalle de reto (`ver=`) y hoja de
  // momento (`m=`) se reflejan en el hash para que F5 no cierre lo que estabas
  // mirando. Los ids pedidos por la URL al montar se guardan aparte y se
  // CONSUMEN una sola vez cuando llegan los datos — no antes, porque restaurar
  // el detalle exige pasar por la guarda anti-spoiler (que necesita
  // `pastChallenges`) y la hoja necesita el `Moment` completo.
  const pendingFromUrl = useRef(
    (() => {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      return { ver: params.get('ver'), m: params.get('m') }
    })(),
  )
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    if (params.get('g') !== groupId) return
    if (viewingChallengeId) params.set('ver', viewingChallengeId)
    else if (!pendingFromUrl.current.ver) params.delete('ver')
    if (openMoment) params.set('m', openMoment.challengeId)
    else if (!pendingFromUrl.current.m) params.delete('m')
    const hash = `#${params.toString()}`
    if (window.location.hash !== hash) {
      window.history.replaceState(window.history.state, '', hash)
    }
  }, [viewingChallengeId, openMoment, groupId])
  // "Compartir reto" (issue #739): reto suelto a compartir desde su detalle
  // (null = modal cerrado). El imagePath ya viene filtrado por el anti-spoiler
  // de `isMomentPhotoVisible` (ver el botón en MomentSheet más abajo): una foto
  // SORPRESA nunca llega aquí, ni siquiera si el que comparte es quien creó el
  // reto (compartirlo destriparía la sorpresa al resto del grupo). `origin`
  // (issue #758) distingue en analítica desde dónde se abrió: la hoja "Compartir"
  // nueva ('share_fab'), el icono de 1 tap del carrusel ('diario_card') o el
  // detalle del momento (undefined, entrada previa sin etiquetar).
  const [sharingChallenge, setSharingChallenge] = useState<{
    id: string
    title: string
    // Tipo del reto (issue #880): decide el placeholder sin foto de la
    // tarjeta. Fallback a 'location' si el momento no lo trae (recuerdo
    // legado sin `challengeKind`, no debería llegar aquí en la práctica).
    kind: 'location' | 'number'
    imagePath: string | null
    origin?: string
  } | null>(null)
  // Reto en edición a pantalla completa (null = no editando). Editar un reto toca su
  // mecánica (plazo, Street View, votos), así que reutilizamos el editor completo
  // `EditChallenge` montado aquí en vez de hacerlo dentro de la hoja.
  const [editingChallenge, setEditingChallenge] = useState<ChallengeForPlay | null>(null)
  // Momento seleccionado (centra su pin en el mapa). Se sincroniza carrusel↔mapa.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // ¿Puede el usuario crear momentos/retos? (issue #783: cualquier MIEMBRO, ya
  // no solo el dueño — el RLS `challenges_insert_member` lo respalda igual). Es
  // siempre true una vez `reloadMembership` confirma la membresía.
  const [canCreate, setCanCreate] = useState(false)
  // ¿Es DUEÑO del viaje? (premios, ajustes, cerrar/reabrir, borrar, enlace de
  // co-dueño, editar/borrar momentos ajenos). Antes era lo que calculaba
  // `canCreate`; separado en el issue #783 porque crear ya no es de dueño.
  const [isOwner, setIsOwner] = useState(false)
  const [memberNames, setMemberNames] = useState<string[]>([])

  // Anclas de GuidedTour (viaje de ejemplo, onboarding nuevo pieza 4/4): un
  // elemento REAL por parada del recorrido — el mapa a sangre del Diario, la
  // primera tarjeta de momento, el primer día de la Bitácora, el podio, "El
  // camino" y su primer hito. Existen SIEMPRE (no solo con la guía activa):
  // son refs vacías y baratas hasta que algo las asigna, y así no hace falta
  // montar/desmontar el árbol de refs al arrancar/parar el tour.
  const diarioMapRef = useRef<HTMLDivElement>(null)
  const firstMomentRef = useRef<HTMLDivElement>(null)
  const bitacoraFirstDayRef = useRef<HTMLElement>(null)
  const podioRef = useRef<HTMLOListElement>(null)
  const caminoWrapRef = useRef<HTMLDivElement>(null)
  const firstHitoRef = useRef<HTMLLIElement>(null)
  // Guía activa: solo tiene sentido en el viaje de ejemplo, y solo se arranca
  // por `#g=ejemplo&tour=1` (ver `lib/route.ts`, `exampleTripHash`) o desde el
  // botón "Ver un viaje de ejemplo" del perfil, ya dentro del propio viaje. Se
  // CONSUME una sola vez del hash al montar (mismo criterio que `pendingFromUrl`
  // de arriba): una recarga posterior no debe relanzar la guía sola.
  const [tourActive, setTourActive] = useState(() => {
    if (groupId !== EXAMPLE_TRIP_GROUP_ID) return false
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    return params.get('tour') === '1'
  })
  // Recorrido lanzado desde la bienvenida del usuario NUEVO (issue #905,
  // `&nuevo=1`): el cierre de la guía remata con "Ahora crea el tuyo" → Crear
  // viaje, en vez del cierre neutro de "Ver un viaje de ejemplo" del perfil. Se
  // lee UNA vez al montar (solo tiene sentido junto a `tour=1` del ejemplo).
  const [tourFromNewUser] = useState(() => {
    if (groupId !== EXAMPLE_TRIP_GROUP_ID) return false
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    return params.get('tour') === '1' && params.get('nuevo') === '1'
  })
  // Recorrido lanzado por un VISITANTE SIN sesión desde la landing (issue #916,
  // `&from=landing`): el cierre de la guía invita a REGISTRARSE (ver `onFinish`
  // abajo) en vez de navegar a `#nuevo` (que exige sesión). Se lee UNA vez al
  // montar, igual que `tourFromNewUser`; solo tiene sentido junto a `tour=1`.
  const [tourFromLanding] = useState(() => {
    if (groupId !== EXAMPLE_TRIP_GROUP_ID) return false
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    return params.get('tour') === '1' && params.get('from') === 'landing'
  })
  useEffect(() => {
    if (!tourActive) return
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    if (params.get('g') !== groupId || !params.has('tour')) return
    params.delete('tour')
    // `nuevo` se consume junto a `tour` (ya lo leímos en `tourFromNewUser`): una
    // recarga posterior no debe re-arrancar la guía ni el remate de "crea el tuyo".
    params.delete('nuevo')
    // `from=landing` se consume igual (ya leído en `tourFromLanding`); solo el
    // marcador de la landing, nunca un `from=<momentId>` de reto (no aplica al
    // ejemplo, que no tiene `add=reto`).
    if (params.get('from') === 'landing') params.delete('from')
    window.history.replaceState(window.history.state, '', `#${params.toString()}`)
    // Solo al arrancar la guía (una vez): no queremos re-escribir el hash en
    // cada render mientras `tourActive` sigue en true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Coach-mark de ENTRADA al Marcador (issue #886): quien aterriza aquí desde la
  // guía del reto compartido (`&guide=marcador`, ver `RetoShareGuide`) recibe UN
  // coach-mark que señala la clasificación real (el podio). Se CONSUME una sola
  // vez del hash al montar (mismo criterio que `tourActive`): una recarga no lo
  // relanza. No es una guía conducida cruzando de ruta —eso sería frágil—, solo
  // un remate independiente en el destino.
  const [marcadorGuideActive, setMarcadorGuideActive] = useState(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    return params.get('g') === groupId && params.get('guide') === 'marcador'
  })
  useEffect(() => {
    if (!marcadorGuideActive) return
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    if (params.get('g') !== groupId || !params.has('guide')) return
    params.delete('guide')
    window.history.replaceState(window.history.state, '', `#${params.toString()}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tour del RETO COMPARTIDO en el viaje REAL (issue #891): quien acaba de jugar
  // su primer reto suelto como anónimo pulsa "Siguiente" en el revelado y aterriza
  // aquí con `#g=…&tour=reto`. Recorre Diario → Bitácora → Marcador sobre las
  // pantallas de verdad y remata con un registro opcional. Distinto del `tour=1`
  // del viaje de EJEMPLO (que sigue igual): este es para un viaje real.
  //
  // A DIFERENCIA de `tourActive`/`marcadorGuideActive`, NO consumimos el flag del
  // hash al montar: la pantalla del viaje puede remontarse una vez (la bienvenida
  // del receptor resuelve async si envolver en OnboardingGate), y si ya lo
  // hubiéramos borrado el tour se perdería. Lo dejamos en el hash MIENTRAS corre y
  // lo limpiamos al terminar/saltar; un remonte temprano solo reinicia el tour en
  // su primer paso (invisible), y tras terminar una recarga ya no lo relanza.
  const [retoTourActive, setRetoTourActive] = useState(() => {
    if (isExampleTrip) return false
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    return params.get('g') === groupId && params.get('tour') === 'reto'
  })
  // Reto de RETORNO (issue #895): el revelado del reto pasa su id en `rc` al
  // arrancar el tour (`#g=…&tour=reto&rc=<challengeId>`). Al terminar/saltar
  // volvemos a ESE revelado (`#g=…&c=<challengeId>`), no al Marcador — así el
  // usuario recupera su resultado. `rc` (no `c`) a propósito: `c` abriría
  // PlayChallenge de inmediato y cortaría el tour. Se lee UNA vez al montar y se
  // conserva mientras corre el tour; sin `rc` (p.ej. el tour del ejemplo) el
  // cierre mantiene el comportamiento de siempre (queda en el Marcador).
  const [retoReturnChallengeId] = useState(() => {
    if (isExampleTrip) return null
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    if (params.get('g') !== groupId || params.get('tour') !== 'reto') return null
    return params.get('rc')
  })
  // Tour de BIENVENIDA en el viaje (issue #901): quien llega por un enlace de
  // VIAJE (no de reto) y ve la intro del receptor (`GuestWelcomeFrame`), al
  // pulsar "Ver el viaje" arranca aquí un recorrido Diario → Bitácora → retos que
  // remata en el Diario. Mismo motor que `tour=reto` (`GuidedTour`), pero más
  // corto y sin registro. A DIFERENCIA de `retoTourActive`, esta pantalla YA está
  // montada cuando `ReceptorWelcomeGate` fija `tour=bienvenida` en el hash (la
  // intro es un overlay ENCIMA de este viaje, no una ruta aparte), así que además
  // de leerlo al montar (por si una recarga lo trae mientras corre) escuchamos el
  // `hashchange` para arrancarlo en cuanto el gate lo fije. No consumimos el flag
  // del hash hasta terminar (mismo criterio que `retoTourActive`): una recarga
  // durante el tour lo reanuda; al terminar/saltar se limpia y ya no reaparece.
  const [bienvenidaTourActive, setBienvenidaTourActive] = useState(() => {
    if (isExampleTrip) return false
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    return params.get('g') === groupId && params.get('tour') === 'bienvenida'
  })
  useEffect(() => {
    if (isExampleTrip) return
    const onHashChange = () => {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      if (params.get('g') === groupId && params.get('tour') === 'bienvenida') {
        setBienvenidaTourActive(true)
      }
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [groupId, isExampleTrip])

  // Cierre del tour del reto: registro opcional (`GuestRegisterPrompt`) y, tras
  // "Crear cuenta", el alta real (`AccountUpgradeModal`). Ambos dejan al usuario
  // en el Marcador (donde acaba el tour).
  const [retoRegisterOpen, setRetoRegisterOpen] = useState(false)
  const [retoUpgradeOpen, setRetoUpgradeOpen] = useState(false)
  // Gate del "+" para anónimos (issue #891): el FAB vuelve a verse, pero al
  // tocarlo pedimos cuenta (no el menú Momento/Reto, que no puede completar).
  const [anonCreateOpen, setAnonCreateOpen] = useState(false)

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
  // Nodo REAL del botón "+" (no el wrap): el coach-mark del onboarding del
  // creador (pieza 3/4) lo resalta anclándose a este mismo elemento.
  const fabButtonRef = useRef<HTMLButtonElement>(null)
  // Nodo REAL de la barra Diario·Bitácora·Marcador: el remate del onboarding
  // del creador (pieza 3/4) se ancla aquí en vez de flotar como un banner
  // suelto — señala las 3 pestañas que acaba de nombrar en su copy.
  const tabBarRef = useRef<HTMLDivElement>(null)

  // Menú ⋯ de la cabecera (hoja inferior con acciones fijas del viaje).
  const [menuOpen, setMenuOpen] = useState(false)
  // Invitar al viaje: hoja de compartir (reusa InviteModal). Es SIEMPRE
  // accesible (P0): cualquier miembro puede repartir el enlace. Se abre desde
  // varios sitios (CTAs del vacío, Miembros, la hoja "Compartir" nueva); `inviteOrigin`
  // (issue #758) guarda desde cuál para etiquetar la analítica, y se resetea en
  // CADA apertura (openInvite) para que no quede un valor de una apertura previa.
  const [inviting, setInviting] = useState(false)
  const [inviteOrigin, setInviteOrigin] = useState<string | undefined>(undefined)
  const openInvite = (origin?: string) => {
    // Viaje de ejemplo: no hay nada real que invitar (el enlace apuntaría a un
    // groupId centinela). Defensa en profundidad — hoy ningún CTA visible
    // llama a esto en el viaje de ejemplo (FAB/menú ocultos, ver más abajo).
    if (isExampleTrip) return
    setInviteOrigin(origin)
    setInviting(true)
  }
  // Hoja "Compartir" del viaje (issue #758): FAB abajo-izquierda, espejo del "＋"
  // de crear, visible en los 3 tabs para CUALQUIER miembro. `shareView` alterna
  // entre la lista de acciones ('root') y el selector de reto cuando hay más de
  // uno en juego ('pick'); se resetea a 'root' en cada apertura/cierre.
  const [shareOpen, setShareOpen] = useState(false)
  const [shareView, setShareView] = useState<'root' | 'pick'>('root')
  const closeShareSheet = () => {
    setShareOpen(false)
    setShareView('root')
  }
  // "Compartir clasificación" (issue #758, rescatado del FAB que vivía en
  // MarcadorTab, issue #608): ahora es un item de la hoja "Compartir" del
  // viaje, montado aquí porque ya tenemos leaderboard/prizes/groupName.
  const [sharingLeaderboard, setSharingLeaderboard] = useState(false)
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
  // propios permisos (isOwner) sin cambiar groupId/user.
  const reloadMembership = useCallback(async () => {
    // Viaje de ejemplo: nunca hay una membresía real que resolver — se queda
    // con los valores por defecto (canCreate/isOwner en false), que es
    // exactamente lo que capa el FAB de crear y las acciones de dueño.
    if (isExampleTrip) return
    if (!user) return
    try {
      const member = await isMember(groupId, user.id)
      if (!member) return
      const [mine, members] = await Promise.all([myGroups(user.id), getGroupMembers(groupId)])
      // Issue #783: crear ya es de cualquier MIEMBRO — `isMember` de arriba ya lo
      // confirmó, así que canCreate es simplemente true a partir de aquí.
      setCanCreate(true)
      setIsOwner(mine.find((g) => g.id === groupId)?.isOwner ?? false)
      setMemberNames(members.map((m) => m.name))
    } catch {
      // Permisos/miembros no resueltos: tratamos como miembro sin gestión.
    }
  }, [groupId, user, isExampleTrip])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reloadMembership es async: setState corre tras el fetch, no síncrono
    void reloadMembership()
  }, [reloadMembership])

  const activeMoment = useMemo(() => moments.find((m) => m.status === 'active') ?? null, [moments])
  // Id a AUTO-SELECCIONAR al abrir el viaje (issue #839): si el reto EN JUEGO
  // está FUSIONADO en su recuerdo (`TripDiario`, `fuseMemoryWithChallenge`), el
  // carrusel/timeline ya no pintan SU id — pintan el del recuerdo. Sin esto,
  // `selectFromMap`/`scrollCardIntoView` de abajo apuntarían a un `data-cid`
  // que ya no existe (el reto asociado no se pinta suelto).
  const activeSelectId = useMemo(() => {
    if (!activeMoment) return null
    for (const [memoryId, challenge] of pairedChallengeByMemoryId(moments)) {
      if (challenge.challengeId === activeMoment.challengeId) return memoryId
    }
    return activeMoment.challengeId
  }, [activeMoment, moments])
  // Nº de RETOS (no recuerdos) para el preview de la hoja de invitar.
  const challengeCount = useMemo(() => moments.filter((m) => m.isChallenge).length, [moments])
  // Retos EN JUEGO (issue #758): gobierna el item "Compartir un reto" de la hoja
  // "Compartir" — oculto sin ninguno, directo a `ShareChallengeModal` con uno,
  // selector con miniaturas con varios. Un reto CERRADO no aparece aquí: ya no
  // se juega, compartirlo no lleva a ninguna acción (mismo criterio que
  // `ShareChallengeModal`, que solo tiene sentido con el reto en juego).
  const activeChallenges = useMemo(() => moments.filter((m) => m.status === 'active'), [moments])
  const hasLeaderboard = leaderboard.length > 0

  // Onboarding del CREADOR — aprender-haciendo (pieza 3/4): solo aplica al
  // DUEÑO de un viaje que aún no completó (ni saltó) esta guía en su cuenta;
  // el paso a mostrar se deriva de los datos reales del viaje (nº de momentos,
  // si ya hay un reto), no de una pantalla-lista aparte — ver useCreadorOnboarding.
  const creador = useCreadorOnboarding(
    user?.id,
    profile?.onboarding,
    isOwner,
    moments.length,
    challengeCount > 0,
  )

  // Solo lectura del viaje de ejemplo (onboarding nuevo, pieza 4/4): jugar de
  // verdad o abrir el detalle de un reto pegarían a Supabase con un
  // `challengeId`/`groupId` que no existen — en vez de eso, un aviso discreto.
  // Envuelven `onPlayChallenge`/`setViewingChallengeId` en el ÚNICO punto que
  // los dispara (esta función y los usos de más abajo), así que el resto del
  // viaje sigue siendo un browse normal, solo sin acción real al fondo.
  const handlePlayChallenge = useCallback(
    (challengeId: string) => {
      if (isExampleTrip) {
        toast.show('Es un viaje de ejemplo: aquí no se juega de verdad.')
        return
      }
      onPlayChallenge(challengeId)
    },
    [isExampleTrip, onPlayChallenge, toast],
  )
  const handleViewChallenge = useCallback(
    (challengeId: string) => {
      if (isExampleTrip) {
        toast.show('Es un viaje de ejemplo: no hay detalle real que ver.')
        return
      }
      setViewingChallengeId(challengeId)
    },
    [isExampleTrip, toast],
  )

  // Tocar un RETO desde la Bitácora (issue #822): MISMO anti-spoiler que "Retos
  // anteriores" del Marcador — un EN JUEGO sin jugar va a JUGAR (nunca al
  // detalle, que revelaría el mapa antes de tiempo); cualquier otro (cerrado, en
  // juego ya jugado) abre el detalle completo. `pastChallenges` no cubre los de
  // PRÁCTICA (a propósito, "no son parte del recorrido") — sin resumen, cae al
  // detalle: `ChallengeDetail` ya se defiende sola si la RLS no sirve la
  // respuesta (nota, no revienta), así que no hace falta duplicar aquí esa guarda.
  const openChallengeFromBitacora = useCallback(
    (challengeId: string) => {
      const summary = pastChallenges.find((p) => p.challengeId === challengeId)
      const antiSpoiler = summary?.status === 'active' && summary.myResult == null
      if (antiSpoiler) handlePlayChallenge(challengeId)
      else handleViewChallenge(challengeId)
    },
    [pastChallenges, handlePlayChallenge, handleViewChallenge],
  )

  // Restaura lo que la URL pedía al montar (`ver=`/`m=`, F5 con algo abierto),
  // una sola vez y SOLO cuando hay datos: el detalle pasa por la misma guarda
  // anti-spoiler que un click (un EN JUEGO sin jugar manda a jugar, no al
  // detalle) y la hoja necesita encontrar su `Moment` completo.
  useEffect(() => {
    if (loading) return
    const pending = pendingFromUrl.current
    if (pending.m) {
      const momento = moments.find((x) => x.challengeId === pending.m)
      pending.m = null
      if (momento) setOpenMoment(momento)
    }
    if (pending.ver) {
      const id = pending.ver
      pending.ver = null
      openChallengeFromBitacora(id)
    }
  }, [loading, moments, openChallengeFromBitacora])

  // Viaje de ejemplo: su "gente" es fija (`EXAMPLE_TRIP_SUBTITLE`), sin "Tú" —
  // quien lo mira no es miembro de este viaje curado, a diferencia de uno real
  // (donde `membersLine` SÍ antepone "Tú" porque la sesión ya es miembro).
  const subtitle = useMemo(
    () =>
      isExampleTrip
        ? EXAMPLE_TRIP_SUBTITLE
        : membersLine(memberNames, profile?.display_name ?? null),
    [isExampleTrip, memberNames, profile],
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
    if (didAutoSelect.current || selectedId || !activeSelectId) return
    didAutoSelect.current = true
    selectFromMap(activeSelectId)
    scrollCardIntoView(activeSelectId)
    // selectFromMap es estable; no lo listamos para no re-disparar la auto-selección.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSelectId, selectedId])

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

  // Abre "Compartir reto" para UN momento (issue #739/#758): centraliza el
  // filtro anti-spoiler (`isMomentPhotoVisible`) que antes vivía solo en línea
  // en `onShareChallenge` de `MomentSheet` — ahora lo reutilizan también el
  // icono de 1 tap del carrusel (`TripDiario`) y la hoja "Compartir" nueva.
  const openShareChallenge = (moment: Moment, origin?: string) => {
    setSharingChallenge({
      id: moment.challengeId,
      title: moment.title,
      kind: moment.challengeKind ?? 'location',
      imagePath: isMomentPhotoVisible(moment) ? moment.imagePath : null,
      origin,
    })
  }

  // Editar un RETO: cargamos su fila completa (sin la respuesta oculta; el editor
  // la pide aparte con derecho del dueño) y abrimos el editor a pantalla completa.
  // La hoja se cierra para que el editor sea el foco. Falla en silencio con aviso.
  const openChallengeEditor = async (challengeId: string) => {
    // Defensa en profundidad: `isOwner` (false en el ejemplo) ya oculta la
    // acción "Editar" en la hoja del momento, así que esto no debería
    // disparase nunca desde la UI del viaje de ejemplo.
    if (isExampleTrip) return
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

  // Guía CONDUCIDA del viaje de ejemplo (onboarding nuevo, pieza 4/4): recorre
  // Diario (el mapa) → un momento → Bitácora → Marcador/Retos → La liga → un
  // reto, cambiando de pestaña entre pasos (`onBeforeShow: () => setSection(…)`)
  // y anclando cada paso a un elemento REAL (ver los refs de arriba). `GuidedTour`
  // es genérico: esta lista es la ÚNICA pieza que sabe de "viaje"/pestañas.
  const tourSteps: TourStep[] = useMemo(
    () => [
      {
        targetRef: diarioMapRef,
        step: 'El Diario',
        title: 'Cada parada, en su sitio',
        ariaLabel: 'Cada parada, en su sitio',
        body: 'Cada parada del viaje queda aquí, en el Diario.',
        onBeforeShow: () => setSection('diario'),
      },
      {
        targetRef: firstMomentRef,
        step: 'Un momento',
        title: 'Guarda cualquier cosa',
        ariaLabel: 'Guarda cualquier cosa',
        body: 'Una foto, un vídeo o una nota de voz, con su sitio.',
        onBeforeShow: () => setSection('diario'),
      },
      {
        targetRef: bitacoraFirstDayRef,
        step: 'La Bitácora',
        title: 'Todo el viaje, en orden',
        ariaLabel: 'Todo el viaje, en orden',
        body: 'En la Bitácora lo hojeas entero, en orden.',
        onBeforeShow: () => setSection('fotos'),
      },
      {
        targetRef: caminoWrapRef,
        step: 'El Marcador',
        title: 'Aquí se juega',
        ariaLabel: 'Aquí se juega',
        body: 'Los retos del viaje: aquí se juega.',
        onBeforeShow: () => setSection('marcador'),
      },
      {
        targetRef: podioRef,
        step: 'La liga',
        title: 'Quién va ganando',
        ariaLabel: 'Quién va ganando',
        body: 'Y quién va ganando.',
        onBeforeShow: () => setSection('marcador'),
      },
      {
        targetRef: firstHitoRef,
        step: 'Un reto',
        title: 'Así se juega uno',
        ariaLabel: 'Así se juega uno',
        body: 'Así se juega uno.',
        onBeforeShow: () => setSection('marcador'),
      },
    ],
    // Los refs son estables (useRef); setSection también lo es (setter de
    // useState) — el linter ya los reconoce como tal, así que no hace falta
    // recalcular la lista por render.
    [],
  )

  // Pasos del tour del RETO COMPARTIDO (issue #891): TRES pantallas reales del
  // viaje, una por pestaña — Diario → Bitácora → Marcador. Más corto que el del
  // ejemplo (aquí quien lo ve acaba de jugar un reto, no necesita el recorrido
  // completo). LOS TRES pasos son `blocking` (issue #895): además de evitar que
  // el toque se cuele al mapa/globo vivo (Leaflet), el scrim bloqueante atenúa el
  // fondo con textura para que la burbuja del coach-mark se lea sobre él.
  const retoTourSteps: TourStep[] = useMemo(
    () => [
      {
        targetRef: diarioMapRef,
        step: 'El Diario',
        title: 'El viaje entero',
        ariaLabel: 'El viaje entero',
        body: 'Este reto es una parada de un viaje. Cada parada queda aquí, en el Diario.',
        onBeforeShow: () => setSection('diario'),
        blocking: true,
      },
      {
        targetRef: bitacoraFirstDayRef,
        step: 'La Bitácora',
        title: 'Todo el viaje, en orden',
        ariaLabel: 'Todo el viaje, en orden',
        body: 'En la Bitácora lo hojeas entero, día a día.',
        onBeforeShow: () => setSection('fotos'),
        blocking: true,
      },
      {
        targetRef: podioRef,
        step: 'El Marcador',
        title: 'Aquí se juega',
        ariaLabel: 'Aquí se juega',
        body: 'Los retos del viaje y quién va ganando, reto tras reto.',
        onBeforeShow: () => setSection('marcador'),
        blocking: true,
      },
    ],
    [],
  )

  // Pasos del tour de BIENVENIDA (issue #901): TRES pantallas reales del viaje,
  // una por pestaña — Diario → Bitácora → Marcador. Igual de fino que el tour del
  // reto (mismos refs, `blocking` en los tres para leer bien sobre el fondo con
  // textura y no colar el toque al mapa vivo), pero con copy de "presentar el
  // viaje" a quien acaba de entrar por el enlace, no de "ya has jugado".
  const bienvenidaTourSteps: TourStep[] = useMemo(
    () => [
      {
        targetRef: diarioMapRef,
        step: 'El Diario',
        title: 'El Diario',
        ariaLabel: 'El Diario',
        body: 'Dónde queda cada parada del viaje.',
        onBeforeShow: () => setSection('diario'),
        blocking: true,
      },
      {
        targetRef: bitacoraFirstDayRef,
        step: 'La Bitácora',
        title: 'La Bitácora',
        ariaLabel: 'La Bitácora',
        body: 'El viaje entero, día a día.',
        onBeforeShow: () => setSection('fotos'),
        blocking: true,
      },
      {
        targetRef: podioRef,
        step: 'Los retos',
        title: 'Los retos',
        ariaLabel: 'Los retos',
        body: 'Juegas a adivinar dónde es cada parada; aquí ves quién va ganando.',
        onBeforeShow: () => setSection('marcador'),
        blocking: true,
      },
    ],
    [],
  )

  // Limpia `tour=reto` del hash (preservando el resto): tras terminar/saltar, una
  // recarga no debe relanzar el tour. Igual criterio que `tourActive`, pero
  // aplazado al final (ver el comentario de `retoTourActive`).
  const clearRetoTourHash = useCallback(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    if (params.get('tour') !== 'reto') return
    params.delete('tour')
    window.history.replaceState(window.history.state, '', `#${params.toString()}`)
  }, [])

  // Vuelve al REVELADO del reto de retorno (issue #895): `#g=…&c=<challengeId>`.
  // Para un reto ya votado, PlayChallenge muestra directamente el resultado — el
  // usuario recupera su jugada de donde salió, en vez de quedar en el Marcador.
  const goToRetoReveal = useCallback(() => {
    if (!retoReturnChallengeId) return false
    location.hash = `#g=${encodeURIComponent(groupId)}&c=${encodeURIComponent(retoReturnChallengeId)}`
    return true
  }, [retoReturnChallengeId, groupId])

  // Fin del tour: ofrece el registro (saltable). Con `rc` (reto de retorno) NO
  // dejamos en el Marcador: al CERRAR el registro volvemos al revelado (ver
  // `closeRetoRegister`). Sin `rc` (tour del ejemplo u origen sin reto), queda en
  // el Marcador como siempre.
  const handleRetoTourFinish = useCallback(() => {
    setRetoTourActive(false)
    clearRetoTourHash()
    if (!retoReturnChallengeId) setSection('marcador')
    setRetoRegisterOpen(true)
  }, [clearRetoTourHash, retoReturnChallengeId])

  // "Saltar" en cualquier paso: SIN registro. Con `rc`, directo al revelado del
  // reto; sin `rc`, al Marcador (comportamiento de siempre).
  const handleRetoTourSkip = useCallback(() => {
    setRetoTourActive(false)
    clearRetoTourHash()
    if (!goToRetoReveal()) setSection('marcador')
  }, [clearRetoTourHash, goToRetoReveal])

  // Cierre del registro del tour (issue #895): tanto "Ahora no" como completar el
  // alta cierran los diálogos y, si hay reto de retorno, vuelven a su revelado.
  const closeRetoRegister = useCallback(() => {
    setRetoUpgradeOpen(false)
    setRetoRegisterOpen(false)
    goToRetoReveal()
  }, [goToRetoReveal])

  // Fin/salto del tour de BIENVENIDA (issue #901): SIN registro ni reto de
  // retorno — solo dejamos al usuario en el DIARIO (la portada del viaje) y
  // limpiamos `tour=bienvenida` del hash para que una recarga no lo relance.
  // "Terminar" y "Saltar" hacen lo mismo: no hay nada más que ofrecer al cerrar.
  const handleBienvenidaTourFinish = useCallback(() => {
    setBienvenidaTourActive(false)
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    if (params.get('tour') === 'bienvenida') {
      params.delete('tour')
      window.history.replaceState(window.history.state, '', `#${params.toString()}`)
    }
    setSection('diario')
  }, [])

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
    // Esqueleto compartido con el fallback de `<Suspense>` de App.tsx
    // (`TripRouteSkeleton`, issue "entrada al viaje sin flashazo"): antes este
    // `if` pintaba su PROPIO esqueleto inline, en tonos de papel — un segundo
    // esqueleto, de otro color, para la MISMA espera (el "doble esqueleto" que
    // reportó el dueño: tarjetas blancas sobre la escena oscura del viaje).
    // Reusar el mismo componente aquí y en App.tsx los hace coherentes por
    // construcción, no por mantenimiento manual en paralelo.
    //
    // `key="loading"` (issue #623): sin él, React puede reconciliar el árbol de
    // esta rama contra el del contenido real en la misma posición y reutilizar
    // nodos entre dos formas MUY distintas de layout (el bug de CLS ~0.066 que
    // motivó la key). El tipo de elemento raíz ya cambia (`main` aquí vs `div`
    // del contenido, ver más abajo), pero se deja explícita por claridad y como
    // red de seguridad si el contenido cambia de raíz en el futuro.
    return <TripRouteSkeleton key="loading" ariaLabel="Cargando el viaje" />
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

  // Escena OSCURA en las 3 secciones (issue #831, rediseño del Marcador):
  // Diario/Bitácora ya eran oscuras (mapa satélite / diario sobre grafito);
  // Marcador (antes papel claro) pasa a la MISMA escena oscura e inmersiva. Las
  // 3 comparten el mismo chrome de vidrio esmerilado (regla #537: sobre fondo
  // oscuro, vidrio) — ya no hace falta distinguir la escena por sección.
  return (
    <div key="trip" className={`${styles.screen} ${styles.sceneDiario} lg-content-in`}>
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
            <span className={styles.tripName}>
              {title}
              {/* Marco "Ejemplo" (onboarding nuevo, pieza 4/4): entrando desde el
                  perfil el encuadre es "Ejemplo" — el reto compartido (pieza 2/4)
                  ya enlaza "Ver el viaje" al viaje REAL de quien lo comparte, así
                  que nunca coexisten los dos marcos para un mismo viaje. */}
              {isExampleTrip && (
                <Badge tone="accent" className={styles.exampleBadge}>
                  Ejemplo
                </Badge>
              )}
            </span>
            {subtitle && <span className={styles.tripMeta}>{subtitle}</span>}
          </span>
        }
        // Sin menú ⋯ en el viaje de ejemplo: ni Miembros (no hay membresía real
        // que gestionar) ni Ajustes/Cerrar/Borrar (isOwner ya en false los
        // oculta, pero sin dueño tampoco queda nada más que ofrecer aquí).
        action={
          isExampleTrip ? undefined : (
            <button
              type="button"
              className={[styles.menuButton, 'lg-press'].join(' ')}
              onClick={() => setMenuOpen(true)}
              aria-label="Más opciones del viaje"
              aria-haspopup="dialog"
            >
              <Icon icon={MoreHorizontal} size={22} />
            </button>
          )
        }
      />
      {/* Tab Diario · Bitácora · Marcador (issue #645): el control segmentado
          conmuta de sección. Flota bajo la cabecera, centrado, sobre cada fondo
          (mapa, bitácora o papel). */}
      <div className={styles.tabs} ref={tabBarRef}>
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

      {/* Pre-prompt de push (issue #769): "¿Te avisamos cuando haya un reto
          nuevo?" — banner descartable, la superficie PRINCIPAL (cubre invitado
          nuevo y miembro existente). Comparte la misma franja flotante que la
          cinta de cierre de arriba: son mutuamente excluyentes (un viaje
          cerrado ya tiene su propio aviso ahí) así que nunca compiten por el
          hueco. `PushOptInPrompt` decide en solitario si renderiza algo
          (returns null sin condición); este wrapper solo fija la posición. */}
      {/* Issue #895: NO durante un tour (el pop-up de notis se colaba encima del
          coach-mark) ni para un ANÓNIMO (no gestiona notis en este flujo: primero
          se registra — el tour del reto remata con el alta). */}
      {!isClosed &&
        !isExampleTrip &&
        !isAnonymous &&
        !retoTourActive &&
        !tourActive &&
        !bienvenidaTourActive && (
          <div className={styles.pushBannerWrap}>
            <PushOptInPrompt surface="trip_banner" groupId={groupId} />
          </div>
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
              moments={moments}
              route={route}
              selectedId={selectedId}
              canCreate={canCreate}
              playing={reducedMotion ? undefined : playing}
              onTogglePlay={reducedMotion ? undefined : togglePlay}
              onSelectFromMap={selectFromMap}
              onExpand={(m) => setOpenMoment(m)}
              onPlay={handlePlayChallenge}
              onAddMoment={onAddMoment}
              onInvite={() => openInvite()}
              mapRef={diarioMapRef}
              firstMomentRef={firstMomentRef}
            />
          </section>
        )}
        {section === 'fotos' && (
          /* BITÁCORA (issue #645; antes "Fotos"): el diario del viaje que se
             hojea, día a día. Reusa los MISMOS `moments` ya cargados por
             useTripData (sin pedir el grupo/los retos de nuevo); "Ver el
             momento" (título o visor) de un RECUERDO abre la MISMA hoja de
             detalle que el Diario (`setOpenMoment`); un RETO abre su detalle de
             juego o el flujo de jugar (issue #822, `openChallengeFromBitacora`
             — mismo anti-spoiler que "Retos anteriores" del Marcador). Cierra
             con la clasificación general (issue #822): mismo leaderboard/prizes
             que el Marcador, "Ver marcador" salta de sección igual que
             `onViewMarcador` de `MomentSheet` más abajo. */
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
              onOpenChallenge={openChallengeFromBitacora}
              pastChallenges={pastChallenges}
              leaderboard={leaderboard}
              prizes={group?.prizes ?? null}
              onViewMarcador={() => {
                setSection('marcador')
                location.hash = marcadorGroupHash(groupId)
              }}
              firstDayRef={bitacoraFirstDayRef}
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
              onInvite={() => openInvite()}
              onAddChallenge={onAddChallenge}
              canCreate={canCreate}
              isOwner={isOwner}
              groupId={groupId}
              prizes={group?.prizes ?? null}
              pastChallenges={pastChallenges}
              // Anti-spoiler (issue #800): un EN JUEGO sin jugar va al mismo flujo
              // de jugar que "Adivina" del Diario (nunca al detalle, que
              // revelaría el mapa antes de tiempo).
              onPlayChallenge={handlePlayChallenge}
              // Cualquier otro (cerrado, o EN JUEGO ya jugado) abre el detalle
              // nuevo (clasificación + mapa de jugadas + foto) por encima del viaje.
              onViewChallenge={handleViewChallenge}
              onPrizesSaved={() => void refresh()}
              podioRef={podioRef}
              caminoWrapRef={caminoWrapRef}
              firstHitoRef={firstHitoRef}
            />
          </section>
        )}
      </div>

      {/* FAB "＋" flotante con menú de dos acciones: Momento (recuerdo) o Reto (a
          adivinar). ÚNICO punto de crear del viaje. Issue #783: CUALQUIER miembro
          (ya no solo el dueño) y siempre disponible (fijo abajo), salvo con el
          recap abierto (es una pantalla de cierre). Issue #891: el "+" vuelve a
          verse también a un ANÓNIMO (antes se ocultaba, #888) — pero al tocarlo
          NO abre el menú Momento/Reto (que RLS le bloquea): abre el alta real
          ("Regístrate para crear tus viajes"). Con cuenta, comportamiento de siempre. */}
      {canCreate && !wrapOpen && !retoTourActive && !tourActive && !bienvenidaTourActive && (
        <div className={styles.fabWrap} ref={fabWrapRef}>
          {fabOpen && !isAnonymous && (
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
            ref={fabButtonRef}
            className={`${styles.fab} ${fabOpen ? styles.fabActive : ''}`}
            onClick={() => {
              // Anónimo: pedir cuenta en vez de abrir el menú (no puede crear).
              if (isAnonymous) setAnonCreateOpen(true)
              else setFabOpen((o) => !o)
            }}
            aria-label={isAnonymous ? 'Regístrate para crear tus viajes' : 'Crear momento o reto'}
            aria-haspopup={isAnonymous ? 'dialog' : 'menu'}
            aria-expanded={isAnonymous ? undefined : fabOpen}
          >
            <Icon icon={Plus} size={26} />
          </button>
        </div>
      )}

      {/* FAB "Compartir" flotante abajo-IZQUIERDA (issue #758): espejo del "＋" de
          crear (misma posición/aspecto en los 3 tabs), pero para CUALQUIER
          miembro (sin gate de canCreate) — compartir no es una acción de dueño.
          Abre la hoja "Compartir" (Invitar al viaje / Compartir un reto /
          Compartir clasificación). Nunca dos flotantes a la vez en el mismo tab:
          sustituye al FAB de clasificación que vivía solo en Marcador (issue
          #608) y al item "Invitar" del menú ⋯. Nunca en el viaje de ejemplo
          (solo lectura): no hay nada real que invitar/compartir. Tampoco a un
          receptor ANÓNIMO (issue #888): jugar un reto suelto no debe
          convertirle en quien re-comparte el viaje/reto — ese gesto es de
          quien ya se identifica (miembro con cuenta o dueño). */}
      {!wrapOpen &&
        !isExampleTrip &&
        !isAnonymous &&
        !retoTourActive &&
        !tourActive &&
        !bienvenidaTourActive && (
          <div className={styles.shareFabWrap}>
            <button
              type="button"
              className={styles.shareFab}
              onClick={() => {
                setShareView('root')
                setShareOpen(true)
              }}
              aria-label="Compartir"
              aria-haspopup="dialog"
            >
              <Icon icon={Share2} size={24} />
            </button>
          </div>
        )}

      {/* Onboarding del CREADOR — aprender-haciendo (pieza 3/4): UN aviso cada
          vez, pegado a lo que el usuario acaba de hacer, nunca una pantalla-
          lista de pasos. `creador.stage` deriva de datos reales (moments.length,
          si ya hay un reto) — ver useCreadorOnboarding. */}
      {creador.stage === 'intro' && <CreadorIntroFrame onStart={creador.dismissIntro} />}

      {/* Issue #904: el scrim del coach vive a z-index 1100 con el hueco SOLO
          sobre el "+" (56×56) — el menú Momento/Reto que el propio "+" abre
          queda por debajo (--z-sticky=100) y tapado, así que "Momento" no se
          podía tocar y el flujo se atascaba. Ocultamos el coach mientras
          `fabOpen` para dejar el menú nítido; al cerrarlo sin elegir nada
          vuelve a aparecer (comportamiento correcto, nada que "saltarse"). */}
      {creador.stage === 'coach' && !fabOpen && (
        <CoachMark
          targetRef={fabButtonRef}
          step="Empieza aquí"
          title="Guarda tu primer momento"
          ariaLabel="Guarda tu primer momento"
          body={
            <>
              Toca <strong>+</strong> y guarda dónde estás: varias fotos, un vídeo o una nota de
              voz. Aparece aquí, en tu Diario.
            </>
          }
          onDismiss={creador.skipGuide}
        />
      )}

      {/* Antes era una tarjeta flotante translúcida: sobre el mapa satélite el
          texto se pisaba con él y no se leía (reportado en vivo). El coach-mark
          trae el mismo scrim sólido + burbuja legible que ya resuelve el paso
          "coach" de arriba, y de paso señala el "+" real — el mismo flujo de
          siempre (promoteChallengeHash) cuelga ahora de `primaryAction`. */}
      {creador.stage === 'suggest' && section === 'diario' && moments[0] && !fabOpen && (
        <CoachMark
          targetRef={fabButtonRef}
          title="¿Y si les lanzas un reto para que viajen contigo?"
          ariaLabel="¿Y si les lanzas un reto para que viajen contigo?"
          body="Tu gente adivina dónde es. Gana quien más se acerca."
          dismissLabel="Saltar"
          primaryAction={{
            label: 'Crear un reto',
            onClick: () => {
              creador.dismissSuggest()
              location.hash = promoteChallengeHash(groupId, moments[0].challengeId)
            },
          }}
          onDismiss={creador.dismissSuggest}
        />
      )}

      {creador.stage === 'share' && section === 'diario' && (
        <div className={styles.creadorNudgeWrap}>
          <CreadorNudge icon={Share2} onDismiss={creador.dismissShare}>
            Pásale el enlace a tu gente. Ven y juegan de forma directa.
          </CreadorNudge>
        </div>
      )}

      {/* Remate (último paso): antes un banner suelto abajo que nombraba
          Bitácora/Marcador sin señalarlos. Ahora nombra también el Diario y se
          ancla a la barra de pestañas real (`tabBarRef`) — el mismo motor de
          spotlight que el resto de la guía, coherente con "señala lo que
          nombra" en vez de flotar aparte. */}
      {creador.stage === 'remate' && section === 'diario' && (
        <CoachMark
          targetRef={tabBarRef}
          title="Así queda todo"
          ariaLabel="Así queda todo"
          body={
            <>
              Todo queda en tu <strong>Diario</strong> y tu <strong>Bitácora</strong>; en el{' '}
              <strong>Marcador</strong> ves quién va ganando.
            </>
          }
          // Botón "Entendido" DENTRO de la burbuja (issue #908): antes el cierre
          // era el flotante arriba-derecha, desconectado de este aviso anclado a
          // la barra de pestañas → el usuario no lo encontraba ("no me deja
          // salir"). `blocking` + `hideSkip` = un único botón claro para cerrar.
          primaryAction={{ label: 'Entendido', onClick: creador.dismissRemate }}
          hideSkip
          onDismiss={creador.dismissRemate}
          blocking
        />
      )}

      {/* Coach-mark de entrada al Marcador (issue #886): remate de la guía del
          reto compartido. Señala el podio real (la clasificación) al aterrizar.
          Solo en el Marcador y solo si el podio existe (CoachMark no pinta nada
          sin objetivo medible). Un único paso, se cierra con "Entendido". */}
      {marcadorGuideActive && section === 'marcador' && (
        <CoachMark
          targetRef={podioRef}
          step="El Marcador"
          title="Aquí va la clasificación"
          ariaLabel="Aquí va la clasificación"
          body="Quién va ganando en el viaje, reto tras reto. Debajo tienes los retos pasados y los premios."
          dismissLabel="Entendido"
          onDismiss={() => setMarcadorGuideActive(false)}
        />
      )}

      {/* Hoja "Compartir" del viaje (issue #758): mismo componente que el menú ⋯
          (`BottomSheet`, `.menu`/`.menuItem`), con dos vistas — 'root' (lista de
          acciones) y 'pick' (elegir un reto cuando hay más de uno en juego). */}
      <BottomSheet
        open={shareOpen}
        onClose={closeShareSheet}
        title={shareView === 'root' ? 'Compartir' : 'Elige un reto'}
        ariaLabel="Compartir"
      >
        {shareView === 'root' ? (
          <nav className={styles.menu} aria-label="Compartir">
            <button
              type="button"
              className={[styles.menuItem, 'lg-press'].join(' ')}
              onClick={() => {
                closeShareSheet()
                openInvite('share_fab')
              }}
            >
              <span className={styles.menuItemIcon}>
                <Icon icon={Share2} size={18} />
              </span>
              Invitar al viaje
            </button>

            {/* Oculto sin ningún reto en juego: compartir uno cerrado no lleva a
                ninguna acción. Con uno solo, directo a ShareChallengeModal; con
                varios, la vista 'pick' con miniaturas. */}
            {activeChallenges.length > 0 && (
              <button
                type="button"
                className={[styles.menuItem, 'lg-press'].join(' ')}
                onClick={() => {
                  if (activeChallenges.length === 1) {
                    openShareChallenge(activeChallenges[0], 'share_fab')
                    closeShareSheet()
                  } else {
                    setShareView('pick')
                  }
                }}
              >
                <span className={styles.menuItemIcon}>
                  <IconDiana size={18} />
                </span>
                Compartir un reto
              </button>
            )}

            {/* Solo con clasificación: nada que enseñar sin ella. */}
            {hasLeaderboard && (
              <button
                type="button"
                className={[styles.menuItem, 'lg-press'].join(' ')}
                onClick={() => {
                  closeShareSheet()
                  setSharingLeaderboard(true)
                }}
              >
                <span className={styles.menuItemIcon}>
                  <Icon icon={ListOrdered} size={18} />
                </span>
                Compartir clasificación
              </button>
            )}
          </nav>
        ) : (
          <div className={styles.sharePicker}>
            <button
              type="button"
              className={[styles.sharePickerBack, 'lg-press'].join(' ')}
              onClick={() => setShareView('root')}
            >
              <Icon icon={ChevronLeft} size={18} />
              Volver
            </button>
            <ol className={styles.sharePickerList} aria-label="Elige un reto para compartir">
              {activeChallenges.map((m) => (
                <li key={m.challengeId}>
                  <button
                    type="button"
                    className={[styles.sharePickerItem, 'lg-press'].join(' ')}
                    onClick={() => {
                      openShareChallenge(m, 'share_fab')
                      closeShareSheet()
                    }}
                  >
                    <ChallengePhoto
                      src={isMomentPhotoVisible(m) ? m.imageUrl : null}
                      alt={m.title}
                      ratio="square"
                      size="sm"
                      zoomable={false}
                      className={styles.sharePickerThumb}
                    />
                    <span className={styles.sharePickerTitle}>{m.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}
      </BottomSheet>

      {/* Menú ⋯ del viaje: hoja inferior con contenido FIJO. Miembros · Marcador ·
          Ajustes · Cerrar viaje · Borrar. Ajustes/Cerrar/Borrar viven dentro del
          modal de ajustes (solo dueño); aquí enlazamos a él. "Invitar" vivía aquí
          (2 taps tras el ⋯) y se retiró en el issue #758: ahora es el primer item
          de la hoja "Compartir" del FAB nuevo (visible sin abrir este menú). */}
      <BottomSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Opciones del viaje"
        ariaLabel="Opciones del viaje"
      >
        <nav className={styles.menu} aria-label="Opciones del viaje">
          {/* Tu perfil (#892): dentro del viaje la cabecera muestra el ⋯, no el
              avatar de la home — sin este item el usuario perdía la puerta al
              perfil al entrar a un viaje. Mismo destino que el avatar de la home
              (`gotoProfile` → #perfil), aquí como primera opción. */}
          <button
            type="button"
            className={[styles.menuItem, 'lg-press'].join(' ')}
            onClick={() => {
              setMenuOpen(false)
              gotoProfile()
            }}
          >
            <span className={styles.menuItemIcon}>
              <Icon icon={CircleUser} size={18} />
            </span>
            Tu perfil
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
              viven en el modal de ajustes; los miembros no ven estas tres acciones.
              Issue #783: gate por `isOwner` (ya NO `canCreate`, que ahora es
              "soy miembro") — si no, cualquier miembro vería borrar el viaje. */}
          {isOwner && (
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
          dueño) "Convertir en reto", que NAVEGA al asistente completo de crear reto
          en modo promoción (issue #723) — al volver, TripPage remonta con datos
          frescos y el momento aparece ya como reto en el mapa y el carrusel.
          Issue #783: `canEdit` sigue siendo de DUEÑO (`isOwner`) — el RLS
          (`challenges_update_owner`/`_delete_owner`) solo deja editar/borrar al
          dueño; crear es lo único que se abrió a cualquier miembro. */}
      <MomentSheet
        moment={openMoment}
        canEdit={isOwner}
        myUserId={user?.id ?? null}
        tripStartsOn={group?.starts_on ?? null}
        tripEndsOn={group?.ends_on ?? null}
        onClose={() => setOpenMoment(null)}
        onPlay={
          openMoment?.status === 'active'
            ? () => handlePlayChallenge(openMoment.challengeId)
            : undefined
        }
        // "Compartir reto" (issue #739): solo con el reto EN JUEGO (un reto
        // cerrado ya no se juega — para ese caso está "Ver marcador"). Nunca en
        // el viaje de ejemplo: no hay nada real que compartir (solo lectura).
        onShareChallenge={
          openMoment?.status === 'active' && !isExampleTrip
            ? () => {
                openShareChallenge(openMoment)
                setOpenMoment(null)
              }
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
        // "Convertir en reto" (issue #723): al asistente completo en modo promoción
        // (`&add=reto&promote=<id>`), con el pin/foto/título del recuerdo prefijados.
        // Nunca en el viaje de ejemplo (solo lectura): `canEdit={isOwner}` ya lo
        // oculta en la práctica, pero se guarda igual por defensa en profundidad.
        onPromote={
          openMoment && !isExampleTrip
            ? () => {
                setOpenMoment(null)
                location.hash = promoteChallengeHash(groupId, openMoment.challengeId)
              }
            : undefined
        }
        onEdited={() => void refresh()}
        onEditChallenge={(challengeId) => void openChallengeEditor(challengeId)}
        onDeleted={() => void refresh()}
      />

      {/* "Compartir reto" (issue #739): tarjeta-imagen + enlace `/j/<code>` de UN
          reto suelto, no del viaje entero. Mismo patrón que InviteModal. */}
      {sharingChallenge && (
        <ShareChallengeModal
          groupId={groupId}
          groupName={group?.name ?? null}
          challengeId={sharingChallenge.id}
          challengeTitle={sharingChallenge.title}
          challengeKind={sharingChallenge.kind}
          imagePath={sharingChallenge.imagePath}
          origin={sharingChallenge.origin}
          onClose={() => setSharingChallenge(null)}
        />
      )}

      {/* "Compartir clasificación" (issue #758, rescatado del FAB de MarcadorTab
          — issue #608): item de la hoja "Compartir" del viaje, montado aquí
          porque ya tenemos leaderboard/prizes/groupName sin pedírselos a la
          pestaña Marcador. */}
      <ShareLeaderboardModal
        open={sharingLeaderboard}
        onClose={() => setSharingLeaderboard(false)}
        groupName={title}
        entries={leaderboard}
        prizes={group?.prizes ?? null}
        link={tripShareUrl(location.origin, groupId)}
        origin="share_fab"
      />

      {/* Miembros del viaje (#616): lista + gestión según rol. Tras salir, a la
          home; tras cambiar roles/expulsar/transferir, recargamos permisos
          (isOwner puede cambiar al transferir) y el viaje. */}
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
          onInvite={() => {
            // El camino a "otra persona dueña": invitar → promover. Cerramos
            // Miembros y abrimos la hoja de invitar en un solo gesto (#689).
            setMembersOpen(false)
            openInvite()
          }}
        />
      )}

      {/* Ajustes del viaje (solo dueño): renombrar, cerrar/reabrir temporada y borrar.
          Reutiliza el modal de la GroupPage; al cambiar algo refrescamos el viaje.
          Issue #783: gate por `isOwner`. */}
      {isOwner && settingsOpen && (
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

      {/* Detalle de un reto (issue #800), abierto desde "Retos anteriores" del
          Marcador: clasificación, mapa de jugadas y foto — a pantalla completa,
          por encima del viaje. Se basta a sí mismo (pide sus propios datos por
          `challengeId`), así que solo hace falta montarlo/desmontarlo aquí. */}
      {viewingChallengeId && (
        <ChallengeDetail
          challengeId={viewingChallengeId}
          myUserId={user?.id ?? null}
          onClose={() => setViewingChallengeId(null)}
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
        isOwner={isOwner}
        origin={inviteOrigin}
      />

      {/* Guía conducida del viaje de ejemplo (onboarding nuevo, pieza 4/4): solo
          en el viaje de ejemplo y solo mientras `tourActive` — arrancada por
          `#g=ejemplo&tour=1` (perfil → "Ver un viaje de ejemplo") o, más
          adelante, por cualquier otra entrada que quiera recorrerlo. */}
      {isExampleTrip && tourActive && (
        <GuidedTour
          steps={tourSteps}
          // Cierre según el ORIGEN: un VISITANTE SIN sesión desde la landing
          // (issue #916, `&from=landing`) remata invitando a REGISTRARSE
          // (`onExampleRegister` abre el auth); desde la bienvenida del usuario
          // nuevo (issue #905, `&nuevo=1`) remata con "Ahora crea el tuyo" →
          // Crear viaje; desde el perfil ("Ver un viaje de ejemplo"), el cierre
          // neutro de siempre (solo cierra, ya estaba explorando a su aire).
          closingTitle={
            tourFromLanding
              ? 'Ahora empieza el tuyo'
              : tourFromNewUser
                ? 'Ahora crea el tuyo'
                : 'Ya conoces el viaje'
          }
          closingBody={
            tourFromLanding
              ? 'Ya sabes cómo se ve un viaje en Momentu. Crea tu cuenta y empieza a guardar y compartir los tuyos con tu gente.'
              : tourFromNewUser
                ? 'Ya sabes cómo se ve un viaje en Momentu. Empieza el tuyo: guarda tu primer momento y compártelo con tu gente.'
                : 'Así se ve un viaje entero en Momentu: un diario que se comparte, con retos de por medio.'
          }
          closingCta={
            tourFromLanding ? 'Empieza a compartir' : tourFromNewUser ? 'Crear viaje' : 'Entendido'
          }
          onFinish={() => {
            setTourActive(false)
            // Visitante desde la landing (sin sesión) → registrarse; el auto de
            // Crear viaje (`#nuevo`) exige sesión, así que aquí abrimos el auth.
            if (tourFromLanding && onExampleRegister) {
              onExampleRegister()
              return
            }
            // Solo el recorrido del usuario nuevo lleva a Crear viaje (`#nuevo`);
            // el del perfil se queda donde estaba (el propio viaje de ejemplo).
            if (tourFromNewUser) location.hash = 'nuevo'
          }}
          onSkip={() => setTourActive(false)}
        />
      )}

      {/* Tour del RETO COMPARTIDO en el viaje REAL (issue #891): Diario →
          Bitácora → Marcador, sin pantalla de cierre genérica — el remate es el
          registro opcional de abajo. "Saltar" cae directo en el Marcador. */}
      {retoTourActive && !isExampleTrip && (
        <GuidedTour
          steps={retoTourSteps}
          lastStepLabel="Listo"
          onFinish={handleRetoTourFinish}
          onSkip={handleRetoTourSkip}
        />
      )}

      {/* Tour de BIENVENIDA en el viaje (issue #901): Diario → Bitácora → retos,
          sin pantalla de cierre ni registro — el remate deja al usuario en el
          Diario. Se arranca tras la intro del receptor ("Ver el viaje"). Nunca a
          la vez que el del reto: `tour` solo puede valer un valor en el hash. */}
      {bienvenidaTourActive && !isExampleTrip && (
        <GuidedTour
          steps={bienvenidaTourSteps}
          lastStepLabel="Empezar"
          onFinish={handleBienvenidaTourFinish}
          onSkip={handleBienvenidaTourFinish}
        />
      )}

      {/* Cierre del tour del reto: registro opcional (issue #891). Se salta con
          "Ahora no" y en cualquier caso el usuario QUEDA en el Marcador (donde
          terminó el tour). `!retoUpgradeOpen` evita apilar dos diálogos. */}
      {retoRegisterOpen && !retoUpgradeOpen && (
        <GuestRegisterPrompt
          title="No pierdas tus retos"
          onCreateAccount={() => setRetoUpgradeOpen(true)}
          onDismiss={closeRetoRegister}
        />
      )}
      {retoUpgradeOpen && (
        <AccountUpgradeModal
          open
          onClose={closeRetoRegister}
          origin="reto_share_register"
          groupId={groupId}
          onUpgraded={() => {
            closeRetoRegister()
            toast.show('Guardado. Tus retos siguen siendo tuyos.', { tone: 'success' })
          }}
        />
      )}

      {/* Gate del "+" para anónimos (issue #891): el alta real con encuadre de
          "crear". Al guardar la cuenta, ya puede crear (el FAB pasa a menú). */}
      {anonCreateOpen && (
        <AccountUpgradeModal
          open
          onClose={() => setAnonCreateOpen(false)}
          origin="anon_create_gate"
          groupId={groupId}
          title="Regístrate para crear tus viajes"
          intro="Estás como invitado. Crea tu cuenta con tu correo para guardar tus propios momentos y lanzar retos — no pierdes nada de lo que ya jugaste."
          onUpgraded={() => {
            setAnonCreateOpen(false)
            toast.show('Cuenta guardada. Ya puedes crear.', { tone: 'success' })
          }}
        />
      )}
    </div>
  )
}
