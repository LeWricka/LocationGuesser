// Registro de CASOS de la galería: id → pantalla renderizada con fixtures. Cada
// caso monta un COMPONENTE REAL de pantalla (no una recreación). Los containers que
// hacen fetch (HomePage, TripPage, PlayChallenge, …) leen del cliente Supabase falso
// y de la sesión falsa (inyectados por alias de Vite en el entry de galería). Los
// presentacionales con props ricas (HomeDashboard, EditChallenge, ResultCard) se
// alimentan directamente con fixtures.
//
// El id del caso es el nombre del PNG de la captura. Añadir una pantalla = añadir un
// caso aquí; el script de Playwright los recorre solo (vía window.__galleryCases).

import type { ReactNode } from 'react'
import { Landing } from '../features/auth/Landing'
import { LoginFlow } from '../features/auth/LoginFlow'
import { HomePage } from '../features/home/HomePage'
import { TripPage } from '../features/trip/TripPage'
import { ChallengeDetail } from '../features/trip/ChallengeDetail'
import { PlayChallenge } from '../features/play/PlayChallenge'
import { PlayNumberChallenge } from '../features/play/PlayNumberChallenge'
import { CreateGroup } from '../features/create/CreateGroup'
import { AddMoment } from '../features/create/AddMoment'
import { CreateNumberChallenge } from '../features/create/CreateNumberChallenge'
import { CreateLocationChallenge } from '../features/create/CreateLocationChallenge'
import { CreateChallengeKindPicker } from '../features/create/CreateChallengeKindPicker'
import { EditChallenge } from '../features/group/EditChallenge'
import { MomentGallery } from '../features/trip/MomentGallery'
import { MomentSheet } from '../features/trip/MomentSheet'
import { ShareChallengeModal } from '../features/trip/ShareChallengeModal'
import { GroupSettingsModal } from '../features/group/GroupSettingsModal'
import { InviteModal } from '../features/group/InviteModal'
import { ResultCard } from '../features/play/ResultCard'
import { LeaderboardCard } from '../features/group/LeaderboardCard'
import { GameScene } from '../features/play/GameScene'
import { TripDiario } from '../features/trip/TripDiario'
import {
  OnboardingSlideshow,
  getSlides,
  GuestWelcomeFrame,
  GuestRegisterPrompt,
} from '../features/onboarding'
import {
  BackHomeButton,
  Card,
  ChallengePhoto,
  HomeDashboard,
  LoginScreen,
  ScoreRing,
  Stack,
  type HomeGroup,
  type HomePinned,
} from '../ui'
import type { GlobePin } from '../ui'
import { AppHeader } from '../ui/AppHeader'
import { IconTrofeo } from '../ui/icons'
import type { ChallengeForPlay } from '../lib/challenges'
import type { Moment } from '../lib/trip'
import {
  CHALLENGES,
  CH_ACTIVE,
  CH_CLOSED,
  CH_CLOSED_OTHER,
  CH_MEMORY,
  CH_NUMBER,
  GALLERY_NOW,
  GROUP,
  GROUP_ID,
  GROUP_NUEVO_ID,
  GROUP_NUEVO_PREMIOS_ID,
  ME_ID,
  MEMBERS,
  setEmptyWorld,
} from './fixtures'
import {
  SHOWCASE_HOME_GROUPS,
  SHOWCASE_HOME_PINS,
  SHOWCASE_HOME_PINNED,
  SHOWCASE_JUGAR_SCENE,
  SHOWCASE_JUGAR_TITLE,
  SHOWCASE_MOMENTS,
  SHOWCASE_REVEAL_DISTANCE_KM,
  SHOWCASE_REVEAL_MAX_POINTS,
  SHOWCASE_REVEAL_PHOTO,
  SHOWCASE_REVEAL_POINTS,
  SHOWCASE_REVEAL_RANK,
  SHOWCASE_REVEAL_TITLE,
  SHOWCASE_ROUTE,
  SHOWCASE_SELECTED_MOMENT,
} from './showcaseFixtures'

export interface GalleryCase {
  id: string
  /** Título humano para el índice de la galería. */
  title: string
  /** Sección para agrupar en el índice. */
  section: string
  /**
   * Prepara el mundo ANTES de montar (p.ej. activar el mundo vacío). Se ejecuta una
   * vez al seleccionar el caso. Por defecto, mundo lleno.
   */
  setup?: () => void
  render: () => ReactNode
}

// El "reto" listo para EditChallenge: ChallengeForPlay = sin lat/lng (igual que lo
// que sirve el cliente real). Tomamos el reto cerrado de lugar de los fixtures.
function challengeForPlay(id: string): ChallengeForPlay {
  const row = CHALLENGES.find((c) => c.id === id)
  if (!row) throw new Error(`Fixture de reto no encontrado: ${id}`)
  const { lat: _lat, lng: _lng, ...rest } = row
  void _lat
  void _lng
  return rest as ChallengeForPlay
}

const noop = () => {}

