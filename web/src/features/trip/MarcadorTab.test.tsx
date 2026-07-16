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

function pastChallenge(overrides: Partial<PastChallengeSummary>): PastChallengeSummary {
  return {
    challengeId: 'c1',
    title: 'El bosque de bambú',
    status: 'closed',
    closedAt: '2026-06-10T10:00:00.000Z',
    isOwn: false,
    winner: null,
    myResult: null,
    imageUrl: null,
    ...overrides,
  }
}

const noop = () => {}

// Props obligatorias de rescate (issue #608: premios, retos anteriores,
// compartir) con valores neutros — cada test override solo lo que le importa.
const baseProps = {
  groupId: 'g1',
  prizes: null,
  pastChallenges: [] as PastChallengeSummary[],
  onPlayChallenge: noop,
  onViewChallenge: noop,
  onPrizesSaved: noop,
  onInvite: noop,
  onAddChallenge: noop,
  canCreate: false,
  isOwner: false,
}

// Monta SIEMPRE dentro de `<ToastProvider>`: el editor de premios
// (`PrizesEditorModal`, rescatado de GroupPage) usa `useToast()` en su cuerpo
// — se monta (aunque cerrado) cuando el dueño edita, así que el test necesita
// el provider real. El FAB "Compartir clasificación" que vivía aquí se retiró
// en el issue #758 (ahora es un item de la hoja "Compartir" de `TripPage`).
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
  // --- Vacío (issue #753: podio visual, no párrafo) --------------------------

  test('vacío: podio de 3 huecos de avatar + copy de una línea + invitar (y crear reto si puede)', () => {
    renderMarcador({ leaderboard: [], canCreate: true })
    // El podio "promesa" existe aunque no haya jugadores (mismo landmark que el real).
    const podio = screen.getByRole('list', { name: 'Podio' })
    expect(podio.querySelectorAll('li')).toHaveLength(3)
    expect(
      screen.getByText('Aún no hay clasificación. Juega el primer reto y aparecerá aquí.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Invitar/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Crear un reto/ })).toBeInTheDocument()
  })

  test('vacío: sin poder crear, no se ofrece "Crear un reto"', () => {
    renderMarcador({ leaderboard: [], canCreate: false })
    expect(screen.queryByRole('button', { name: /Crear un reto/ })).not.toBeInTheDocument()
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

  test('premios: un miembro (no dueño) ve el chip como texto plano, no como botón', () => {
    mockReducedMotion(true)
    const board = [
      entry({ userId: 'u1', name: 'Ana', points: 400 }),
      entry({ userId: 'u2', name: 'Beto', points: 300 }),
      entry({ userId: 'u3', name: 'Caro', points: 200 }),
    ]
    renderMarcador({
      leaderboard: board,
      canCreate: true,
      isOwner: false,
      prizes: { first: 'Elige destino' },
    })
    expect(screen.getByText('Elige destino').closest('button')).toBeNull()
  })

  test('premios (issues #752/#753): sin ninguno definido, el dueño ve la CTA "¿Qué se juega?" en el podio vacío y abre el editor', async () => {
    const user = userEvent.setup()
    renderMarcador({ leaderboard: [], canCreate: true, isOwner: true })
    const cta = screen.getByRole('button', { name: /¿Qué se juega\?/ })
    await user.click(cta)
    expect(screen.getByText('Premios del viaje')).toBeInTheDocument()
  })

  test('premios: un miembro (no dueño) no ve la CTA del vacío', () => {
    renderMarcador({ leaderboard: [], canCreate: true, isOwner: false })
    expect(screen.queryByRole('button', { name: /¿Qué se juega\?/ })).not.toBeInTheDocument()
  })

  // Issue #783: separación explícita canCreate (crear, miembro) vs isOwner
  // (premios, dueño) — un miembro que NO es dueño ve "Crear un reto" pero no
  // la CTA de premios en el mismo podio vacío.
  test('issue #783: un miembro ve "Crear un reto" pero NO la CTA de premios', () => {
    renderMarcador({ leaderboard: [], canCreate: true, isOwner: false })
    expect(screen.getByRole('button', { name: /Crear un reto/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /¿Qué se juega\?/ })).not.toBeInTheDocument()
  })

  test('premios: en el podio vacío con premios ya definidos, el dueño edita tocando el chip', async () => {
    const user = userEvent.setup()
    renderMarcador({
      leaderboard: [],
      canCreate: true,
      isOwner: true,
      prizes: { first: 'Elige destino' },
    })
    // Sin premios, no debería quedar la CTA de "¿Qué se juega?".
    expect(screen.queryByRole('button', { name: /¿Qué se juega\?/ })).not.toBeInTheDocument()
    const chip = screen.getByText('Elige destino').closest('button')
    expect(chip).not.toBeNull()
    await user.click(chip as HTMLButtonElement)
    expect(screen.getByText('Premios del viaje')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Elige destino')).toBeInTheDocument()
  })

  test('premios: en el vacío, el premio del último vive en una píldora BAJO el podio, no en el 3er pedestal', () => {
    renderMarcador({
      leaderboard: [],
      canCreate: true,
      isOwner: false,
      prizes: { last: 'Invita a las cañas' },
    })
    const pill = screen.getByText(/Último: Invita a las cañas/)
    expect(pill).toBeInTheDocument()
    // Fuera del podio: dentro (colgado del 3er pedestal) se leía contradictorio
    // ("¿el 3º es el último?").
    const podio = screen.getByRole('list', { name: 'Podio' })
    expect(podio.contains(pill)).toBe(false)
    // Miembro no dueño: la píldora es texto plano, no un botón.
    expect(pill.closest('button')).toBeNull()
  })

  test('premios: el dueño edita el premio del último tocando la píldora', async () => {
    const user = userEvent.setup()
    renderMarcador({
      leaderboard: [],
      canCreate: true,
      isOwner: true,
      prizes: { last: 'Invita a las cañas' },
    })
    const pill = screen.getByText(/Último: Invita a las cañas/).closest('button')
    expect(pill).not.toBeNull()
    await user.click(pill as HTMLButtonElement)
    expect(screen.getByText('Premios del viaje')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Invita a las cañas')).toBeInTheDocument()
  })

  test('retos anteriores: no se muestra la sección sin retos cerrados', () => {
    renderMarcador({ leaderboard: [], canCreate: false })
    expect(screen.queryByText('Retos anteriores')).not.toBeInTheDocument()
  })

  test('retos anteriores: ganador, mi resultado y el aviso anti-trampa; tocar un CERRADO abre el detalle', async () => {
    const user = userEvent.setup()
    const onViewChallenge = vi.fn()
    const onPlayChallenge = vi.fn()
    const pastChallenges: PastChallengeSummary[] = [
      pastChallenge({
        challengeId: 'c1',
        title: 'El bosque de bambú',
        winner: { name: 'Marta', points: 4880, distanceKm: 1.2, leftApp: true },
        myResult: { points: 3100, distanceKm: 42, leftApp: false },
      }),
      pastChallenge({
        challengeId: 'c2',
        title: 'El Pabellón Dorado',
        closedAt: '2026-06-08T10:00:00.000Z',
        isOwn: true,
      }),
    ]
    renderMarcador({
      leaderboard: [],
      canCreate: false,
      pastChallenges,
      onViewChallenge,
      onPlayChallenge,
    })
    expect(screen.getByText('Retos anteriores')).toBeInTheDocument()
    expect(screen.getByText(/Marta · 4.?880 pts/)).toBeInTheDocument()
    expect(screen.getByText(/^3.?100 pts$/)).toBeInTheDocument()
    expect(screen.getAllByLabelText('Salió de la app durante la jugada')).toHaveLength(1)
    // El segundo reto es mío (sin votos): "Se cerró sin votos" + "Tu reto".
    expect(screen.getByText('Se cerró sin votos')).toBeInTheDocument()
    expect(screen.getByText('Tu reto')).toBeInTheDocument()

    await user.click(screen.getByText('El bosque de bambú'))
    expect(onViewChallenge).toHaveBeenCalledWith('c1')
    expect(onPlayChallenge).not.toHaveBeenCalled()
  })

  test('retos anteriores (issue #753): thumbnail con la foto del reto, o placeholder si no tiene', () => {
    const pastChallenges: PastChallengeSummary[] = [
      pastChallenge({ challengeId: 'c1', title: 'Con foto', imageUrl: 'https://x/foto.jpg' }),
      pastChallenge({ challengeId: 'c2', title: 'Sin foto', imageUrl: null }),
    ]
    renderMarcador({ leaderboard: [], canCreate: false, pastChallenges })
    // La fila entera es un botón (abre el detalle); dentro, el marco de la foto de
    // ChallengePhoto es un <div> (no anida <button>, zoomable=false).
    const conFoto = screen.getByText('Con foto').closest('button')
    expect(conFoto?.querySelector('img')).toHaveAttribute('src', 'https://x/foto.jpg')
    const sinFoto = screen.getByText('Sin foto').closest('button')
    expect(sinFoto?.querySelector('img')).toBeNull()
  })

  // --- Retos EN JUEGO en la lista (issue #800) --------------------------------

  test('retos anteriores (issue #800): un EN JUEGO lleva el chip "EN JUEGO" y cuenta atrás, sin ganador', () => {
    const pastChallenges: PastChallengeSummary[] = [
      pastChallenge({
        challengeId: 'c1',
        title: 'El templo dorado',
        status: 'active',
        closedAt: '2026-06-15T13:00:00.000Z', // +3h desde el "ahora" congelado abajo
      }),
    ]
    vi.useFakeTimers().setSystemTime(new Date('2026-06-15T10:00:00.000Z'))
    renderMarcador({ leaderboard: [], canCreate: false, pastChallenges })
    expect(screen.getByText('EN JUEGO')).toBeInTheDocument()
    expect(screen.getByText(/quedan 3 h/)).toBeInTheDocument()
    expect(screen.queryByText('Se cerró sin votos')).not.toBeInTheDocument()
    expect(screen.getByText('Aún sin jugar')).toBeInTheDocument()
    vi.useRealTimers()
  })

  test('retos anteriores (issue #800, anti-spoiler): un EN JUEGO sin jugar va a JUGAR, no al detalle', async () => {
    const user = userEvent.setup()
    const onPlayChallenge = vi.fn()
    const onViewChallenge = vi.fn()
    const pastChallenges: PastChallengeSummary[] = [
      pastChallenge({
        challengeId: 'c1',
        title: 'El templo dorado',
        status: 'active',
        myResult: null,
      }),
    ]
    renderMarcador({
      leaderboard: [],
      canCreate: false,
      pastChallenges,
      onPlayChallenge,
      onViewChallenge,
    })
    await user.click(screen.getByText('El templo dorado'))
    expect(onPlayChallenge).toHaveBeenCalledWith('c1')
    expect(onViewChallenge).not.toHaveBeenCalled()
  })

  test('retos anteriores (issue #800, anti-spoiler): un EN JUEGO YA jugado abre el detalle, no a jugar', async () => {
    const user = userEvent.setup()
    const onPlayChallenge = vi.fn()
    const onViewChallenge = vi.fn()
    const pastChallenges: PastChallengeSummary[] = [
      pastChallenge({
        challengeId: 'c1',
        title: 'El templo dorado',
        status: 'active',
        myResult: { points: 2200, distanceKm: 8, leftApp: false },
      }),
    ]
    renderMarcador({
      leaderboard: [],
      canCreate: false,
      pastChallenges,
      onPlayChallenge,
      onViewChallenge,
    })
    expect(screen.getByText(/^2.?200 pts$/)).toBeInTheDocument()
    await user.click(screen.getByText('El templo dorado'))
    expect(onViewChallenge).toHaveBeenCalledWith('c1')
    expect(onPlayChallenge).not.toHaveBeenCalled()
  })
})
