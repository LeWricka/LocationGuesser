import { describe, test, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HomeDashboard } from './HomeDashboard'
import type { HomeGroup, HomePinned } from './HomeDashboard'
import type { GlobePin } from './HomeGlobe'

// Doble de HomeGlobe: la escena inmersiva de HomeDashboard ya no necesita levantar
// maplibre-gl para probarse (eso lo cubre HomeGlobe.test.tsx). Aquí solo nos importa
// el CONTRATO — qué props recibe el globo, en particular `activeTargetId` al
// sincronizar con la tarjeta centrada del carrusel (issue #568, contrato de #567).
// `vi.mock` se iza (hoist) sobre los imports de arriba, así que esto sustituye al
// módulo real ya para el `import { HomeDashboard }` de esta misma línea.
const homeGlobeSpy = vi.fn()
vi.mock('./HomeGlobe', () => ({
  HomeGlobe: (props: { activeTargetId?: string | null; pins: GlobePin[] }) => {
    homeGlobeSpy(props)
    return null
  },
}))

const groups: HomeGroup[] = [
  { id: 'a', name: "Interrail '26", status: 'toplay', owned: true },
  { id: 'b', name: 'Finde Lisboa', status: 'live' },
  { id: 'c', name: 'Pirineos', status: 'idle' },
]

const pinned: HomePinned = {
  groupId: 'a',
  challengeId: 'ch1',
  title: '¿Dónde tomé esta foto?',
  groupName: 'Japón',
  deadlineAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
  coverUrl: null,
}

