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
import { PlayChallenge } from '../features/play/PlayChallenge'
import { PlayNumberChallenge } from '../features/play/PlayNumberChallenge'
import { CreateGroup } from '../features/create/CreateGroup'
import { AddMoment } from '../features/create/AddMoment'
import { CreateNumberChallenge } from '../features/create/CreateNumberChallenge'
import { CreateLocationChallenge } from '../features/create/CreateLocationChallenge'
import { EditChallenge } from '../features/group/EditChallenge'
import { MomentGallery } from '../features/trip/MomentGallery'
import { MomentSheet } from '../features/trip/MomentSheet'
import { GroupSettingsModal } from '../features/group/GroupSettingsModal'
import { InviteModal } from '../features/group/InviteModal'
import { ResultCard } from '../features/play/ResultCard'
import { GameScene } from '../features/play/GameScene'
import { TripDiario } from '../features/trip/TripDiario'
import { OnboardingSlideshow, getSlides } from '../features/onboarding'
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
  ME_ID,
  setEmptyWorld,
} from './fixtures'
import {
  SHOWCASE_HOME_GROUPS,
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
import { HOME_DEMO_PINS } from '../features/home/homeDemoPins'

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
  },
  {
    id: 'viaje-alpes',
    name: 'Ruta por los Alpes',
    status: 'idle',
    owned: true,
    closed: true,
    startsOn: '2026-04-04',
  },
  {
    id: 'viaje-lisboa',
    name: 'Finde en Lisboa',
    status: 'live',
    startsOn: '2026-05-02',
    endsOn: '2026-05-05',
  },
]
const dashboardPins: GlobePin[] = [
  {
    id: 'p1',
    lat: 35.0116,
    lng: 135.7681,
    title: 'Japón · Kioto',
    imageUrl: null,
    targetId: GROUP_ID,
    lead: true,
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
    // Issue #645: galería completa del viaje agrupada por día. El mundo
    // sembrado ya trae un recuerdo con galería multi-foto (CH_MEMORY, 3 fotos)
    // y un reto EN JUEGO con foto SORPRESA (CH_ACTIVE_SORPRESA, `photo_is_hint:
    // false`) que NO debe aparecer — vigilancia visual del filtro anti-spoiler.
    id: 'viaje-fotos',
    title: 'Viaje · Fotos',
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
          link={`https://tabide.app/v/${GROUP_ID}`}
          challengeCount={CHALLENGES.length}
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
    title: 'Crear ¿Dónde? · Paso 1 (el sitio, sin pin)',
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
    title: 'Crear ¿Dónde? · Paso 1 (tarjeta SV inline)',
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
    title: 'Crear ¿Dónde? · Paso 1 (sin cobertura de Street View)',
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
    title: 'Crear ¿Dónde? · Paso 2 (las reglas)',
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
    id: 'editar-reto',
    title: 'Editar reto',
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
        domain="tabide.app"
      />
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
  {
    id: 'onboarding-bienvenida-receptor',
    title: 'Onboarding · bienvenida del receptor (adaptada al viaje)',
    section: 'Onboarding',
    render: () => (
      <OnboardingSlideshow
        slides={getSlides('welcome', { tripName: 'Japón 2026' })}
        onSkip={noop}
        onComplete={noop}
      />
    ),
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
        pins={HOME_DEMO_PINS}
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
