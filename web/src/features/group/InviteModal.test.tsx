import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '@supabase/supabase-js'

// Issue #607: el pie pasa de 3 botones (Copiar enlace / WhatsApp / Compartir) a
// 2 (Copiar enlace / Compartir) — WhatsApp ya vive dentro de la hoja nativa de
// Web Share. Aislamos analítica y el conteo de miembros (lib/membership).
const trackMock = vi.fn()
vi.mock('../../lib/analytics', () => ({ track: (...args: unknown[]) => trackMock(...args) }))

const getGroupMembersMock = vi.fn()
vi.mock('../../lib/membership', () => ({
  getGroupMembers: (...args: unknown[]) => getGroupMembersMock(...args),
}))

import { InviteModal } from './InviteModal'
import { SessionContext, type SessionState } from '../../lib/session-context'
import { ToastProvider } from '../../ui'

const session: SessionState = {
  session: null,
  user: { id: 'u-me' } as User,
  profile: { display_name: 'Iker' } as SessionState['profile'],
  loading: false,
  verified: true,
  refreshProfile: async () => {},
}

function renderModal(onClose = vi.fn()) {
  render(
    <SessionContext.Provider value={session}>
      <ToastProvider>
        <InviteModal
          open
          onClose={onClose}
          groupId="g1"
          groupName="Japón en primavera"
          link="https://tabide.app/v/abc123"
          challengeCount={3}
        />
      </ToastProvider>
    </SessionContext.Provider>,
  )
  return onClose
}

describe('InviteModal (#607)', () => {
  beforeEach(() => {
    trackMock.mockClear()
    getGroupMembersMock.mockReset().mockResolvedValue([])
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  })

  afterEach(() => {
    // navigator.share no existe por defecto en jsdom: lo limpiamos entre tests
    // para que cada uno controle explícitamente si el navegador "tiene" Web Share.
    Reflect.deleteProperty(navigator, 'share')
  })

  test('el pie solo tiene "Copiar enlace" y "Compartir" (sin botón dedicado de WhatsApp)', async () => {
    renderModal()
    expect(screen.getByRole('button', { name: 'Copiar enlace' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Compartir' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /whatsapp/i })).not.toBeInTheDocument()
    // Deja asentar el efecto async del recuento de miembros para no dejar un
    // act() pendiente al terminar el test.
    await waitFor(() => expect(getGroupMembersMock).toHaveBeenCalled())
  })

  test('el preview muestra el nombre del viaje y el recuento de retos', async () => {
    renderModal()
    expect(screen.getByText('Japón en primavera')).toBeInTheDocument()
    expect(screen.getByText('3 retos')).toBeInTheDocument()
    await waitFor(() => expect(getGroupMembersMock).toHaveBeenCalled())
  })

  test('"Copiar enlace" copia mensaje + enlace y avisa con un toast', async () => {
    renderModal()
    await userEvent.click(screen.getByRole('button', { name: 'Copiar enlace' }))

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('https://tabide.app/v/abc123'),
      ),
    )
    expect(trackMock).toHaveBeenCalledWith(
      'group_link_copied',
      expect.objectContaining({ surface: 'copied', group_id: 'g1' }),
    )
    expect(await screen.findByText('Mensaje copiado, pégalo en el chat')).toBeInTheDocument()
  })

  test('"Compartir" usa Web Share cuando existe y cierra el modal', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { share: shareMock })
    const onClose = renderModal()

    await userEvent.click(screen.getByRole('button', { name: 'Compartir' }))

    await waitFor(() =>
      expect(shareMock).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://tabide.app/v/abc123' }),
      ),
    )
    expect(trackMock).toHaveBeenCalledWith(
      'invite_shared',
      expect.objectContaining({ surface: 'shared', group_id: 'g1' }),
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('"Compartir" sin Web Share (escritorio) cae a copiar con toast, sin cerrar el modal', async () => {
    const onClose = renderModal()

    await userEvent.click(screen.getByRole('button', { name: 'Compartir' }))

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled())
    expect(await screen.findByText('Mensaje copiado, pégalo en el chat')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
