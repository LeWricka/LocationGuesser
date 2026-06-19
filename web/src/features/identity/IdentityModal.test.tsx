import { describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IdentityModal } from './IdentityModal'

// El PIN filtra no-dígitos en cada onChange; con un input controlado así,
// fireEvent.change (que fija el valor completo de golpe) es más fiable que
// user.type para llenarlo.
function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

// Mockeamos la capa de datos/identidad: este test cubre el flujo de UI
// (validación + cableado del Field) sin tocar Supabase ni localStorage.
vi.mock('../../lib/players', () => ({
  ensurePlayer: vi.fn(),
}))
vi.mock('../../lib/identity', () => ({
  getClientId: vi.fn(() => 'client-1'),
  hashPin: vi.fn(async () => 'hash'),
  setIdentity: vi.fn(),
}))

import { ensurePlayer } from '../../lib/players'
import { setIdentity } from '../../lib/identity'

const ensurePlayerMock = vi.mocked(ensurePlayer)
const setIdentityMock = vi.mocked(setIdentity)

describe('IdentityModal (flujo)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('valida el PIN: si no son 4 dígitos muestra error y no llama a la BD', async () => {
    const user = userEvent.setup()
    render(<IdentityModal open groupId="g1" onResolved={vi.fn()} onCancel={vi.fn()} />)
    fill('Tu nombre', 'Ana')
    fill('PIN de 4 dígitos', '12')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(screen.getByRole('alert')).toHaveTextContent('El PIN son 4 dígitos.')
    expect(ensurePlayerMock).not.toHaveBeenCalled()
  })

  test('alta correcta: registra al jugador, fija identidad y resuelve', async () => {
    ensurePlayerMock.mockResolvedValue({ status: 'created' } as never)
    const onResolved = vi.fn()
    const user = userEvent.setup()
    render(<IdentityModal open groupId="g1" onResolved={onResolved} onCancel={vi.fn()} />)
    fill('Tu nombre', 'Ana')
    fill('PIN de 4 dígitos', '1234')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(ensurePlayerMock).toHaveBeenCalledWith({
      groupId: 'g1',
      name: 'Ana',
      clientId: 'client-1',
      pinHash: 'hash',
    })
    expect(setIdentityMock).toHaveBeenCalledWith('Ana', 'hash')
    expect(onResolved).toHaveBeenCalledWith('Ana')
  })

  test('nombre cogido (wrong-pin): muestra el aviso y no resuelve', async () => {
    ensurePlayerMock.mockResolvedValue({ status: 'wrong-pin' } as never)
    const onResolved = vi.fn()
    const user = userEvent.setup()
    render(<IdentityModal open groupId="g1" onResolved={onResolved} onCancel={vi.fn()} />)
    fill('Tu nombre', 'Ana')
    fill('PIN de 4 dígitos', '1234')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(screen.getByRole('alert')).toHaveTextContent(/ya está cogido/)
    expect(onResolved).not.toHaveBeenCalled()
  })
})
