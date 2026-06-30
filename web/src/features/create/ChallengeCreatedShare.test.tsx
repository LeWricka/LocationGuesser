import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '@supabase/supabase-js'

const trackMock = vi.fn()
vi.mock('../../lib/analytics', () => ({ track: (...args: unknown[]) => trackMock(...args) }))

import { ChallengeCreatedShare } from './ChallengeCreatedShare'
import { SessionContext, type SessionState } from '../../lib/session-context'
import { ToastProvider } from '../../ui'

const session: SessionState = {
  session: null,
  user: { id: 'u-me' } as User,
  profile: { display_name: 'Iker' } as SessionState['profile'],
  loading: false,
  refreshProfile: async () => {},
}

function renderShare(onPlay = vi.fn()) {
  render(
    <SessionContext.Provider value={session}>
      <ToastProvider>
        <ChallengeCreatedShare
          groupId="g1"
          groupName="Lisboa"
          challengeId="reto-1"
          challengeTitle="¿Dónde desayuné?"
          onPlay={onPlay}
        />
      </ToastProvider>
    </SessionContext.Provider>,
  )
  return onPlay
}

describe('ChallengeCreatedShare', () => {
  beforeEach(() => {
    trackMock.mockClear()
    // Forzamos el fallback de copiar: sin Web Share API, "Compartir enlace" copia.
    Object.assign(navigator, {
      share: undefined,
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  test('dice qué se comparte (nombre del reto) y a quién (el grupo del viaje)', () => {
    renderShare()
    expect(screen.getByText('¿Dónde desayuné?')).toBeInTheDocument()
    expect(screen.getByText(/tu grupo de lisboa ya puede jugar/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /compartir enlace/i })).toBeInTheDocument()
  })

  test('copiar pone el ENLACE del reto (/j/<code>) en el portapapeles', async () => {
    renderShare()
    await userEvent.click(screen.getByRole('button', { name: /compartir enlace/i }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled())
    const copied = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(copied).toContain('/j/reto-1')
    expect(trackMock).toHaveBeenCalledWith(
      'invite_shared',
      expect.objectContaining({ surface: 'copied', group_id: 'g1', challenge_id: 'reto-1' }),
    )
  })

  test('"Ver el reto" lleva a jugar (onPlay)', async () => {
    const onPlay = renderShare()
    await userEvent.click(screen.getByRole('button', { name: /ver el reto/i }))
    expect(onPlay).toHaveBeenCalledTimes(1)
  })
})
