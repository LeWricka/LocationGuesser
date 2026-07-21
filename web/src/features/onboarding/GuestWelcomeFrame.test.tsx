import { describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GuestWelcomeFrame } from './GuestWelcomeFrame'

const MEMBERS = [
  { userId: 'owner-1', name: 'Lucía', avatarUrl: null },
  { userId: 'member-3', name: 'Ana', avatarUrl: null },
]

describe('GuestWelcomeFrame', () => {
  test('pinta el saludo con los datos reales del viaje', () => {
    render(
      <GuestWelcomeFrame
        tripName="Ruta por Portugal"
        ownerName="Lucía"
        avatarMembers={MEMBERS}
        othersCount={1}
        coverImageUrl={null}
        hasActiveChallenge={false}
        onEnter={vi.fn()}
      />,
    )
    expect(screen.getByText('Te han invitado · Ruta por Portugal')).toBeInTheDocument()
    expect(screen.getByText('Estás dentro del viaje de Lucía')).toBeInTheDocument()
    expect(screen.getByText('Lucía y 1 más ya están dentro')).toBeInTheDocument()
    expect(
      screen.getByText(/Momentu es su diario de viaje\. Lo sigues por el Diario y la Bitácora/),
    ).toBeInTheDocument()
    expect(screen.getByText('Comparte tus momentos de una forma diferente.')).toBeInTheDocument()
  })

  test('sin dueño ni viaje resueltos, cae al copy genérico (nunca "de undefined")', () => {
    render(
      <GuestWelcomeFrame
        avatarMembers={[]}
        othersCount={0}
        coverImageUrl={null}
        hasActiveChallenge={false}
        onEnter={vi.fn()}
      />,
    )
    expect(screen.getByText('Te han invitado')).toBeInTheDocument()
    expect(screen.getByText('Estás dentro de este viaje')).toBeInTheDocument()
    expect(screen.getByText('Tu gente ya está dentro')).toBeInTheDocument()
  })

  test('el aviso "te toca un reto" SOLO aparece si hay uno en juego', () => {
    const { rerender } = render(
      <GuestWelcomeFrame
        avatarMembers={[]}
        othersCount={0}
        coverImageUrl={null}
        hasActiveChallenge={false}
        onEnter={vi.fn()}
      />,
    )
    expect(screen.queryByText(/Ahora te toca un reto/)).not.toBeInTheDocument()

    rerender(
      <GuestWelcomeFrame
        avatarMembers={[]}
        othersCount={0}
        coverImageUrl={null}
        hasActiveChallenge
        onEnter={vi.fn()}
      />,
    )
    expect(screen.getByText(/Ahora te toca un reto/)).toBeInTheDocument()
  })

  test('"Entrar a jugar" llama a onEnter', () => {
    const onEnter = vi.fn()
    render(
      <GuestWelcomeFrame
        avatarMembers={[]}
        othersCount={0}
        coverImageUrl={null}
        hasActiveChallenge={false}
        onEnter={onEnter}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Entrar a jugar/ }))
    expect(onEnter).toHaveBeenCalledTimes(1)
  })
})
