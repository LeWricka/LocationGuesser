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
import { HomePage } from '../features/home/HomePage'
import { TripPage } from '../features/trip/TripPage'
import { PlayChallenge } from '../features/play/PlayChallenge'
import { PlayNumberChallenge } from '../features/play/PlayNumberChallenge'
import { CreateGroup } from '../features/create/CreateGroup'
import { AddMoment } from '../features/create/AddMoment'
import { CreateChallengeFlow } from '../features/create/CreateChallengeFlow'
import { EditChallenge } from '../features/group/EditChallenge'
import { MomentGallery } from '../features/trip/MomentGallery'
import { GroupSettingsModal } from '../features/group/GroupSettingsModal'
import { ResultCard } from '../features/play/ResultCard'
import { HomeDashboard, LoginScreen, type HomeGroup, type HomePinned } from '../ui'
import type { GlobePin } from '../ui'
import type { ChallengeForPlay } from '../lib/challenges'
import {
  CHALLENGES,
  CH_ACTIVE,
  CH_CLOSED,
  CH_MEMORY,
  CH_NUMBER,
  GALLERY_NOW,
  GROUP,
  GROUP_ID,
  ME_ID,
  setEmptyWorld,
} from './fixtures'

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
    id: 'crear-adivinas',
    title: 'Crear ¿Adivinas? (selector de tipo)',
    section: 'Crear',
    render: () => (
      <CreateChallengeFlow
        groupId={GROUP_ID}
        groupName={GROUP.name}
        onBack={noop}
        onCreated={noop}
      />
    ),
  },
  {
    id: 'login',
    title: 'Login (entrar a Tabide)',
    section: 'Entrar',
    render: () => <LoginScreen email="" onEmailChange={noop} />,
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
    id: 'detalle-reto-cerrado',
    title: 'Detalle del reto (cerrado, ya jugado)',
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
]

export function findCase(id: string | null): GalleryCase | undefined {
  return cases.find((c) => c.id === id)
}
