import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HomeDashboard } from './HomeDashboard'
import type { HomeGroup, HomePinned } from './HomeDashboard'

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

describe('HomeDashboard', () => {
  test('el feed lista los viajes y no muestra el lema de marketing', () => {
    render(<HomeDashboard userId="u1" displayName="Lewis" groups={groups} />)
    // Un solo feed editorial "Tus viajes" (maqueta B); el lema de marketing baja de aquí.
    expect(screen.getByRole('heading', { name: 'Tus viajes' })).toBeInTheDocument()
    expect(screen.queryByText(/Guarda tus recuerdos/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Los lugares que viviste/)).not.toBeInTheDocument()
  })

  test('cada viaje es una tarjeta-portada que abre el viaje', async () => {
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

  test('NO muestra "cómo funciona" ni el panel de números', () => {
    render(<HomeDashboard userId="u1" displayName="Lewis" groups={groups} />)
    expect(screen.queryByText(/Cómo funciona/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Tus números/i)).not.toBeInTheDocument()
  })

  test('CTA de empezar un viaje y de unirme', async () => {
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
    await userEvent.click(screen.getByRole('button', { name: /Empieza un viaje/ }))
    await userEvent.click(screen.getByRole('button', { name: /Unirme a un viaje con un código/ }))
    expect(onCreateGroup).toHaveBeenCalled()
    expect(onJoinGroup).toHaveBeenCalled()
  })

  test('NO monta un mapamundi a sangre (no hay héroe de mapa)', () => {
    render(<HomeDashboard userId="u1" displayName="Lewis" groups={groups} />)
    // La home B no acepta ni renderiza un mapamundi: solo el feed de portadas.
    expect(screen.queryByTestId('world')).not.toBeInTheDocument()
  })

  test('el reto fijado "Te toca jugar" muestra título y CTA de jugar', async () => {
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
    expect(screen.getByRole('heading', { name: '¿Dónde tomé esta foto?' })).toBeInTheDocument()
    // La tarjeta fijada es el botón de jugar (su título lo etiqueta).
    await userEvent.click(screen.getByRole('button', { name: '¿Dónde tomé esta foto?' }))
    expect(onPlayPinned).toHaveBeenCalled()
  })

  test('sin reto fijado no se pinta la tarjeta destacada', () => {
    render(<HomeDashboard userId="u1" displayName="Lewis" groups={groups} pinned={null} />)
    expect(screen.queryByText('Te toca jugar')).not.toBeInTheDocument()
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
