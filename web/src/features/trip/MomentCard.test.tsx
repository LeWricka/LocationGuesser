import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MomentCard } from './MomentCard'
import type { Moment } from '../../lib/trip'

// Fábrica de un reto EN JUEGO: solo lo que la tarjeta mira. `isOwn` se fuerza en
// cada test (issue #578: el CTA "Adivina →" depende de quién creó el reto).
function activeChallenge(overrides: Partial<Moment>): Moment {
  return {
    challengeId: 'c1',
    title: 'Reto activo',
    description: null,
    status: 'active',
    isChallenge: true,
    date: '2026-07-01T10:00:00.000Z',
    deadlineAt: '2026-07-02T10:00:00.000Z',
    imageUrl: null,
    imagePath: null,
    lat: null,
    lng: null,
    guessedCount: 0,
    isOwn: false,
    guessSeconds: null,
    svPanoId: null,
    country: null,
    ...overrides,
  }
}

describe('MomentCard — reto EN JUEGO (issue #578)', () => {
  test('reto AJENO: pinta "Adivina →" y dispara onPlay al tocarlo', async () => {
    const user = userEvent.setup()
    const onPlay = vi.fn()
    render(
      <MomentCard moment={activeChallenge({ isOwn: false })} onExpand={() => {}} onPlay={onPlay} />,
    )

    expect(screen.getByText('EN JUEGO')).toBeInTheDocument()
    const cta = screen.getByRole('button', { name: 'Adivina →' })
    await user.click(cta)
    expect(onPlay).toHaveBeenCalledTimes(1)
  })

  test('reto PROPIO: NO ofrece "Adivina →" — muestra el recuento de jugadas', () => {
    render(
      <MomentCard
        moment={activeChallenge({ isOwn: true, guessedCount: 3 })}
        onExpand={() => {}}
        onPlay={vi.fn()}
      />,
    )

    // El badge "en juego" se mantiene: el reto sigue en curso.
    expect(screen.getByText('EN JUEGO')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Adivina →' })).not.toBeInTheDocument()
    expect(screen.getByText('3 han jugado')).toBeInTheDocument()
  })

  test('reto PROPIO sin jugadas todavía: "Esperando jugadas"', () => {
    render(
      <MomentCard
        moment={activeChallenge({ isOwn: true, guessedCount: 0 })}
        onExpand={() => {}}
        onPlay={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Adivina →' })).not.toBeInTheDocument()
    expect(screen.getByText('Esperando jugadas')).toBeInTheDocument()
  })

  test('reto PROPIO sin prop onPlay (como lo cablea TripDiario): tampoco pinta el CTA', () => {
    // TripDiario ya no pasa onPlay para un momento propio en juego; nos aseguramos
    // de que MomentCard decide por `moment.isOwn`, no solo por la ausencia de onPlay.
    render(
      <MomentCard moment={activeChallenge({ isOwn: true, guessedCount: 1 })} onExpand={() => {}} />,
    )

    expect(screen.queryByRole('button', { name: 'Adivina →' })).not.toBeInTheDocument()
    expect(screen.getByText('1 han jugado')).toBeInTheDocument()
  })
})
