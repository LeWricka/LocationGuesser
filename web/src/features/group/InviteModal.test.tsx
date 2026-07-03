import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '@supabase/supabase-js'

const trackMock = vi.fn()
vi.mock('../../lib/analytics', () => ({ track: (...args: unknown[]) => trackMock(...args) }))

const getGroupMembersMock = vi.fn()
vi.mock('../../lib/membership', () => ({
  getGroupMembers: (...args: unknown[]) => getGroupMembersMock(...args),
}))

// Issue #617: "Compartir" pasa de compartir el link crudo a compartir una
// tarjeta-IMAGEN rasterizada off-screen. La rasterización/Web
// Share/descarga se REUTILIZAN de features/group/shareLeaderboard (mismo
// módulo real, aquí solo dobles simples para no tocar html-to-image/canvas
// en el test — mismo patrón que ChallengeCreatedShare.test.tsx).
const nodeToPngBlobMock = vi.fn()
const shareLeaderboardImageMock = vi.fn()
vi.mock('./shareLeaderboard', () => ({
  nodeToPngBlob: (...args: unknown[]) => nodeToPngBlobMock(...args),
  shareDomain: () => 'tabide.app',
  shareLeaderboardImage: (...args: unknown[]) => shareLeaderboardImageMock(...args),
}))

// La cascada de portada (explícita → último recuerdo → lugar → mapa nocturno)
// toca Supabase/Wikipedia: fuera del alcance de este test (cubierto en
// tripInviteCover.test.ts), fijamos "sin portada" para centrarnos en el modal.
const resolveTripInviteCoverMock = vi.fn()
vi.mock('./tripInviteCover', () => ({
  resolveTripInviteCover: (...args: unknown[]) => resolveTripInviteCoverMock(...args),
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

describe('InviteModal — invitación como tarjeta-imagen (#617)', () => {
  beforeEach(() => {
    trackMock.mockClear()
    getGroupMembersMock.mockReset().mockResolvedValue([])
    resolveTripInviteCoverMock.mockReset().mockResolvedValue(null)
    nodeToPngBlobMock.mockReset().mockResolvedValue(new Blob(['x'], { type: 'image/png' }))
    shareLeaderboardImageMock.mockReset()
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    // jsdom no implementa createObjectURL/revokeObjectURL.
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() })
  })

  test('el pie solo tiene "Copiar enlace" y "Compartir" (sin botón dedicado de WhatsApp, #607)', async () => {
    renderModal()
    expect(screen.getByRole('button', { name: 'Copiar enlace' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /compartir/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /whatsapp/i })).not.toBeInTheDocument()
    // Deja asentar los efectos async (miembros, portada, rasterizado) para no
    // dejar un act() pendiente al terminar el test.
    await waitFor(() => expect(nodeToPngBlobMock).toHaveBeenCalled())
  })

  test('resuelve la cascada de portada del viaje y rasteriza la tarjeta; la previa muestra el PNG', async () => {
    renderModal()

    await waitFor(() =>
      expect(resolveTripInviteCoverMock).toHaveBeenCalledWith('g1', 'Japón en primavera'),
    )
    await waitFor(() => expect(nodeToPngBlobMock).toHaveBeenCalledTimes(1))
    expect(
      await screen.findByRole('img', { name: /tarjeta para invitar al viaje/i }),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: /compartir/i })).toBeEnabled())
  })

  test('"Copiar enlace" copia mensaje + enlace y avisa con un toast (intacto)', async () => {
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

  test('"Compartir" comparte la tarjeta-imagen (Web Share con files) y cierra el modal', async () => {
    shareLeaderboardImageMock.mockResolvedValue('shared')
    const onClose = renderModal()

    const shareBtn = await waitFor(() => {
      const btn = screen.getByRole('button', { name: /compartir/i })
      expect(btn).toBeEnabled()
      return btn
    })
    await userEvent.click(shareBtn)

    await waitFor(() => expect(shareLeaderboardImageMock).toHaveBeenCalledTimes(1))
    const [blobArg, captionArg] = shareLeaderboardImageMock.mock.calls[0]
    expect(blobArg).toBeInstanceOf(Blob)
    // El enlace SOLO va en el caption, nunca estampado en la imagen.
    expect(captionArg).toContain('https://tabide.app/v/abc123')
    expect(trackMock).toHaveBeenCalledWith(
      'invite_shared',
      expect.objectContaining({ surface: 'shared', group_id: 'g1' }),
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('"Compartir" sin Web Share (escritorio): descarga la imagen y copia el mensaje, sin cerrar el modal', async () => {
    shareLeaderboardImageMock.mockResolvedValue('downloaded')
    const onClose = renderModal()

    const shareBtn = await waitFor(() => {
      const btn = screen.getByRole('button', { name: /compartir/i })
      expect(btn).toBeEnabled()
      return btn
    })
    await userEvent.click(shareBtn)

    await waitFor(() => expect(shareLeaderboardImageMock).toHaveBeenCalledTimes(1))
    expect(
      await screen.findByText('Imagen descargada y mensaje copiado, pégalos en el chat'),
    ).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  test('si la imagen no se genera, "Compartir" queda deshabilitado (el enlace sigue disponible con "Copiar enlace")', async () => {
    nodeToPngBlobMock.mockReset().mockRejectedValue(new Error('canvas roto'))
    renderModal()

    await waitFor(() => expect(nodeToPngBlobMock).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: /compartir/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Copiar enlace' })).toBeEnabled()
  })
})
