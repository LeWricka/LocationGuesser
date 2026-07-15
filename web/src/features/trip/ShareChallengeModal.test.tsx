import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '@supabase/supabase-js'

const trackMock = vi.fn()
vi.mock('../../lib/analytics', () => ({ track: (...args: unknown[]) => trackMock(...args) }))

// Issue #739: comparte UN reto suelto — mismas piezas de "¡Reto creado!"
// (#595)/InviteModal (#617) para no duplicar rasterización/Web Share/caption;
// aquí solo dobles simples para no tocar html-to-image/canvas reales.
const nodeToPngBlobMock = vi.fn()
const shareLeaderboardImageMock = vi.fn()
vi.mock('../group/shareLeaderboard', () => ({
  nodeToPngBlob: (...args: unknown[]) => nodeToPngBlobMock(...args),
  shareDomain: () => 'momentu.art',
  shareLeaderboardImage: (...args: unknown[]) => shareLeaderboardImageMock(...args),
}))

// La cascada de portada (foto del reto → portada del viaje → mapa nocturno)
// toca Supabase/Wikipedia: fuera del alcance de este test (cubierta en
// challengeShareCover.test.ts), fijamos "sin portada" para centrarnos en el modal.
const resolveChallengeShareCoverMock = vi.fn()
vi.mock('../create/challengeShareCover', () => ({
  resolveChallengeShareCover: (...args: unknown[]) => resolveChallengeShareCoverMock(...args),
}))

import { ShareChallengeModal } from './ShareChallengeModal'
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

function renderModal(onClose = vi.fn(), imagePath: string | null = null) {
  render(
    <SessionContext.Provider value={session}>
      <ToastProvider>
        <ShareChallengeModal
          groupId="g1"
          groupName="Japón en primavera"
          challengeId="reto-9"
          challengeTitle="¿Dónde comimos ramen?"
          imagePath={imagePath}
          onClose={onClose}
        />
      </ToastProvider>
    </SessionContext.Provider>,
  )
  return onClose
}

describe('ShareChallengeModal — compartir un reto suelto (#739)', () => {
  beforeEach(() => {
    trackMock.mockClear()
    resolveChallengeShareCoverMock.mockReset().mockResolvedValue(null)
    nodeToPngBlobMock.mockReset().mockResolvedValue(new Blob(['x'], { type: 'image/png' }))
    shareLeaderboardImageMock.mockReset()
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    // jsdom no implementa createObjectURL/revokeObjectURL.
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() })
  })

  test('título "Compartir reto" y pie con "Copiar enlace" + "Compartir" (patrón InviteModal)', async () => {
    renderModal()
    expect(screen.getByText('Compartir reto')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copiar enlace' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /compartir/i })).toBeInTheDocument()
    // El enlace NUNCA se pinta crudo en el modal (solo viaja en el caption).
    expect(screen.queryByText(/\/j\/reto-9/)).not.toBeInTheDocument()
    await waitFor(() => expect(resolveChallengeShareCoverMock).toHaveBeenCalled())
  })

  test('resuelve la portada con la foto del reto (cuando el llamador la considera visible)', async () => {
    renderModal(vi.fn(), 'u-me/foto.jpg')
    await waitFor(() =>
      expect(resolveChallengeShareCoverMock).toHaveBeenCalledWith(
        'u-me/foto.jpg',
        'g1',
        'Japón en primavera',
      ),
    )
    await waitFor(() => expect(nodeToPngBlobMock).toHaveBeenCalledTimes(1))
    expect(
      await screen.findByRole('img', { name: /tarjeta para compartir el reto/i }),
    ).toBeInTheDocument()
  })

  test('sin foto visible (imagePath null: sorpresa aún oculta, o sin foto): cae a la cascada del viaje', async () => {
    renderModal(vi.fn(), null)
    await waitFor(() =>
      expect(resolveChallengeShareCoverMock).toHaveBeenCalledWith(null, 'g1', 'Japón en primavera'),
    )
  })

  test('"Copiar enlace" copia mensaje SIN SPOILER + enlace de reto y trackea challenge_shared', async () => {
    renderModal()
    await userEvent.click(screen.getByRole('button', { name: 'Copiar enlace' }))

    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled())
    const [caption] = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(caption).toContain('/j/reto-9')
    // Anti-spoiler: el caption reta a adivinar, nunca dice DÓNDE es.
    expect(caption).not.toMatch(/japón en primavera/i)
    expect(trackMock).toHaveBeenCalledWith(
      'challenge_shared',
      expect.objectContaining({ surface: 'copied', group_id: 'g1', challenge_id: 'reto-9' }),
    )
    expect(await screen.findByText('Mensaje copiado, pégalo en el chat')).toBeInTheDocument()
  })

  test('"Compartir" manda la tarjeta-imagen + el enlace en el caption y cierra el modal', async () => {
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
    expect(captionArg).toContain('/j/reto-9')
    expect(trackMock).toHaveBeenCalledWith(
      'challenge_shared',
      expect.objectContaining({ surface: 'shared', group_id: 'g1', challenge_id: 'reto-9' }),
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('"Compartir" sin Web Share: descarga + copia, sin cerrar el modal', async () => {
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
    expect(trackMock).toHaveBeenCalledWith(
      'challenge_shared',
      expect.objectContaining({ surface: 'downloaded', group_id: 'g1', challenge_id: 'reto-9' }),
    )
    expect(onClose).not.toHaveBeenCalled()
  })

  test('si la imagen no se genera, "Compartir" queda deshabilitado ("Copiar enlace" sigue disponible)', async () => {
    nodeToPngBlobMock.mockReset().mockRejectedValue(new Error('canvas roto'))
    renderModal()

    await waitFor(() => expect(nodeToPngBlobMock).toHaveBeenCalled())
    expect(await screen.findByRole('button', { name: /compartir/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Copiar enlace' })).toBeEnabled()
  })
})