describe('HomeDashboard (escena única inmersiva, issue #568)', () => {
  // La transición héroe (issue #589) usa sessionStorage como puente entre montajes
  // (ver HomeDashboard.tsx); sin limpiarlo, un test que "toca" una tarjeta dejaría
  // un id pendiente que un test posterior consumiría por error.
  afterEach(() => {
    sessionStorage.clear()
  })

  test('el carrusel lista los viajes y cierra con "Nuevo viaje"', () => {
    render(<HomeDashboard userId="u1" displayName="Lewis" groups={groups} />)
    expect(screen.getByRole('heading', { name: 'Tus viajes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: "Abrir viaje Interrail '26" })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir viaje Finde Lisboa' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir viaje Pirineos' })).toBeInTheDocument()
    // Tarjeta final "Nuevo viaje": único punto de crear (sin FAB aparte, issue #568).
    expect(screen.getByRole('button', { name: 'Empezar un viaje nuevo' })).toBeInTheDocument()
    expect(screen.getByText('Nuevo viaje')).toBeInTheDocument()
  })

  test('cada tarjeta del carrusel abre su viaje', async () => {
    const onOpenGroup = vi.fn()
    render(
      <HomeDashboard userId="u1" displayName="Lewis" groups={groups} onOpenGroup={onOpenGroup} />,
    )
    await userEvent.click(screen.getByRole('button', { name: "Abrir viaje Interrail '26" }))
    expect(onOpenGroup).toHaveBeenCalledWith('a')
  })

  test('marca "En curso"/"Te toca" en los viajes con reto abierto', () => {
    render(<HomeDashboard userId="u1" displayName="Lewis" groups={groups} />)
    // 'toplay' → "Te toca"; 'live' → "En curso"; 'idle' → sin indicador.
    expect(screen.getByText('Te toca')).toBeInTheDocument()
    expect(screen.getByText('En curso')).toBeInTheDocument()
  })

  test('las tarjetas propias llevan la corona y la señal data-owned; las de amigos no', () => {
    const { container } = render(<HomeDashboard userId="u1" displayName="Lewis" groups={groups} />)
    // Solo 'a' es propio en la fixture.
    const ownedCard = container.querySelector('[data-gid="a"] button[data-owned="true"]')
    expect(ownedCard).not.toBeNull()
    expect(container.querySelector('[data-gid="b"] button[data-owned]')).toBeNull()
    expect(container.querySelector('[data-gid="c"] button[data-owned]')).toBeNull()
  })

  test('"Nuevo viaje" crea un viaje', async () => {
    const onCreateGroup = vi.fn()
    render(
      <HomeDashboard
        userId="u1"
        displayName="Lewis"
        groups={groups}
        onCreateGroup={onCreateGroup}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Empezar un viaje nuevo' }))
    expect(onCreateGroup).toHaveBeenCalled()
  })

  test('el chip "Te toca jugar" se pinta con reto pendiente y su tap dispara jugar', async () => {
    const onPlayPinned = vi.fn()
    render(
      <HomeDashboard
        userId="u1"
        displayName="Lewis"
        groups={groups}
        pinned={pinned}
        onPlayPinned={onPlayPinned}
      />,
    )
    expect(screen.getByText('Te toca jugar')).toBeInTheDocument()
    expect(screen.getByText('¿Dónde tomé esta foto?')).toBeInTheDocument()
    // Todo el chip es el botón: un único tap dispara onPlayPinned.
    await userEvent.click(screen.getByText('¿Dónde tomé esta foto?'))
    expect(onPlayPinned).toHaveBeenCalled()
  })

  test('sin reto fijado, el chip "Te toca jugar" no se pinta', () => {
    render(<HomeDashboard userId="u1" displayName="Lewis" groups={groups} pinned={null} />)
    expect(screen.queryByText('Te toca jugar')).not.toBeInTheDocument()
  })

  test('un viaje sin portada muestra el fondo "mapa nocturno" con pin, sin inicial gigante', () => {
    const { container } = render(<HomeDashboard userId="u1" displayName="Lewis" groups={groups} />)
    // Los tres viajes de prueba no traen coverUrl → cada tarjeta pinta su placeholder.
    expect(container.querySelectorAll('span[class*="placeholder"]')).toHaveLength(3)
    // La inicial gigante como marca de agua ya no existe (parecía un bug).
    expect(screen.queryByText('I')).not.toBeInTheDocument()
    expect(screen.queryByText('F')).not.toBeInTheDocument()
    expect(screen.queryByText('P')).not.toBeInTheDocument()
  })

  test('el avatar abre el perfil', async () => {
    const onOpenProfile = vi.fn()
    render(
      <HomeDashboard
        userId="u1"
        displayName="Lewis"
        groups={groups}
        onOpenProfile={onOpenProfile}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Abrir tu perfil' }))
    expect(onOpenProfile).toHaveBeenCalled()
  })

  test('arranca con el primer viaje del carrusel como activeTargetId del globo', () => {
    render(<HomeDashboard userId="u1" displayName="Lewis" groups={groups} />)
    // sortTrips pone primero los viajes que piden acción ('a' es 'toplay').
    const lastCall = homeGlobeSpy.mock.calls.at(-1)?.[0]
    expect(lastCall.activeTargetId).toBe('a')
  })

  test('activeTargetId sigue a la tarjeta con el foco (navegación por teclado)', () => {
    homeGlobeSpy.mockClear()
    render(<HomeDashboard userId="u1" displayName="Lewis" groups={groups} />)
    fireEvent.focus(screen.getByRole('button', { name: 'Abrir viaje Finde Lisboa' }))
    const lastCall = homeGlobeSpy.mock.calls.at(-1)?.[0]
    expect(lastCall.activeTargetId).toBe('b')
  })

  test('el foco en "Nuevo viaje" apaga el activeTargetId (sin viaje activo)', () => {
    homeGlobeSpy.mockClear()
    render(<HomeDashboard userId="u1" displayName="Lewis" groups={groups} />)
    fireEvent.focus(screen.getByRole('button', { name: 'Empezar un viaje nuevo' }))
    const lastCall = homeGlobeSpy.mock.calls.at(-1)?.[0]
    expect(lastCall.activeTargetId).toBeNull()
  })

  // Transición héroe home→diario (issue #589): view-transition-name compartido con
  // TripDiario. Debe ser ÚNICO en pantalla, así que solo la tarjeta TOCADA lo lleva.
  describe('transición héroe (issue #589)', () => {
    // La foto/placeholder héroe vive dentro de la tarjeta (`li[data-gid]`), como
    // `.cover` (con portada) o `.placeholder` (sin portada, caso de estas fixtures).
    const heroNameOf = (container: HTMLElement, groupId: string) =>
      container.querySelector<HTMLElement>(
        `[data-gid="${groupId}"] span[class*="cover"], [data-gid="${groupId}"] span[class*="placeholder"]`,
      )?.style.viewTransitionName

    test('al tocar una tarjeta, solo ella reclama el nombre compartido', async () => {
      const onOpenGroup = vi.fn()
      const { container } = render(
        <HomeDashboard userId="u1" displayName="Lewis" groups={groups} onOpenGroup={onOpenGroup} />,
      )

      await userEvent.click(screen.getByRole('button', { name: 'Abrir viaje Finde Lisboa' }))

      expect(heroNameOf(container, 'b')).toBe('trip-hero-b')
      // Las NO tocadas se quedan sin nombre (única en pantalla).
      expect(heroNameOf(container, 'a')).toBeFalsy()
      expect(heroNameOf(container, 'c')).toBeFalsy()
    })

    test('al volver del diario, la tarjeta de ese viaje reclama el nombre al montar', () => {
      // Simula la "vuelta": HomeDashboard.tsx guardó este id en sessionStorage al
      // salir hacia el viaje 'c'; ahora la Home se remonta de cero.
      sessionStorage.setItem('lg-hero-trip-id', 'c')

      const { container } = render(
        <HomeDashboard userId="u1" displayName="Lewis" groups={groups} />,
      )

      expect(heroNameOf(container, 'c')).toBe('trip-hero-c')
      expect(heroNameOf(container, 'a')).toBeFalsy()
      // Consumo único: no debe quedar pendiente para una vuelta futura sin relación.
      expect(sessionStorage.getItem('lg-hero-trip-id')).toBeNull()
    })
  })

  // Filtro Míos/De amigos sobre el carrusel (issue #609). `groups` ya trae mezcla
  // (a=propio, b y c=de amigos), así que los chips aparecen por defecto en este bloque.
  describe('filtro Todos · Míos · De amigos (issue #609)', () => {
    const onlyMine: HomeGroup[] = [
      { id: 'a', name: "Interrail '26", status: 'toplay', owned: true },
      { id: 'c', name: 'Pirineos', status: 'idle', owned: true },
    ]
    const onlyFriends: HomeGroup[] = [
      { id: 'b', name: 'Finde Lisboa', status: 'live' },
      { id: 'c', name: 'Pirineos', status: 'idle' },
    ]

    test('con mezcla de propios y de amigos, los chips se pintan y "Todos" arranca activo', () => {
      render(<HomeDashboard userId="u1" displayName="Lewis" groups={groups} />)
      const todos = screen.getByRole('button', { name: 'Todos' })
      expect(todos).toBeInTheDocument()
      expect(todos).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: 'Míos' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'De amigos' })).toBeInTheDocument()
    })

    test('si todos los viajes son propios, los chips se ocultan (no aportan)', () => {
      render(<HomeDashboard userId="u1" displayName="Lewis" groups={onlyMine} />)
      expect(screen.queryByRole('button', { name: 'Todos' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Míos' })).not.toBeInTheDocument()
      // Sin filtro que aplicar: los dos viajes se ven igualmente.
      expect(screen.getByRole('button', { name: "Abrir viaje Interrail '26" })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Abrir viaje Pirineos' })).toBeInTheDocument()
    })

    test('si todos los viajes son de amigos, los chips se ocultan (no aportan)', () => {
      render(<HomeDashboard userId="u1" displayName="Lewis" groups={onlyFriends} />)
      expect(screen.queryByRole('button', { name: 'De amigos' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Abrir viaje Finde Lisboa' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Abrir viaje Pirineos' })).toBeInTheDocument()
    })

    test('"Míos" deja solo los viajes propios; "De amigos" solo los ajenos', async () => {
      render(<HomeDashboard userId="u1" displayName="Lewis" groups={groups} />)

      await userEvent.click(screen.getByRole('button', { name: 'Míos' }))
      expect(screen.getByRole('button', { name: "Abrir viaje Interrail '26" })).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Abrir viaje Finde Lisboa' }),
      ).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Abrir viaje Pirineos' })).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'De amigos' }))
      expect(
        screen.queryByRole('button', { name: "Abrir viaje Interrail '26" }),
      ).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Abrir viaje Finde Lisboa' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Abrir viaje Pirineos' })).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Todos' }))
      expect(screen.getByRole('button', { name: "Abrir viaje Interrail '26" })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Abrir viaje Finde Lisboa' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Abrir viaje Pirineos' })).toBeInTheDocument()
    })

    test('cambiar de filtro salta el activeTargetId del globo al primer viaje visible', async () => {
      homeGlobeSpy.mockClear()
      render(<HomeDashboard userId="u1" displayName="Lewis" groups={groups} />)

      await userEvent.click(screen.getByRole('button', { name: 'De amigos' }))
      // sortTrips prioriza 'live' sobre 'idle': 'b' (live) antes que 'c' (idle).
      const lastCall = homeGlobeSpy.mock.calls.at(-1)?.[0]
      expect(lastCall.activeTargetId).toBe('b')
    })

    test('la elección de filtro se recuerda en sessionStorage entre montajes', async () => {
      const { unmount } = render(<HomeDashboard userId="u1" displayName="Lewis" groups={groups} />)
      await userEvent.click(screen.getByRole('button', { name: 'Míos' }))
      expect(sessionStorage.getItem('lg-home-trip-filter')).toBe('mine')
      unmount()

      render(<HomeDashboard userId="u1" displayName="Lewis" groups={groups} />)
      expect(screen.getByRole('button', { name: 'Míos' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: "Abrir viaje Interrail '26" })).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Abrir viaje Finde Lisboa' }),
      ).not.toBeInTheDocument()
    })

    test('filtro sin resultados: aviso corto + botón para volver a "Todos"', async () => {
      // Filtro guardado de una sesión con mezcla, pero los viajes actuales ya no la
      // tienen (p.ej. los viajes de amigos desaparecieron): los chips se ocultan
      // (mismo criterio de "no aporta"), pero el filtro sigue aplicado — el
      // carrusel quedaría vacío sin este aviso.
      sessionStorage.setItem('lg-home-trip-filter', 'friends')
      render(<HomeDashboard userId="u1" displayName="Lewis" groups={onlyMine} />)

      expect(screen.queryByRole('button', { name: 'De amigos' })).not.toBeInTheDocument()
      expect(screen.getByText('No tienes viajes de amigos con este filtro.')).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: "Abrir viaje Interrail '26" }),
      ).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Ver todos' }))
      expect(screen.getByRole('button', { name: "Abrir viaje Interrail '26" })).toBeInTheDocument()
      expect(sessionStorage.getItem('lg-home-trip-filter')).toBe('all')
    })
  })
})
