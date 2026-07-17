import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Camino } from './Camino'
import type { PastChallengeSummary } from './useTripData'

// jsdom no implementa `IntersectionObserver` (ver Camino.tsx): sin él, el
// propio componente revela todos los hitos de inmediato — así que estos tests
// pueden comprobar el contenido sin simular scroll ni un observer real.

function pastChallenge(overrides: Partial<PastChallengeSummary>): PastChallengeSummary {
  return {
    challengeId: 'c1',
    title: 'El bosque de bambú',
    status: 'closed',
    closedAt: '2026-06-10T10:00:00.000Z',
    isOwn: false,
    winner: null,
    myResult: null,
    myRank: null,
    imageUrl: null,
    ...overrides,
  }
}

const noop = () => {}

describe('Camino', () => {
  test('sin retos, no renderiza nada (ni el título "El camino")', () => {
    const { container } = render(
      <Camino pastChallenges={[]} onPlayChallenge={noop} onViewChallenge={noop} />,
    )
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText('El camino')).not.toBeInTheDocument()
  })

  test('con retos, muestra el título "El camino" y la ruta como lista accesible', () => {
    render(
      <Camino
        pastChallenges={[pastChallenge({})]}
        onPlayChallenge={noop}
        onViewChallenge={noop}
      />,
    )
    expect(screen.getByText('El camino')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'El camino del viaje' })).toBeInTheDocument()
  })

  test('hito CERRADO con ganador: avatar + "Ganó X", "Tú: Nº · pts" y el aviso anti-trampa', async () => {
    const user = userEvent.setup()
    const onViewChallenge = vi.fn()
    const pastChallenges = [
      pastChallenge({
        challengeId: 'c1',
        title: 'El bosque de bambú',
        winner: { name: 'Marta', userId: 'u-marta', avatar: null, points: 4880, distanceKm: 1.2, leftApp: true },
        myResult: { points: 3100, distanceKm: 42, leftApp: false },
        myRank: 2,
      }),
    ]
    render(
      <Camino pastChallenges={pastChallenges} onPlayChallenge={noop} onViewChallenge={onViewChallenge} />,
    )
    expect(screen.getByText(/Ganó/)).toBeInTheDocument()
    expect(screen.getByText('Marta')).toBeInTheDocument()
    expect(screen.getByText('2º')).toBeInTheDocument()
    expect(screen.getByText(/3\.?100 pts/)).toBeInTheDocument()
    expect(screen.getByLabelText('Salió de la app durante la jugada')).toBeInTheDocument()

    await user.click(screen.getByText('El bosque de bambú'))
    expect(onViewChallenge).toHaveBeenCalledWith('c1')
  })

  test('hito CERRADO sin votos y propio: "Se cerró sin votos" + "Tu reto"', () => {
    const pastChallenges = [
      pastChallenge({ challengeId: 'c2', title: 'El Pabellón Dorado', isOwn: true }),
    ]
    render(<Camino pastChallenges={pastChallenges} onPlayChallenge={noop} onViewChallenge={noop} />)
    expect(screen.getByText('Se cerró sin votos')).toBeInTheDocument()
    expect(screen.getByText('Tu reto')).toBeInTheDocument()
  })

  test('hito CERRADO donde no jugué: "No jugaste"', () => {
    const pastChallenges = [pastChallenge({ challengeId: 'c3', title: 'Sin jugar' })]
    render(<Camino pastChallenges={pastChallenges} onPlayChallenge={noop} onViewChallenge={noop} />)
    expect(screen.getByText('No jugaste')).toBeInTheDocument()
  })

  test('hito EN JUEGO sin jugar: chip "EN JUEGO", CTA "Adivina" y navega a jugar (anti-spoiler)', async () => {
    const user = userEvent.setup()
    const onPlayChallenge = vi.fn()
    const onViewChallenge = vi.fn()
    const pastChallenges = [
      pastChallenge({
        challengeId: 'c4',
        title: 'El templo dorado',
        status: 'active',
        closedAt: '2026-06-15T13:00:00.000Z',
      }),
    ]
    vi.useFakeTimers().setSystemTime(new Date('2026-06-15T10:00:00.000Z'))
    render(
      <Camino pastChallenges={pastChallenges} onPlayChallenge={onPlayChallenge} onViewChallenge={onViewChallenge} />,
    )
    expect(screen.getByText('EN JUEGO')).toBeInTheDocument()
    expect(screen.getByText(/quedan 3 h/)).toBeInTheDocument()
    expect(screen.getByText('Adivina')).toBeInTheDocument()
    vi.useRealTimers()

    await user.click(screen.getByText('El templo dorado'))
    expect(onPlayChallenge).toHaveBeenCalledWith('c4')
    expect(onViewChallenge).not.toHaveBeenCalled()
  })

  test('hito EN JUEGO ya jugado: CTA "Ver mi apuesta" y abre el detalle, no a jugar', async () => {
    const user = userEvent.setup()
    const onPlayChallenge = vi.fn()
    const onViewChallenge = vi.fn()
    const pastChallenges = [
      pastChallenge({
        challengeId: 'c5',
        title: 'El templo dorado',
        status: 'active',
        myResult: { points: 2200, distanceKm: 8, leftApp: false },
      }),
    ]
    render(
      <Camino pastChallenges={pastChallenges} onPlayChallenge={onPlayChallenge} onViewChallenge={onViewChallenge} />,
    )
    expect(screen.getByText('Ver mi apuesta')).toBeInTheDocument()

    await user.click(screen.getByText('El templo dorado'))
    expect(onViewChallenge).toHaveBeenCalledWith('c5')
    expect(onPlayChallenge).not.toHaveBeenCalled()
  })

  test('thumbnail con la foto real del reto, o placeholder si no tiene (issue #753, conservado)', () => {
    const pastChallenges = [
      pastChallenge({ challengeId: 'c1', title: 'Con foto', imageUrl: 'https://x/foto.jpg' }),
      pastChallenge({ challengeId: 'c2', title: 'Sin foto', imageUrl: null }),
    ]
    render(<Camino pastChallenges={pastChallenges} onPlayChallenge={noop} onViewChallenge={noop} />)
    const conFoto = screen.getByText('Con foto').closest('button')
    expect(conFoto?.querySelector('img')).toHaveAttribute('src', 'https://x/foto.jpg')
    const sinFoto = screen.getByText('Sin foto').closest('button')
    expect(sinFoto?.querySelector('img')).toBeNull()
  })

  test('orden cronológico: se pinta en el mismo orden que llega (EN JUEGO primero, cerrados del más nuevo al más viejo)', () => {
    const pastChallenges = [
      pastChallenge({ challengeId: 'c-activo', title: 'Activo', status: 'active' }),
      pastChallenge({ challengeId: 'c-nuevo', title: 'Nuevo' }),
      pastChallenge({ challengeId: 'c-viejo', title: 'Viejo' }),
    ]
    render(<Camino pastChallenges={pastChallenges} onPlayChallenge={noop} onViewChallenge={noop} />)
    const items = screen.getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Activo'),
      expect.stringContaining('Nuevo'),
      expect.stringContaining('Viejo'),
    ])
  })
})
