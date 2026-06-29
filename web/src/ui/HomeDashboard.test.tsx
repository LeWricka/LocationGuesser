import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HomeDashboard } from './HomeDashboard'
import type { HomeGroup } from './HomeDashboard'

const groups: HomeGroup[] = [
  { id: 'a', name: "Interrail '26", status: 'toplay', owned: true },
  { id: 'b', name: 'Finde Lisboa', status: 'live' },
  { id: 'c', name: 'Pirineos', status: 'idle' },
]

describe('HomeDashboard', () => {
  test('muestra el lema de recuerdos y el subcopy', () => {
    render(<HomeDashboard userId="u1" displayName="Lewis" groups={groups} />)
    expect(screen.getByRole('heading', { name: /Guarda tus recuerdos/ })).toBeInTheDocument()
    expect(screen.getByText(/Los lugares que viviste/)).toBeInTheDocument()
  })

  test('lista los viajes como tarjetas que abren el viaje', async () => {
    const onOpenGroup = vi.fn()
    render(
      <HomeDashboard userId="u1" displayName="Lewis" groups={groups} onOpenGroup={onOpenGroup} />,
    )
    await userEvent.click(screen.getByRole('button', { name: "Abrir viaje Interrail '26" }))
    expect(onOpenGroup).toHaveBeenCalledWith('a')
  })

  test('marca "en juego"/"te toca" en los viajes con reto abierto', () => {
    render(<HomeDashboard userId="u1" displayName="Lewis" groups={groups} />)
    // 'toplay' → "Te toca"; 'live' → "En juego"; 'idle' → sin indicador.
    expect(screen.getByText('Te toca')).toBeInTheDocument()
    expect(screen.getByText('En juego')).toBeInTheDocument()
  })

  test('NO muestra "cómo funciona" ni el panel de números', () => {
    render(<HomeDashboard userId="u1" displayName="Lewis" groups={groups} />)
    expect(screen.queryByText(/Cómo funciona/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Tus números/i)).not.toBeInTheDocument()
  })

  test('CTAs de empezar un viaje y unirme', async () => {
    const onCreateGroup = vi.fn()
    const onJoinGroup = vi.fn()
    render(
      <HomeDashboard
        userId="u1"
        displayName="Lewis"
        groups={groups}
        onCreateGroup={onCreateGroup}
        onJoinGroup={onJoinGroup}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Empezar un viaje/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Unirme' }))
    expect(onCreateGroup).toHaveBeenCalled()
    expect(onJoinGroup).toHaveBeenCalled()
  })

  test('renderiza el mapamundi inyectado', () => {
    render(
      <HomeDashboard
        userId="u1"
        displayName="Lewis"
        groups={groups}
        worldMap={<div data-testid="world">mapa</div>}
      />,
    )
    expect(screen.getByTestId('world')).toBeInTheDocument()
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
})
