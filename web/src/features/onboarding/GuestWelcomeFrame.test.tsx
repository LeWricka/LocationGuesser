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
    // La línea "N más ya están dentro" se retiró (feedback): no debe aparecer.
    expect(screen.queryByText(/ya están dentro/)).not.toBeInTheDocument()
    expect(
      screen.getByText(
        /Momentu es la forma de guardar tus viajes y compartirlos con quien más quieres/,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(/participa en los retos que te mandan/)).toBeInTheDocument()
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

  test('"Ver el viaje" llama a onEnter', () => {
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
    fireEvent.click(screen.getByRole('button', { name: /Ver el viaje/ }))
    expect(onEnter).toHaveBeenCalledTimes(1)
  })
})
