import { describe, test, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { MarcadorTab } from './MarcadorTab'
import { ToastProvider } from '../../ui'
import type { LeaderboardEntry } from '../../lib/leaderboard'
import type { PastChallengeSummary } from './useTripData'

// Simula prefers-reduced-motion para que CountUp (dentro de MarcadorTab) no
// dependa del jsdom real, que no implementa matchMedia (mismo patrón que
// src/ui/CountUp.test.tsx). Reduced-motion muestra el valor final directo, que
// es justo lo que queremos comprobar por texto en los tests de contenido.
function mockReducedMotion(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function entry(overrides: Partial<LeaderboardEntry>): LeaderboardEntry {
  return { userId: 'u1', name: 'Ana', avatar: null, points: 100, plays: 2, ...overrides }
}

const noop = () => {}

// Props obligatorias de rescate (issue #608: premios, retos anteriores,
// compartir) con valores neutros — cada test override solo lo que le importa.
const baseProps = {
  groupId: 'g1',
  groupName: 'Japón en primavera',
  prizes: null,
  pastChallenges: [] as PastChallengeSummary[],
  onOpenChallenge: noop,
  onPrizesSaved: noop,
  onInvite: noop,
  onAddChallenge: noop,
  canCreate: false,
}

// Monta SIEMPRE dentro de `<ToastProvider>`: el marcador rescató de GroupPage el
// FAB "Compartir" (ShareLeaderboardModal) y el editor de premios, y ambos usan
// `useToast()` en su cuerpo — se montan (aunque cerrados) siempre que hay
// clasificación o el dueño edita, así que el test necesita el provider real.
function renderMarcador(
  props: Partial<ComponentProps<typeof MarcadorTab>> & { leaderboard: LeaderboardEntry[] },
) {
  return render(
    <ToastProvider>
      <MarcadorTab {...baseProps} {...props} />
    </ToastProvider>,
  )
}

describe('MarcadorTab', () => {
  test('estado vacío: mensaje + invitar (y crear reto si puede)', () => {
    renderMarcador({ leaderboard: [], canCreate: true })
    expect(
      screen.getByText('Cuando alguien adivine un reto, aquí aparecerá la clasificación.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Invitar/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Crear un reto/ })).toBeInTheDocument()
  })

  test('con ≤3 jugadores solo hay podio (sin lista compacta debajo)', () => {
    mockReducedMotion(true)
    const board = [
      entry({ userId: 'u1', name: 'Ana', points: 300 }),
      entry({ userId: 'u2', name: 'Beto', points: 200 }),
      entry({ userId: 'u3', name: 'Caro', points: 50 }),
    ]
    renderMarcador({ leaderboard: board, canCreate: false })
    expect(screen.getByRole('list', { name: 'Podio' })).toBeInTheDocument()
    expect(
      screen.queryByRole('list', { name: 'Resto de la clasificación' }),
    ).not.toBeInTheDocument()
    const filas = screen.getAllByRole('listitem')
    expect(filas).toHaveLength(3)
    expect(filas[0]).toHaveTextContent('Ana')
    expect(filas[1]).toHaveTextContent('Beto')
    expect(filas[2]).toHaveTextContent('Caro')
  })

  test('con 1 jugador, el podio muestra solo al líder', () => {
    mockReducedMotion(true)
    const board = [entry({ userId: 'u1', name: 'Ana', points: 300 })]
    renderMarcador({ leaderboard: board, canCreate: false })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('Ana')).toBeInTheDocument()
  })

  test('4º en adelante cae en la lista compacta, ordenada por puntos desc, con nº de partidas', () => {
    mockReducedMotion(true)
    const board = [
      entry({ userId: 'u1', name: 'Ana', points: 400 }),
      entry({ userId: 'u2', name: 'Beto', points: 300 }),
      entry({ userId: 'u3', name: 'Caro', points: 200 }),
      entry({ userId: 'u4', name: 'Dani', points: 90, plays: 5 }),
      entry({ userId: 'u5', name: 'Eva', points: 80, plays: 1 }),
    ]
    renderMarcador({ leaderboard: board, canCreate: false })
    expect(screen.getByRole('list', { name: 'Podio' })).toBeInTheDocument()
    const resto = screen.getByRole('list', { name: 'Resto de la clasificación' })
    expect(resto).toBeInTheDocument()

    // Orden del DOM: podio (1º-3º) primero, luego la lista compacta (4º+); ambos
    // en orden de puntos desc.
    const filas = screen.getAllByRole('listitem')
    expect(filas).toHaveLength(5)
    expect(filas.map((f) => f.textContent)).toEqual([
      expect.stringContaining('Ana'),
      expect.stringContaining('Beto'),
      expect.stringContaining('Caro'),
      expect.stringContaining('Dani'),
      expect.stringContaining('Eva'),
    ])
    expect(screen.getByText('5 partidas')).toBeInTheDocument()
    expect(screen.getByText('1 partida')).toBeInTheDocument()
  })

  test('la barra de la lista compacta es proporcional a los puntos del líder del viaje', () => {
    mockReducedMotion(true)
    const board = [
      entry({ userId: 'u1', name: 'Ana', points: 400 }),
      entry({ userId: 'u2', name: 'Beto', points: 300 }),
      entry({ userId: 'u3', name: 'Caro', points: 200 }),
      entry({ userId: 'u4', name: 'Dani', points: 100 }),
      entry({ userId: 'u5', name: 'Eva', points: 20 }),
    ]
    renderMarcador({ leaderboard: board, canCreate: false })
    const resto = screen.getByRole('list', { name: 'Resto de la clasificación' })
    const filasResto = resto.querySelectorAll('li')
    const barraDani = filasResto[0].querySelector('[style*="--bar-pct"]') as HTMLElement
    const barraEva = filasResto[1].querySelector('[style*="--bar-pct"]') as HTMLElement
    // Dani: 100/400 = 25% del líder (Ana, no del podio en general).
    expect(barraDani.style.getPropertyValue('--bar-pct')).toBe('0.25')
    // Eva: 20/400 = 5%, pero el suelo del 8% evita que la barra desaparezca.
    expect(barraEva.style.getPropertyValue('--bar-pct')).toBe('0.08')
    // El podio no lleva barra de puntuación (su jerarquía la da la composición).
    const podio = screen.getByRole('list', { name: 'Podio' })
    expect(podio.querySelector('[style*="--bar-pct"]')).toBeNull()
  })

  test('el puesto 1º lleva la clase de líder; "Tú" solo aparece en la propia columna', () => {
    mockReducedMotion(true)
    const board = [
      entry({ userId: 'u1', name: 'Ana', points: 300 }),
      entry({ userId: 'u2', name: 'Beto', points: 100 }),
    ]
    const { container } = renderMarcador({ leaderboard: board, myUserId: 'u2', canCreate: false })
    const filas = container.querySelectorAll('li')
    // Columna del líder: clase de puesto 1º; no es "Tú" (no coincide con myUserId).
    expect(filas[0].className).toMatch(/podio1/)
    expect(filas[0]).not.toHaveTextContent('Tú')
    // Columna propia (no líder, puesto 2º): etiqueta "Tú" — sin teñir toda la
    // columna de teal, que competiría con el color del puesto (issue #594).
    expect(filas[1].className).toMatch(/podio2/)
    expect(filas[1]).toHaveTextContent('Tú')
    expect(filas[1]).toHaveAttribute('aria-current', 'true')
  })

  // --- Rescates de GroupPage (issue #608) ------------------------------------

  test('premios: chip junto al puesto premiado en el podio y en la lista, no en el resto', () => {
    mockReducedMotion(true)
    const board = [
      entry({ userId: 'u1', name: 'Ana', points: 400 }),
      entry({ userId: 'u2', name: 'Beto', points: 300 }),
      entry({ userId: 'u3', name: 'Caro', points: 200 }),
      entry({ userId: 'u4', name: 'Dani', points: 100 }),
    ]
    renderMarcador({
      leaderboard: board,
      canCreate: false,
      prizes: { first: 'Elige destino', last: 'Invita a las cañas' },
    })
    expect(screen.getByText('Elige destino')).toBeInTheDocument()
    expect(screen.getByText('Invita a las cañas')).toBeInTheDocument()
    // Beto (2º) y Caro (3º) no tienen premio definido.
    expect(screen.queryByText('Beto')?.closest('li')).not.toHaveTextContent('Premio')
  })

  test('premios: el dueño ve "Añadir premios" cuando aún no hay ninguno', () => {
    renderMarcador({ leaderboard: [], canCreate: true })
    expect(screen.getByRole('button', { name: /Añadir premios/ })).toBeInTheDocument()
  })

  test('premios: un miembro (no dueño) no ve el botón de editar premios', () => {
    renderMarcador({ leaderboard: [], canCreate: false })
    expect(screen.queryByRole('button', { name: /premios/i })).not.toBeInTheDocument()
  })

  test('premios: con premios ya definidos, el dueño ve "Editar premios" y abre el editor', async () => {
    const user = userEvent.setup()
    renderMarcador({ leaderboard: [], canCreate: true, prizes: { first: 'Elige destino' } })
    const btn = screen.getByRole('button', { name: /Editar premios/ })
    await user.click(btn)
    expect(screen.getByText('Premios del viaje')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Elige destino')).toBeInTheDocument()
  })

  test('retos anteriores: no se muestra la sección sin retos cerrados', () => {
    renderMarcador({ leaderboard: [], canCreate: false })
    expect(screen.queryByText('Retos anteriores')).not.toBeInTheDocument()
  })

  test('retos anteriores: ganador, mi resultado y el aviso anti-trampa; tocar abre el detalle', async () => {
    const user = userEvent.setup()
    const onOpenChallenge = vi.fn()
    const pastChallenges: PastChallengeSummary[] = [
      {
        challengeId: 'c1',
        title: 'El bosque de bambú',
        closedAt: '2026-06-10T10:00:00.000Z',
        isOwn: false,
        winner: { name: 'Marta', points: 4880, distanceKm: 1.2, leftApp: true },
        myResult: { points: 3100, distanceKm: 42, leftApp: false },
      },
      {
        challengeId: 'c2',
        title: 'El Pabellón Dorado',
        closedAt: '2026-06-08T10:00:00.000Z',
        isOwn: true,
        winner: null,
        myResult: null,
      },
    ]
    renderMarcador({ leaderboard: [], canCreate: false, pastChallenges, onOpenChallenge })
    expect(screen.getByText('Retos anteriores')).toBeInTheDocument()
    expect(screen.getByText(/Marta · 4.?880 pts/)).toBeInTheDocument()
    expect(screen.getByText(/^3.?100 pts$/)).toBeInTheDocument()
    expect(screen.getAllByLabelText('Salió de la app durante la jugada')).toHaveLength(1)
    // El segundo reto es mío (sin votos): "Se cerró sin votos" + "Tu reto".
    expect(screen.getByText('Se cerró sin votos')).toBeInTheDocument()
    expect(screen.getByText('Tu reto')).toBeInTheDocument()

    await user.click(screen.getByText('El bosque de bambú'))
    expect(onOpenChallenge).toHaveBeenCalledWith('c1')
  })

  test('compartir: el FAB solo aparece con clasificación', () => {
    const { rerender } = renderMarcador({ leaderboard: [], canCreate: false })
    expect(
      screen.queryByRole('button', { name: /Compartir clasificación/ }),
    ).not.toBeInTheDocument()

    rerender(
      <ToastProvider>
        <MarcadorTab {...baseProps} leaderboard={[entry({})]} canCreate={false} />
      </ToastProvider>,
    )
    expect(screen.getByRole('button', { name: /Compartir clasificación/ })).toBeInTheDocument()
  })
})
