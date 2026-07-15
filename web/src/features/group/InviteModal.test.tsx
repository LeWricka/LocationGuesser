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
  shareDomain: () => 'momentu.art',
  shareLeaderboardImage: (...args: unknown[]) => shareLeaderboardImageMock(...args),
}))

// La cascada de portada (explícita → último recuerdo → lugar → mapa nocturno)
// toca Supabase/Wikipedia: fuera del alcance de este test (cubierto en
// tripInviteCover.test.ts), fijamos "sin portada" para centrarnos en el modal.
const resolveTripInviteCoverMock = vi.fn()
vi.mock('./tripInviteCover', () => ({
  resolveTripInviteCover: (...args: unknown[]) => resolveTripInviteCoverMock(...args),
}))

// Enlace de co-dueño (issue #707): mockeamos la emisión del token (toca
// Supabase/RLS, fuera del alcance de este test — ver ownerInvites.test.ts).
const createOwnerInviteMock = vi.fn()
vi.mock('../../lib/ownerInvites', () => ({
  createOwnerInvite: (...args: unknown[]) => createOwnerInviteMock(...args),
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
  isAnonymous: false,
  refreshProfile: async () => {},
}

function renderModal(onClose = vi.fn(), isOwner = true) {
  render(
    <SessionContext.Provider value={session}>
      <ToastProvider>
        <InviteModal
          open
          onClose={onClose}
          groupId="g1"
          groupName="Japón en primavera"
          link="https://momentu.art/v/abc123"
          challengeCount={3}
          isOwner={isOwner}
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
    createOwnerInviteMock.mockReset().mockResolvedValue('tok-1')
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

  test('no repite el aviso de "Miembros": el enlace de co-dueño es la única mención (#741)', async () => {
    renderModal()
    // Antes convivían un texto-guía ("hazlo co-dueño desde Miembros") y el botón
    // real ("Generar enlace de co-dueño") en el mismo modal — dos menciones de
    // "hacer co-dueño" que leían como dos caminos para lo mismo. Issue #741: la
    // única mención de co-dueño en Invitar es ahora el botón (feature real).
    expect(screen.queryByText(/Hazlo co-dueño desde/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generar enlace de co-dueño/i })).toBeInTheDocument()
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
        expect.stringContaining('https://momentu.art/v/abc123'),
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
    expect(captionArg).toContain('https://momentu.art/v/abc123')
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

  // Enlace de co-dueño (issue #707): solo-dueño, separado de la invitación social.
  describe('enlace de co-dueño', () => {
    test('un no-dueño no ve el botón de generar enlace de co-dueño', async () => {
      renderModal(vi.fn(), false)
      expect(
        screen.queryByRole('button', { name: /generar enlace de co-dueño/i }),
      ).not.toBeInTheDocument()
      await waitFor(() => expect(nodeToPngBlobMock).toHaveBeenCalled())
    })

    test('un dueño ve el botón y, al generarlo, se copia con su propio caption', async () => {
      renderModal(vi.fn(), true)
      const btn = screen.getByRole('button', { name: /generar enlace de co-dueño/i })
      await userEvent.click(btn)

      await waitFor(() => expect(createOwnerInviteMock).toHaveBeenCalledWith('g1', 'u-me'))
      await waitFor(() =>
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
          expect.stringContaining('co-dueño de «Japón en primavera»'),
        ),
      )
      // El caption trae el token generado, en el hash de co-dueño (#g=…&adm=…).
      const [captionArg] = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(captionArg).toContain('adm=tok-1')
      expect(trackMock).toHaveBeenCalledWith(
        'owner_invite_created',
        expect.objectContaining({ group_id: 'g1' }),
      )
      expect(
        await screen.findByText('Enlace de co-dueño copiado, pégalo en el chat'),
      ).toBeInTheDocument()
      await waitFor(() => expect(nodeToPngBlobMock).toHaveBeenCalled())
    })

    test('si falla la emisión, avisa con un toast honesto sin romper el modal', async () => {
      createOwnerInviteMock.mockRejectedValue(new Error('no eres dueño'))
      renderModal(vi.fn(), true)
      await userEvent.click(screen.getByRole('button', { name: /generar enlace de co-dueño/i }))

      expect(
        await screen.findByText(/No se pudo generar el enlace de co-dueño: no eres dueño/),
      ).toBeInTheDocument()
      await waitFor(() => expect(nodeToPngBlobMock).toHaveBeenCalled())
    })
  })
})
