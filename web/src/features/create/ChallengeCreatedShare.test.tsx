import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '@supabase/supabase-js'

const trackMock = vi.fn()
vi.mock('../../lib/analytics', () => ({ track: (...args: unknown[]) => trackMock(...args) }))

// Issue #595: la hoja ya no comparte un link crudo, sino una tarjeta-IMAGEN
// rasterizada off-screen. La rasterización/Web Share/descarga se REUTILIZAN de
// features/group/shareLeaderboard (no se duplican aquí, mismo patrón que
// features/play/shareResult) — dobles simples para no tocar html-to-image/canvas
// reales en el test.
const nodeToPngBlobMock = vi.fn()
const shareLeaderboardImageMock = vi.fn()
const downloadBlobMock = vi.fn()
vi.mock('../group/shareLeaderboard', () => ({
  nodeToPngBlob: (...args: unknown[]) => nodeToPngBlobMock(...args),
  shareDomain: () => 'momentu.art',
  shareLeaderboardImage: (...args: unknown[]) => shareLeaderboardImageMock(...args),
  downloadBlob: (...args: unknown[]) => downloadBlobMock(...args),
}))

// La cascada de portada (foto del reto → portada del viaje → mapa nocturno) toca
// Supabase/Wikipedia: fuera del alcance de este test (cubierto en
// challengeShareCover.test.ts), fijamos "sin portada" para centrarnos en la hoja.
const resolveChallengeShareCoverMock = vi.fn()
vi.mock('./challengeShareCover', () => ({
  resolveChallengeShareCover: (...args: unknown[]) => resolveChallengeShareCoverMock(...args),
}))

import { ChallengeCreatedShare } from './ChallengeCreatedShare'
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

function renderShare(onPlay = vi.fn(), imagePath: string | null = null) {
  render(
    <SessionContext.Provider value={session}>
      <ToastProvider>
        <ChallengeCreatedShare
          groupId="g1"
          groupName="Lisboa"
          challengeId="reto-1"
          challengeTitle="¿Dónde desayuné?"
          imagePath={imagePath}
          onPlay={onPlay}
        />
      </ToastProvider>
    </SessionContext.Provider>,
  )
  return onPlay
}

describe('ChallengeCreatedShare — tarjeta-imagen, sin link crudo (#595)', () => {
  beforeEach(() => {
    trackMock.mockClear()
    resolveChallengeShareCoverMock.mockReset()
    resolveChallengeShareCoverMock.mockResolvedValue(null)
    nodeToPngBlobMock.mockReset()
    nodeToPngBlobMock.mockResolvedValue(new Blob(['x'], { type: 'image/png' }))
    shareLeaderboardImageMock.mockReset()
    downloadBlobMock.mockReset()
    // jsdom no implementa createObjectURL/revokeObjectURL.
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() })
  })

  test('dice qué se comparte (nombre del reto) y a quién (el grupo del viaje); sin link crudo visible', async () => {
    renderShare()
    expect(screen.getByText('¡Reto creado!')).toBeInTheDocument()
    expect(screen.getByText(/tu gente de lisboa ya puede jugar/i)).toBeInTheDocument()
    // El enlace NUNCA se pinta en la hoja (solo viaja en el caption al compartir).
    expect(screen.queryByText(/\/j\/reto-1/)).not.toBeInTheDocument()
    // Deja asentar los efectos async (resolución de portada + rasterizado) para
    // no dejar un `act()` pendiente al terminar el test.
    await waitFor(() => expect(resolveChallengeShareCoverMock).toHaveBeenCalled())
  })

  test('resuelve la portada con la foto del reto y rasteriza la tarjeta; "Compartir"/"Descargar" se habilitan', async () => {
    renderShare(vi.fn(), 'u-me/foto.jpg')

    await waitFor(() =>
      expect(resolveChallengeShareCoverMock).toHaveBeenCalledWith('u-me/foto.jpg', 'g1', 'Lisboa'),
    )
    await waitFor(() => expect(nodeToPngBlobMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole('button', { name: /compartir/i })).toBeEnabled())
    expect(screen.getByRole('button', { name: /descargar/i })).toBeEnabled()
    expect(screen.getByRole('img', { name: /tarjeta para compartir el reto/i })).toBeInTheDocument()
  })

  test('compartir manda el ENLACE del reto en el caption de la imagen (nunca en el PNG)', async () => {
    shareLeaderboardImageMock.mockResolvedValue('shared')
    renderShare()

    const shareBtn = await waitFor(() => {
      const btn = screen.getByRole('button', { name: /compartir/i })
      expect(btn).toBeEnabled()
      return btn
    })
    await userEvent.click(shareBtn)

    await waitFor(() => expect(shareLeaderboardImageMock).toHaveBeenCalledTimes(1))
    const [, caption] = shareLeaderboardImageMock.mock.calls[0]
    expect(caption).toContain('/j/reto-1')
    expect(trackMock).toHaveBeenCalledWith(
      'invite_shared',
      expect.objectContaining({ surface: 'shared', group_id: 'g1', challenge_id: 'reto-1' }),
    )
  })

  test('descargar guarda el PNG (fallback sin Web Share)', async () => {
    renderShare()

    const downloadBtn = await waitFor(() => {
      const btn = screen.getByRole('button', { name: /descargar/i })
      expect(btn).toBeEnabled()
      return btn
    })
    await userEvent.click(downloadBtn)

    expect(downloadBlobMock).toHaveBeenCalledWith(expect.any(Blob), 'reto.png')
    expect(trackMock).toHaveBeenCalledWith(
      'invite_shared',
      expect.objectContaining({ surface: 'downloaded', group_id: 'g1', challenge_id: 'reto-1' }),
    )
  })

  test('"Ver el reto en el viaje" lleva a jugar (onPlay)', async () => {
    const onPlay = renderShare()
    await userEvent.click(screen.getByRole('button', { name: /ver el reto/i }))
    expect(onPlay).toHaveBeenCalledTimes(1)
  })
})
