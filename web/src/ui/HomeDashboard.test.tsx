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

describe('HomeDashboard (patrón globo + hoja)', () => {
  test('el feed lista los viajes y no muestra el lema de marketing', () => {
    render(<HomeDashboard userId="u1" displayName="Lewis" groups={groups} />)
    // Un solo feed editorial "Tus viajes" dentro de la hoja; el lema de marketing baja.
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

  test('cierre del feed: CTA de empezar un viaje', async () => {
    const onCreateGroup = vi.fn()
    render(
      <HomeDashboard
        userId="u1"
        displayName="Lewis"
        groups={groups}
        onCreateGroup={onCreateGroup}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Empieza un viaje/ }))
    expect(onCreateGroup).toHaveBeenCalled()
  })

  test('el FAB "+" constante crea un viaje', async () => {
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

  test('el reto fijado "Te toca jugar" se muestra como banner con CTA de jugar', async () => {
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
    // El CTA del banner ("Jugar") dispara onPlayPinned.
    await userEvent.click(screen.getByRole('button', { name: /Jugar/ }))
    expect(onPlayPinned).toHaveBeenCalled()
  })

  test('sin reto fijado no se pinta el banner destacado', () => {
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
})