// Foto stub para `MomentSheet` (issue #571): mismo estilo que el SVG data-URI que
// firma el Storage falso (`fakeSupabase.photoDataUri`, no exportado), duplicado
// aquí en miniatura porque `MomentSheet` recibe `imageUrl` ya resuelto (no lo
// firma él mismo; solo `MomentGallery` pasa por el cliente falso).
function stubPhoto(label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000" preserveAspectRatio="xMidYMid slice">
    <rect width="800" height="1000" fill="#2f4a63"/>
    <text x="400" y="520" fill="#f6f7f9" font-family="Georgia, serif" font-size="40" text-anchor="middle" opacity="0.4">${label}</text>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

// Recuerdo CON foto: mismo `challengeId` que CH_MEMORY, así la galería embebida
// ("La serie" / la tira editable) carga los `MOMENT_IMAGES` ya sembrados para ese
// momento a través del cliente falso — sin foto propia inventada sin fotos detrás.
const MOMENT_CON_FOTO: Moment = {
  challengeId: CH_MEMORY,
  title: 'El mejor ramen del viaje',
  description: 'Una barra de ocho asientos perdida en un callejón.',
  status: 'recuerdo',
  isChallenge: false,
  date: '2026-06-11T10:00:00.000Z',
  deadlineAt: null,
  imageUrl: stubPhoto('El mejor ramen del viaje'),
  imagePath: 'photo-ramen.jpg',
  lat: 35.0036,
  lng: 135.7788,
  guessedCount: 0,
  isOwn: false,
  guessSeconds: null,
  svPanoId: null,
  country: { code: 'JP', name: 'JAPÓN', flag: '🇯🇵' },
}

// Recuerdo SIN foto (la captura exacta del dueño, #571): `challengeId` propio, sin
// filas en `MOMENT_IMAGES`, así la galería embebida también queda vacía de verdad.
const MOMENT_SIN_FOTO: Moment = {
  ...MOMENT_CON_FOTO,
  challengeId: 'ch-memory-sin-foto',
  title: 'Tinto de verano en la plaza',
  description: null,
  imageUrl: null,
  imagePath: null,
  lat: null,
  lng: null,
  country: null,
}

// RETO cerrado ajeno, ya jugado (issue #714 — la captura del dueño): kicker "Un
// reto para el grupo", sello dorado "Reto" y "Tu resultado" con puntos. Antes NO
// existía un caso de galería para este estado de `MomentSheet` (solo había
// recuerdo con/sin foto) — sin él, el swipe-down para cerrar (#650) nunca se
// validó visualmente sobre un reto, aunque el gesto vive en el MISMO componente
// y no distingue por `isChallenge` (verificado con Playwright + emulación de
// touch real: cierra igual desde el héroe en ambos casos).
const MOMENT_RETO_CERRADO: Moment = {
  ...MOMENT_CON_FOTO,
  challengeId: 'ch-reto-cerrado-galeria',
  title: 'La plaza del reloj',
  description: 'Aquí quedamos cada tarde.',
  status: 'closed',
  isChallenge: true,
  imageUrl: stubPhoto('La plaza del reloj'),
  guessedCount: 3,
  isOwn: false,
}

// RETO EN JUEGO ajeno, foto PISTA (issue #739): la captura del botón "Compartir
// reto" en el detalle — solo debe aparecer mientras el reto sigue en juego (un
// reto cerrado ya no se juega y ofrece "Ver marcador" en su lugar, ver el caso
// `reto-vista-cerrado`). Anti-spoiler: sin lat/lng (la respuesta oculta).
const MOMENT_RETO_ACTIVO: Moment = {
  ...MOMENT_CON_FOTO,
  challengeId: 'ch-reto-activo-galeria',
  title: '¿Dónde tomó Marta esta foto?',
  description: null,
  status: 'active',
  isChallenge: true,
  deadlineAt: '2026-06-16T10:00:00.000Z',
  imageUrl: stubPhoto('¿Dónde tomó Marta esta foto?'),
  lat: null,
  lng: null,
  guessedCount: 1,
  isOwn: false,
  photoIsHint: true,
  country: null,
}

// Avatares del grupo (issue #543): los 4 miembros sembrados del viaje de Japón
// (todos con `avatar: null` en fixtures.ts → 3 discos por defecto + chip "+1").
const dashboardMembers = MEMBERS.map((m) => ({
  userId: m.userId,
  name: m.name,
  avatarUrl: m.avatar,
}))

// HomeDashboard directo (home logueada, estado lleno): mismo patrón que su story,
// pero con los fixtures del viaje sembrado para coherencia con el resto de casos.
const dashboardGroups: HomeGroup[] = [
  {
    id: GROUP_ID,
    name: GROUP.name ?? GROUP_ID,
    status: 'toplay',
    owned: true,
    startsOn: GROUP.starts_on,
    endsOn: GROUP.ends_on,
    members: dashboardMembers,
  },
  {
    id: 'viaje-alpes',
    name: 'Ruta por los Alpes',
    status: 'idle',
    owned: true,
    closed: true,
    startsOn: '2026-04-04',
    // Viaje en solitario (issue #543): un único miembro → sin fila de avatares.
    members: [dashboardMembers[0]],
  },
  {
    id: 'viaje-lisboa',
    name: 'Finde en Lisboa',
    status: 'live',
    startsOn: '2026-05-02',
    endsOn: '2026-05-05',
    members: dashboardMembers.slice(0, 2),
  },
]
// Globo poblado (#700): el viaje protagonista (Japón, primero del carrusel por su
// estado `toplay`) aporta su RECORRIDO — varios momentos agrupados, en orden
// cronológico ASC con el "lead" en el más reciente (el último), como los compone
// HomePage — y el resto de viajes clavan pines SUELTOS por la esfera, fuera del
// encuadre (visibles al girar el globo).
const dashboardPins: GlobePin[] = [
  {
    id: 'p-tokio',
    lat: 35.6762,
    lng: 139.6503,
    title: 'Japón · Tokio',
    imageUrl: null,
    targetId: GROUP_ID,
  },
  {
    id: 'p-kioto',
    lat: 35.0116,
    lng: 135.7681,
    title: 'Japón · Kioto',
    imageUrl: null,
    targetId: GROUP_ID,
  },
  {
    id: 'p-nara',
    lat: 34.6851,
    lng: 135.8048,
    title: 'Japón · Nara',
    imageUrl: null,
    targetId: GROUP_ID,
    lead: true,
    // Reto "Te toca jugar" pendiente de este mismo viaje (issue #776): el pin lleva
    // A LA VEZ el aro "lead" (protagonista) y los anillos de sónar — el caso real
    // más común (el reto pendiente suele vivir en el viaje que ya manda el carrusel).
    pending: true,
  },
  {
    id: 'p-alpes',
    lat: 45.9237,
    lng: 6.8694,
    title: 'Ruta por los Alpes · Chamonix',
    imageUrl: null,
    targetId: 'viaje-alpes',
  },
  {
    id: 'p-lisboa',
    lat: 38.7223,
    lng: -9.1393,
    title: 'Finde en Lisboa · Alfama',
    imageUrl: null,
    targetId: 'viaje-lisboa',
  },
]
const dashboardPinned: HomePinned = {
  groupId: GROUP_ID,
  challengeId: CH_ACTIVE,
  title: '¿Dónde tomó Marta esta foto?',
  groupName: GROUP.name ?? GROUP_ID,
  deadlineAt: new Date(GALLERY_NOW.getTime() + 14 * 60 * 60 * 1000).toISOString(),
  coverUrl: null,
}

// Escenario del BUG del globo (issue #442): varios pines de un mismo viaje que caen
// CERCA (Madrid) —reproduce el amontonamiento— más un pin con imagen ROTA, otro con
// un data:svg (el patrón exacto del garabato) y otro SIN foto —reproduce el contenido
// "garabateado" del pin—. El pin "lead" lleva el aro cálido. Bajo el stub de maplibre
// los marcadores se clavan (apilados, sin proyección real): sirve para verificar que
// NINGÚN pin muestra texto/markup dentro (siempre foto o inicial limpia). El
// amontonamiento POSICIONAL real solo se ve con mapa real (lo valida el dueño en prod);
// aquí lo cazan de forma determinista los unit tests del pin (pinMarkers.test.ts).
const crowdedGroups: HomeGroup[] = [
  {
    id: 'viaje-madrid',
    name: 'Finde Madrid',
    status: 'idle',
    owned: true,
    closed: true,
    startsOn: '2026-05-30',
    endsOn: '2026-06-01',
  },
]
const crowdedPins: GlobePin[] = [
  {
    id: 'c-roto',
    lat: 40.4168,
    lng: -3.7038,
    title: 'Finde Madrid · Plaza Mayor',
    imageUrl: 'https://cdn.invalido/foto-que-no-existe.jpg',
    targetId: 'viaje-madrid',
  },
  {
    id: 'c-sinfoto',
    lat: 40.4155,
    lng: -3.7074,
    title: 'Finde Madrid · Retiro',
    imageUrl: null,
    targetId: 'viaje-madrid',
  },
  {
    id: 'c-svg',
    lat: 40.418,
    lng: -3.702,
    title: 'Finde Madrid · Gran Vía',
    imageUrl:
      'data:image/svg+xml;utf8,' +
      encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><text>Gran Vía</text></svg>'),
    targetId: 'viaje-madrid',
  },
  {
    id: 'c-lead',
    lat: 40.4145,
    lng: -3.705,
    title: 'Finde Madrid · Sol',
    imageUrl: null,
    targetId: 'viaje-madrid',
    lead: true,
  },
]

export const cases: GalleryCase[] = [
  {
    id: 'landing-generica',
    title: 'Landing (deslogueada)',
    section: 'Home',
    render: () => <Landing />,
  },
  {
    id: 'landing-por-invitacion',
    title: 'Landing por invitación a un viaje',
    section: 'Home',
    render: () => <Landing groupName="Japón en primavera" />,
  },
  {
    id: 'home-dashboard-lleno',
    title: 'Home logueada (globo + hoja, con viajes)',
    section: 'Home',
    render: () => (
      <HomeDashboard
        userId={ME_ID}
        displayName="Lewis"
        groups={dashboardGroups}
        pins={dashboardPins}
        pinned={dashboardPinned}
        onOpenProfile={noop}
        onCreateGroup={noop}
        onOpenGroup={noop}
        onPlayPinned={noop}
      />
    ),
  },
  {
    id: 'home-globo-pines-cercanos',
    title: 'Home logueada · globo con pines cercanos (imagen rota / sin foto / lead)',
    section: 'Home',
    render: () => (
      <HomeDashboard
        userId={ME_ID}
        displayName="Lewis"
        groups={crowdedGroups}
        pins={crowdedPins}
        pinned={null}
        onOpenProfile={noop}
        onCreateGroup={noop}
        onOpenGroup={noop}
      />
    ),
  },
  {
    id: 'home-vacia',
    title: 'Home recién llegada (sin viajes)',
    section: 'Home',
    setup: () => setEmptyWorld(true),
    render: () => <HomePage />,
  },
  {
    id: 'home-con-datos',
    title: 'Home logueada (pantalla real con fixtures)',
    section: 'Home',
    render: () => <HomePage />,
  },
  {
    id: 'viaje-diario',
    title: 'Viaje · Diario',
    section: 'Viaje',
    render: () => (
      <TripPage
        groupId={GROUP_ID}
        initialSection="diario"
        onPlayChallenge={noop}
        onAddMoment={noop}
        onAddChallenge={noop}
        onBack={noop}
      />
    ),
  },
  {
    // Bitácora del viaje (antes "Fotos", issue #645): scroll cronológico por
    // día → recuerdo → fotos a ancho completo. El mundo sembrado cubre:
    //  - CH_MEMORY: recuerdo con galería multi-foto (3 fotos) + descripción +
    //    nota de voz (audio/, issue #648) — el bloque más rico. Su descripción
    //    lleva el prefijo de fecha LEGADO (`📅 <fecha> · …`, issue #686): guarda
    //    visual permanente de que no vuelva a pintarse el emoji gigante.
    //  - CH_MEMORY_QUIET: recuerdo SIN descripción, una sola foto.
    //  - CH_CLOSED / CH_CLOSED_OTHER: retos SELLADOS (ya revelados), con foto
    //    y descripción, como cualquier recuerdo — cada uno lleva el chip diana +
    //    "Cerrado" (issue #821) que los distingue de un recuerdo.
    //  - CH_ACTIVE_SORPRESA: reto EN JUEGO con foto SORPRESA (`photo_is_hint:
    //    false`) que NO debe aparecer — vigilancia visual del anti-spoiler.
    //  - CH_CLOSED_SAME_PHOTO_AS_MEMORY: reto CERRADO con la MISMA foto que
    //    CH_MEMORY (issue #821, "un reto y un momento con la misma foto se leen
    //    como duplicados") — guarda visual permanente de que el chip diana +
    //    estado los distingue aun compartiendo imagen. La clasificación con
    //    votos ya sembrados también deja ver el cierre de la Bitácora (podio +
    //    "Ver marcador", issue #822).
    id: 'viaje-bitacora',
    title: 'Viaje · Bitácora',
    section: 'Viaje',
    render: () => (
      <TripPage
        groupId={GROUP_ID}
        initialSection="fotos"
        onPlayChallenge={noop}
        onAddMoment={noop}
        onAddChallenge={noop}
        onBack={noop}
      />
    ),
  },
  {
    id: 'viaje-marcador',
    title: 'Viaje · Marcador',
    section: 'Viaje',
    render: () => (
      <TripPage
        groupId={GROUP_ID}
        initialSection="marcador"
        onPlayChallenge={noop}
        onAddMoment={noop}
        onAddChallenge={noop}
        onBack={noop}
      />
    ),
  },
  {
    // Issues #752/#753: viaje recién creado, nadie ha jugado todavía y el dueño
    // AÚN no definió premios — el podio vacío ofrece la CTA "¿Qué se juega?" en
    // el hueco del 1º (sustituye al enlace de texto de la esquina).
    id: 'viaje-marcador-vacio',
    title: 'Viaje · Marcador vacío (dueño, sin premios)',
    section: 'Viaje',
    render: () => (
      <TripPage
        groupId={GROUP_NUEVO_ID}
        initialSection="marcador"
        onPlayChallenge={noop}
        onAddMoment={noop}
        onAddChallenge={noop}
        onBack={noop}
      />
    ),
  },
  {
    // Issues #752/#753: mismo viaje recién creado, pero el dueño YA definió
    // premios — el podio vacío cuelga los chips de 1º/último (visibles para
    // cualquier miembro, tappables solo para el dueño).
    id: 'viaje-marcador-vacio-premios',
    title: 'Viaje · Marcador vacío (con premios ya definidos)',
    section: 'Viaje',
    render: () => (
      <TripPage
        groupId={GROUP_NUEVO_PREMIOS_ID}
        initialSection="marcador"
        onPlayChallenge={noop}
        onAddMoment={noop}
        onAddChallenge={noop}
        onBack={noop}
      />
    ),
  },
  {
    // Issue #800: detalle de UN reto abierto desde "Retos anteriores" del
    // Marcador — clasificación (jugador → puntos → distancia, el propio
    // destacado), el mapa con las jugadas de TODOS (`AllGuessesMap`, #797) y la
    // foto ampliable + título/creador/cierre. CH_CLOSED_OTHER: cerrado, AJENO
    // (creado por Marta) y con TU voto — el recap real, no la guarda "es tuyo".
    id: 'detalle-reto-marcador',
    title: 'Marcador · Detalle de un reto (clasificación + mapa + foto)',
    section: 'Viaje',
    render: () => <ChallengeDetail challengeId={CH_CLOSED_OTHER} myUserId={ME_ID} onClose={noop} />,
  },
  {
    // Issue #607: el pie (Copiar enlace / Compartir) desbordaba el panel a
    // ~560px con 3 botones. Caso de galería para poder verificarlo a varios
    // anchos con la captura automática (multiviewport).
    // Issue #617: "Compartir" ahora genera una tarjeta-imagen (portada del
    // viaje → mapa nocturno de marca) rasterizada off-screen con
    // html-to-image; la captura corre en un navegador real (Playwright), así
    // que la cascada de portada y el rasterizado se resuelven de verdad
    // contra el mundo sembrado (GROUP.cover_image_path vía el Storage falso).
    id: 'invitar-viaje',
    title: 'Invitar al viaje',
    section: 'Viaje',
    render: () => (
      <div className="lg-page">
        <h1>{GROUP.name}</h1>
        <InviteModal
          open
          onClose={noop}
          groupId={GROUP_ID}
          groupName={GROUP.name ?? GROUP_ID}
          link={`https://momentu.art/v/${GROUP_ID}`}
          challengeCount={CHALLENGES.length}
          isOwner
        />
      </div>
    ),
  },
  {
    // Issue #739: "Compartir reto" (UN reto suelto, no el viaje entero) desde
    // su detalle — misma tarjeta-imagen que "¡Reto creado!" (#595), mismo
    // patrón Copiar enlace/Compartir que InviteModal (#617). Reutiliza CH_ACTIVE
    // (sembrado en el mundo falso) para que la cascada de portada rasterice de
    // verdad su foto contra el Storage falso.
    id: 'compartir-reto',
    title: 'Compartir reto',
    section: 'Viaje',
    render: () => (
      <div className="lg-page">
        <h1>¿Dónde tomó Marta esta foto?</h1>
        <ShareChallengeModal
          groupId={GROUP_ID}
          groupName={GROUP.name ?? GROUP_ID}
          challengeId={CH_ACTIVE}
          challengeTitle="¿Dónde tomó Marta esta foto?"
          imagePath="photo-fushimi.jpg"
          onClose={noop}
        />
      </div>
    ),
  },
  {
    id: 'galeria-recuerdo-editar',
    title: 'Galería del recuerdo (dueño: portada / añadir / quitar)',
    section: 'Viaje',
    render: () => (
      <div
        style={{ maxWidth: 520, margin: '0 auto', padding: 24, background: 'var(--color-surface)' }}
      >
        <MomentGallery challengeId={CH_MEMORY} initialCoverUrl={null} canEdit onChanged={noop} />
      </div>
    ),
  },
  {
    id: 'recuerdo-vista-con-foto',
    title: 'Recuerdo · Vista (con foto)',
    section: 'Viaje',
    render: () => <MomentSheet moment={MOMENT_CON_FOTO} canEdit onClose={noop} />,
  },
  {
    id: 'recuerdo-vista-sin-foto',
    title: 'Recuerdo · Vista (sin foto)',
    section: 'Viaje',
    render: () => <MomentSheet moment={MOMENT_SIN_FOTO} canEdit onClose={noop} />,
  },
  {
    id: 'reto-vista-cerrado',
    title: 'Reto · Vista (cerrado, con resultado)',
    section: 'Viaje',
    render: () => (
      <MomentSheet
        moment={MOMENT_RETO_CERRADO}
        canEdit={false}
        myUserId="u1"
        onClose={noop}
        onViewMarcador={noop}
      />
    ),
  },
  {
    // Issue #739: "Compartir reto" solo aparece con el reto EN JUEGO (un reto
    // cerrado ya no se juega; para ese caso está "Ver marcador" arriba, sin
    // acción de compartir duplicada).
    id: 'reto-vista-en-juego',
    title: 'Reto · Vista (en juego, con "Compartir reto")',
    section: 'Viaje',
    render: () => (
      <MomentSheet
        moment={MOMENT_RETO_ACTIVO}
        canEdit={false}
        onClose={noop}
        onPlay={noop}
        onShareChallenge={noop}
      />
    ),
  },
  {
    // La captura del dueño (#571): editar un recuerdo SIN foto ya NO hereda el
    // héroe de la escena (vacío negro + título gigante duplicado) — formulario de
    // papel, misma gramática que "Nuevo recuerdo".
    id: 'recuerdo-editar-sin-foto',
    title: 'Recuerdo · Editar de papel (sin foto)',
    section: 'Viaje',
    render: () => <MomentSheet moment={MOMENT_SIN_FOTO} canEdit initialEditing onClose={noop} />,
  },
  {
    id: 'recuerdo-editar-con-foto',
    title: 'Recuerdo · Editar de papel (con foto)',
    section: 'Viaje',
    render: () => <MomentSheet moment={MOMENT_CON_FOTO} canEdit initialEditing onClose={noop} />,
  },
  {
    id: 'crear-viaje',
    title: 'Crear viaje',
    section: 'Crear',
    render: () => <CreateGroup onBack={noop} />,
  },
  {
    id: 'anadir-recuerdo',
    title: 'Añadir recuerdo',
    section: 'Crear',
    render: () => (
      <AddMoment groupId={GROUP_ID} onBack={noop} onCreated={noop} onAddChallenge={noop} />
    ),
  },
  {
    // Selector de tipo a la ENTRADA de crear reto (issue #705): la captura del
    // dueño que evidenció el aire sobrante de la cabecera 5B compactada.
    id: 'nuevo-reto',
    title: 'Nuevo reto · ¿A qué jugamos?',
    section: 'Crear',
    render: () => <CreateChallengeKindPicker groupName={GROUP.name} onBack={noop} onPick={noop} />,
  },
  {
    // Reto ¿Adivinas? de papel (issue #586): antes montaba CreateChallengeFlow
    // (que arrancaba en el selector de tipo, no en el formulario a verificar).
    // Va directo al asistente de número, igual que 'crear-donde' con
    // CreateLocationChallenge — es lo que hay que ver en la captura.
    id: 'crear-adivinas',
    title: 'Crear ¿Adivinas? (nombre + pregunta + foto)',
    section: 'Crear',
    render: () => (
      <CreateNumberChallenge
        groupId={GROUP_ID}
        groupName={GROUP.name}
        onBack={noop}
        onCreated={noop}
      />
    ),
  },
  {
    // Flujo "GeoGuessr puro" (origen FAB, sin recuerdo), PASO 1 de 2 (v3,
    // issue #592): mapa a todo el alto con el buscador como barra de vidrio
    // DENTRO del mapa (variante `searchPlacement="overlay"` de MapPicker —
    // verificar aquí que no tapa el zoom ni el toggle de capa, y que "Añadir
    // recuerdo" conserva su buscador encima del mapa, la variante por
    // defecto). Sin pin todavía: solo el hint "Toca el mapa…", sin tarjeta SV.
    id: 'crear-donde',
    title: 'Crear ¿Dónde estamos? · Paso 1 (el sitio, sin pin)',
    section: 'Crear',
    render: () => (
      <CreateLocationChallenge
        groupId={GROUP_ID}
        groupName={GROUP.name}
        onBack={noop}
        onCreated={noop}
      />
    ),
  },
  {
    // Paso 1 CON pin y cobertura confirmada (issue #592 punto 3): la previa de
    // SV vive AHORA en una tarjeta flotante sobre el propio mapa (vidrio,
    // ~180-220px), no en un paso aparte. `initialState` siembra pin + panorama
    // (el SDK de Maps está stubeado en galería: la previa se ve como lienzo
    // vacío enmarcado, pero el LAYOUT — tarjeta flotante, chip de privacidad,
    // CTA "Continuar" habilitado — es el real).
    id: 'crear-donde-sv',
    title: 'Crear ¿Dónde estamos? · Paso 1 (tarjeta SV inline)',
    section: 'Crear',
    render: () => (
      <CreateLocationChallenge
        groupId={GROUP_ID}
        groupName={GROUP.name}
        onBack={noop}
        onCreated={noop}
        initialState={{
          point: { lat: 35.0036, lng: 135.7788 },
          pano: { panoId: 'pano-galeria', lat: 35.0036, lng: 135.7788 },
        }}
      />
    ),
  },
  {
    // Paso 1 CON pin pero SIN cobertura (issue #592 punto 3): el aviso "Sin
    // Street View aquí" vive EN LA MISMA tarjeta, sin forzar un cambio de
    // paso — el CTA "Continuar" queda deshabilitado hasta mover el pin.
    id: 'crear-donde-sin-cobertura',
    title: 'Crear ¿Dónde estamos? · Paso 1 (sin cobertura de Street View)',
    section: 'Crear',
    render: () => (
      <CreateLocationChallenge
        groupId={GROUP_ID}
        groupName={GROUP.name}
        onBack={noop}
        onCreated={noop}
        initialState={{ point: { lat: 35.0036, lng: 135.7788 }, pano: 'none' }}
      />
    ),
  },
  {
    // PASO 2 de 2 (issue #592): sin mapa ni previa (ya cumplieron su función
    // en el paso 1) — solo plazo/tiempo por jugada, privacidad y Lanzar.
    id: 'crear-donde-reglas',
    title: 'Crear ¿Dónde estamos? · Paso 2 (las reglas)',
    section: 'Crear',
    render: () => (
      <CreateLocationChallenge
        groupId={GROUP_ID}
        groupName={GROUP.name}
        onBack={noop}
        onCreated={noop}
        initialState={{
          point: { lat: 35.0036, lng: 135.7788 },
          pano: { panoId: 'pano-galeria', lat: 35.0036, lng: 135.7788 },
          step: 'previa',
        }}
      />
    ),
  },
  {
    id: 'login',
    title: 'Login (recuperación por código)',
    section: 'Entrar',
    render: () => <LoginScreen email="" onEmailChange={noop} />,
  },
  {
    id: 'entrada-email-first',
    title: 'Entrada email-first (LoginFlow)',
    section: 'Entrar',
    render: () => <LoginFlow />,
  },
  {
    id: 'jugar-ubicacion',
    title: 'Jugar ubicación (¿Dónde es?)',
    section: 'Jugar',
    render: () => <PlayChallenge challengeId={CH_ACTIVE} groupId={GROUP_ID} />,
  },
  {
    id: 'jugar-numero',
    title: 'Jugar número (¿Cuánto?)',
    section: 'Jugar',
    render: () => <PlayNumberChallenge challengeId={CH_NUMBER} groupId={GROUP_ID} />,
  },
  {
    // Reto cerrado AJENO (creado por Marta) con tu voto: el revelado REAL
    // (mapa + resultado), no la guarda "es tuyo" (#579 — antes este caso usaba
    // CH_CLOSED, propio + auto-voto imposible, y enseñaba la guarda por error).
    id: 'detalle-reto-cerrado',
    title: 'Detalle del reto (cerrado, ya jugado)',
    section: 'Jugar',
    render: () => <PlayChallenge challengeId={CH_CLOSED_OTHER} groupId={GROUP_ID} />,
  },
  {
    // Guarda "es tuyo" (#509) a propósito: CH_CLOSED es TU reto (creado por
    // ME_ID) → PlayChallenge corta antes de jugar y muestra el estado
    // enriquecido (#579: centrado + mini-resumen "cierra en X / cerrado").
    id: 'reto-es-tuyo',
    title: 'Reto es tuyo (guarda, no se puede jugar)',
    section: 'Jugar',
    render: () => <PlayChallenge challengeId={CH_CLOSED} groupId={GROUP_ID} />,
  },
  {
    // CH_CLOSED (cerrado, con votos de #427 — bloquea también la ubicación):
    // el plazo tampoco se puede reabrir desde aquí — "Cerró el…" + sin chips
    // (cerrar es otra acción; issue: editar reto — ajustar la fecha). El
    // estado EN JUEGO (chips de duración) queda cubierto por unit tests
    // (EditChallenge.test.tsx): los fixtures "en juego" de la galería no
    // llevan votos, así que la ubicación aparecería editable (rama ya
    // existente, sin relación con el plazo) — confundiría esta captura.
    id: 'editar-reto',
    title: 'Editar reto (cerrado, plazo bloqueado)',
    section: 'Editar',
    render: () => (
      <EditChallenge challenge={challengeForPlay(CH_CLOSED)} onBack={noop} onSaved={noop} />
    ),
  },
  {
    id: 'editar-viaje',
    title: 'Editar viaje (datos + portada)',
    section: 'Editar',
    // El Modal portala a <body>; dejamos un fondo mínimo en #root para que la
    // captura (y el a11y) tengan lienzo bajo el diálogo, como en el viaje real.
    render: () => (
      <div className="lg-page">
        <h1>{GROUP.name}</h1>
        <GroupSettingsModal
          groupId={GROUP_ID}
          currentName={GROUP.name}
          isClosed={false}
          onClose={noop}
          onRenamed={noop}
          onSeasonChanged={noop}
          onDeleted={noop}
        />
      </div>
    ),
  },
  {
    id: 'tarjeta-resultado',
    title: 'Tarjeta de resultado (para compartir)',
    section: 'Jugar',
    render: () => (
      <ResultCard
        groupName="Japón en primavera"
        challengeTitle="El bosque de bambú"
        points={4880}
        distanceKm={1.2}
        domain="momentu.art"
      />
    ),
  },
  {
    // Issue #801: caso de galería para la tarjeta-IMAGEN de "Compartir
    // clasificación" (LeaderboardCard/Podium) — antes no existía ninguno, por
    // eso el avatar-emoji-crudo-sobre-círculo pasó desapercibido (design-lint no
    // caza un emoji que llega por variable, solo literales; y sin caso de
    // galería nadie veía el PÓSTER rasterizado, solo la pantalla en vivo). Todos
    // sin foto propia (`avatar: null`): fuerza el camino del animal por defecto
    // en el podio, el que antes se pintaba como emoji.
    id: 'tarjeta-clasificacion',
    title: 'Tarjeta de clasificación (para compartir, podio con avatares)',
    section: 'Grupo',
    render: () => (
      <LeaderboardCard
        groupName="Japón en primavera"
        entries={[
          { userId: 'user-marta-0001', name: 'Marta', avatar: null, points: 4880, plays: 5 },
          { userId: 'user-iker-0002', name: 'Iker', avatar: null, points: 4210, plays: 5 },
          { userId: ME_ID, name: 'Lewis', avatar: null, points: 3890, plays: 5 },
          { userId: 'user-noa-0003', name: 'Noa', avatar: null, points: 2100, plays: 4 },
        ]}
        prizes={{ first: 'Elige el próximo reto', last: 'Paga las cervezas' }}
        domain="momentu.art"
        photoDataUrl={null}
      />
    ),
  },
  // Tutorial ÚNICO de entrada (issue #742): el slideshow que cuenta el bucle
  // completo (guardar → bitácora → compartir → reto → compartir reto). Es el único
  // tutorial en vivo hoy; se muestra una vez en la home vacía y se reabre con "Ver
  // tutorial". Lo capturamos en su primer paso.
  {
    id: 'onboarding-entrada',
    title: 'Onboarding · tutorial único de entrada (paso 1)',
    section: 'Onboarding',
    render: () => (
      <OnboardingSlideshow slides={getSlides('entry')} onSkip={noop} onComplete={noop} />
    ),
  },
  // Rediseño visual-first del onboarding (issue #625): los 3 gestos clave del
  // tutorial del viaje, cada uno con su mini-simulación CSS (ver
  // OnboardingVisual). Los pasos 2 y 3 se aíslan como slideshow de un único paso
  // para poder capturarlos sin tener que interactuar (Playwright solo monta).
  {
    id: 'onboarding-comparte-momento',
    title: 'Onboarding · paso 1 (comparte un momento)',
    section: 'Onboarding',
    render: () => (
      <OnboardingSlideshow slides={getSlides('group')} onSkip={noop} onComplete={noop} />
    ),
  },
  {
    id: 'onboarding-invita-grupo',
    title: 'Onboarding · paso 2 (invita al grupo)',
    section: 'Onboarding',
    render: () => (
      <OnboardingSlideshow slides={[getSlides('group')[1]]} onSkip={noop} onComplete={noop} />
    ),
  },
  {
    id: 'onboarding-juega-reto',
    title: 'Onboarding · paso 3 (juega un reto)',
    section: 'Onboarding',
    render: () => (
      <OnboardingSlideshow slides={[getSlides('group')[2]]} onSkip={noop} onComplete={noop} />
    ),
  },
  // Marco de bienvenida del invitado (onboarding nuevo, pieza 1/4): UNA sola
  // pantalla —no slides— con los datos reales del viaje. Sustituye a la
  // bienvenida-slideshow de arriba.
  {
    id: 'onboarding-marco-invitado',
    title: 'Onboarding · marco de bienvenida del invitado (una pantalla)',
    section: 'Onboarding',
    render: () => (
      <GuestWelcomeFrame
        tripName="Ruta por Portugal"
        ownerName="Lucía"
        othersCount={3}
        avatarMembers={[
          { userId: 'owner-1', name: 'Lucía', avatarUrl: null },
          { userId: 'member-2', name: 'Ana', avatarUrl: null },
        ]}
        coverImageUrl={null}
        hasActiveChallenge
        onEnter={noop}
      />
    ),
  },
  {
    id: 'onboarding-registro-invitado',
    title: 'Onboarding · registro post-valor del invitado (tras jugar)',
    section: 'Onboarding',
    render: () => <GuestRegisterPrompt onCreateAccount={noop} onDismiss={noop} />,
  },
  // ── Showcase de la landing (issue #652) ──────────────────────────────────
  // Las 4 pantallas que alimentan LandingShowcase (features/auth/LandingShowcase)
  // y los tutoriales de onboarding (#636): capturas ACTUALES con FOTOS REALES en
  // vez del diseño viejo + stubs grises de junio (#462). Fixtures en
  // `showcaseFixtures.ts` (fichero propio, no toca `fixtures.ts` ni el "mundo" del
  // cliente Supabase falso): las 3 pantallas son 100% presentacionales, así que
  // basta con props ricas.
  {
    id: 'showcase-home',
    title: 'Showcase · Home (globo + carrusel de fotos reales)',
    section: 'Showcase',
    render: () => (
      <HomeDashboard
        userId={ME_ID}
        displayName="Lewis"
        groups={SHOWCASE_HOME_GROUPS}
        pins={SHOWCASE_HOME_PINS}
        pinned={SHOWCASE_HOME_PINNED}
        onOpenProfile={noop}
        onCreateGroup={noop}
        onOpenGroup={noop}
        onPlayPinned={noop}
      />
    ),
  },
  {
    id: 'showcase-viaje',
    title: 'Showcase · Viaje (diario con momentos y pines-foto reales)',
    section: 'Showcase',
    render: () => (
      <div style={{ position: 'relative', height: '100dvh', overflow: 'hidden' }}>
        <AppHeader
          variant="floating"
          lead="back"
          leadLabel="Volver"
          onLead={noop}
          title={
            <span>
              La vuelta al mundo
              <br />
              <span style={{ fontSize: '0.8em', fontWeight: 400 }}>Tú, Marta y Noa</span>
            </span>
          }
        />
        <TripDiario
          groupId="showcase-viaje"
          moments={SHOWCASE_MOMENTS}
          route={SHOWCASE_ROUTE}
          selectedId={SHOWCASE_SELECTED_MOMENT}
          canCreate={false}
          onSelectFromMap={noop}
          onExpand={noop}
          onPlay={noop}
          onAddMoment={noop}
          onInvite={noop}
        />
      </div>
    ),
  },
  {
    // Escena de JUGAR a pantalla completa con una FOTO REAL (issue #652): el mapa
    // de adivinar sigue stubeado en galería, pero queda reducido al mini-mapa de
    // esquina (pequeño), no protagonista — la escena a sangre es la foto real.
    id: 'showcase-jugar',
    title: 'Showcase · Jugar (foto real a pantalla completa)',
    section: 'Showcase',
    render: () => (
      <GameScene
        title={SHOWCASE_JUGAR_TITLE}
        scene={SHOWCASE_JUGAR_SCENE}
        sceneReady
        remaining={22}
        guessSeconds={30}
        backLabel="Salir (sigue el tiempo)"
        onBack={noop}
        guess={null}
        onGuess={noop}
        mapOpen={false}
        onOpenMap={noop}
        onCloseMap={noop}
        meUserId={ME_ID}
        onConfirm={noop}
        photoExpanded={false}
        onExpandPhoto={noop}
        onClosePhoto={noop}
      />
    ),
  },
  {
    // Mapa EXPANDIDO de "Adivinar" (issue #789): el mapa domina la pantalla, con
    // el contador siempre visible arriba y las dos acciones de primera clase
    // debajo — "Volver a la foto" (sigue explorando) y "Confirmar posición" (confirma).
    // `guess` ya puesto: comprueba que el botón de confirmar se habilita.
    id: 'showcase-jugar-mapa-expandido',
    title: 'Showcase · Jugar (mapa expandido, ida y vuelta)',
    section: 'Showcase',
    render: () => (
      <GameScene
        title={SHOWCASE_JUGAR_TITLE}
        scene={SHOWCASE_JUGAR_SCENE}
        sceneReady
        remaining={22}
        guessSeconds={30}
        backLabel="Salir (sigue el tiempo)"
        onBack={noop}
        guess={{ lat: 41.9, lng: 12.5 }}
        onGuess={noop}
        mapOpen
        onOpenMap={noop}
        onCloseMap={noop}
        meUserId={ME_ID}
        onConfirm={noop}
        photoExpanded={false}
        onExpandPhoto={noop}
        onClosePhoto={noop}
      />
    ),
  },
  {
    // Reveal recortado al bloque que SÍ luce (issue #652): el revelado real de
    // PlayChallenge antepone un mapa a 62svh (rectángulo azul pizarra liso bajo el
    // stub de la galería) que se come media pantalla sin vender nada. Aquí solo el
    // anillo teal + puntos (ScoreRing, SVG/CSS puro) y la foto sorpresa real.
    id: 'showcase-reveal',
    title: 'Showcase · Reveal (anillo teal + puntos)',
    section: 'Showcase',
    render: () => (
      <main className="lg-page">
        <Stack gap={4}>
          <BackHomeButton onClick={noop} label="Volver al viaje" />
          <h1>{SHOWCASE_REVEAL_TITLE}</h1>
          <Card padding="md" raised>
            <Stack gap={4} align="center">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <IconTrofeo size={16} />
                ¡Gran tiro!
              </span>
              <ScoreRing value={SHOWCASE_REVEAL_POINTS} max={SHOWCASE_REVEAL_MAX_POINTS} size={168}>
                {/* Número ESTÁTICO, no `CountUp` (issue #652): la captura es una
                    imagen fija — un conteo a medio animar (`CountUp` no respeta
                    `disableAnimations`, solo `prefers-reduced-motion`) haría el
                    valor no determinista entre corridas de la galería. */}
                <span>{SHOWCASE_REVEAL_POINTS.toLocaleString('es-ES')}</span>
                <span>puntos</span>
              </ScoreRing>
              <Stack gap={1} align="center">
                <strong>Muy cerca</strong>
                <span>a {SHOWCASE_REVEAL_DISTANCE_KM.toLocaleString('es-ES')} km del objetivo</span>
                <span>
                  {SHOWCASE_REVEAL_RANK.position}º de {SHOWCASE_REVEAL_RANK.total}
                </span>
              </Stack>
            </Stack>
          </Card>
          <ChallengePhoto
            src={SHOWCASE_REVEAL_PHOTO}
            alt="Foto del reto"
            caption="La foto del reto"
          />
        </Stack>
      </main>
    ),
  },
]

export function findCase(id: string | null): GalleryCase | undefined {
  return cases.find((c) => c.id === id)
}
