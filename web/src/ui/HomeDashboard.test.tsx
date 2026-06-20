import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HomeDashboard } from './HomeDashboard'
import type { HomeGroup } from './HomeDashboard'

const groups: HomeGroup[] = [
  { id: 'a', name: "Interrail '26", status: 'toplay', owned: true },
  { id: 'b', name: 'Finde Lisboa', status: 'live' },
]

describe('HomeDashboard', () => {
  test('saluda con el display_name', () => {
    render(<HomeDashboard displayName="Lewis" groups={groups} />)
    expect(screen.getByRole('heading', { name: 'Lewis' })).toBeInTheDocument()
  })

  test('sin grupos muestra el estado vacío (bienvenida)', () => {
    render(<HomeDashboard displayName="Lewis" groups={[]} />)
    expect(screen.getByText('¡Bienvenido, Lewis!')).toBeInTheDocument()
    expect(screen.queryByText('Tus grupos')).not.toBeInTheDocument()
  })

  test('la sección "Te toca jugar" se oculta si no hay turnos', () => {
    render(<HomeDashboard displayName="Lewis" groups={groups} turns={[]} />)
    expect(screen.queryByText('Te toca jugar')).not.toBeInTheDocument()
  })

  test('muestra los turnos y dispara onPlayTurn', async () => {
    const onPlayTurn = vi.fn()
    render(
      <HomeDashboard
        displayName="Lewis"
        groups={groups}
        turns={[{ id: 't1', groupName: "Interrail '26", author: 'Ana', countdown: '3 h 12 m' }]}
        onPlayTurn={onPlayTurn}
      />,
    )
    expect(screen.getByText(/reto de Ana/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Jugar' }))
    expect(onPlayTurn).toHaveBeenCalledWith('t1')
  })

  test('abre el grupo al pulsar su tarjeta', async () => {
    const onOpenGroup = vi.fn()
    render(<HomeDashboard displayName="Lewis" groups={groups} onOpenGroup={onOpenGroup} />)
    await userEvent.click(screen.getByRole('button', { name: "Abrir grupo Interrail '26" }))
    expect(onOpenGroup).toHaveBeenCalledWith('a')
  })

  test('sin stats muestra el mensaje guía de históricos', () => {
    render(<HomeDashboard displayName="Lewis" groups={groups} stats={null} />)
    expect(screen.getByText(/aquí verás tus puntos/)).toBeInTheDocument()
  })
})
