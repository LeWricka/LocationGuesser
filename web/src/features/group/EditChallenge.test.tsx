import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ChallengeForPlay } from '../../lib/challenges'

// Editar el plazo de un reto (issue: editar reto — ajustar la fecha). El
// plumbing ya existía (`updateChallenge`/RLS `challenges_update_owner`, misma
// fila); este test cubre la UI nueva: plazo actual visible, chips relativos a
// AHORA (misma gramática que crear), vista previa antes de guardar y el
// gating a "solo mientras está EN JUEGO" (un reto cerrado no reabre por aquí).

const trackMock = vi.fn()
vi.mock('../../lib/analytics', () => ({ track: (...args: unknown[]) => trackMock(...args) }))

const updateChallengeMock = vi.fn()
const countVotesMock = vi.fn()
const getAnswerMock = vi.fn()
vi.mock('../../lib/challenges', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/challenges')>()
  return {
    ...actual,
    updateChallenge: (...args: unknown[]) => updateChallengeMock(...args),
    countVotes: (...args: unknown[]) => countVotesMock(...args),
    getAnswer: (...args: unknown[]) => getAnswerMock(...args),
  }
})

import { EditChallenge } from './EditChallenge'
import { ToastProvider } from '../../ui'

function challenge(overrides: Partial<ChallengeForPlay> = {}): ChallengeForPlay {
  return {
    id: 'ch-1',
    group_id: 'g-1',
    title: 'El bosque de bambú',
    description: null,
    guess_seconds: 30,
    deadline_at: new Date(Date.now() + 4 * 60 * 60_000).toISOString(),
    photo_is_hint: true,
    image_path: null,
    sv_pano_id: null,
    sv_heading: null,
    sv_pitch: null,
    ...overrides,
  } as ChallengeForPlay
}

function renderScreen(c: ChallengeForPlay, onSaved = vi.fn()) {
  return render(
    <ToastProvider>
      <EditChallenge challenge={c} onBack={() => {}} onSaved={onSaved} />
    </ToastProvider>,
  )
}

beforeEach(() => {
  trackMock.mockClear()
  updateChallengeMock.mockReset()
  countVotesMock.mockReset()
  countVotesMock.mockResolvedValue(1) // con jugadas: ubicación bloqueada, fuera del alcance de este test
  getAnswerMock.mockReset()
  getAnswerMock.mockRejectedValue(new Error('sin respuesta (fuera de alcance en este test)'))
})

describe('EditChallenge — plazo (reto EN JUEGO)', () => {
  test('muestra el plazo actual; "Cambiar plazo" revela los chips y la fecha resultante ANTES de guardar', async () => {
    const user = userEvent.setup()
    renderScreen(challenge())

    expect(screen.getByText(/^Cierra el /)).toBeInTheDocument()
    expect(screen.queryByText(/^Pasará a cerrar el /)).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: '1 h' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cambiar plazo' }))

    // Los chips aparecen con un default ya elegido (4 h, mismo default que
    // crear): la fecha resultante se ve YA, sin tener que tocar nada más.
    expect(screen.getByRole('radio', { name: '4 h' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText(/^Pasará a cerrar el /)).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: '1 h' }))
    expect(screen.getByText(/^Pasará a cerrar el /)).toBeInTheDocument()

    // "Deshacer" vuelve a "sin cambios": los chips se ocultan otra vez.
    await user.click(screen.getByRole('button', { name: 'Deshacer cambio de plazo' }))
    expect(screen.queryByRole('radio', { name: '1 h' })).not.toBeInTheDocument()
    expect(screen.queryByText(/^Pasará a cerrar el /)).not.toBeInTheDocument()
  })

  test('guardar sin tocar el plazo: updateChallenge sin deadlineAt y sin deadline_changed', async () => {
    updateChallengeMock.mockResolvedValue(challenge())
    const user = userEvent.setup()
    renderScreen(challenge())

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(updateChallengeMock).toHaveBeenCalledTimes(1))
    expect(updateChallengeMock.mock.calls[0][1]).not.toHaveProperty('deadlineAt')
    expect(trackMock).toHaveBeenCalledWith(
      'challenge_edited',
      expect.not.objectContaining({ deadline_changed: true }),
    )
  })

  test('guardar tras elegir una parada: updateChallenge recibe deadlineAt futuro y track lleva deadline_changed', async () => {
    updateChallengeMock.mockResolvedValue(challenge())
    const user = userEvent.setup()
    renderScreen(challenge())

    await user.click(screen.getByRole('button', { name: 'Cambiar plazo' }))
    await user.click(screen.getByRole('radio', { name: '1 h' }))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(updateChallengeMock).toHaveBeenCalledTimes(1))
    const patch = updateChallengeMock.mock.calls[0][1] as { deadlineAt?: string }
    expect(patch.deadlineAt).toBeDefined()
    expect(new Date(patch.deadlineAt!).getTime()).toBeGreaterThan(Date.now())
    expect(trackMock).toHaveBeenCalledWith(
      'challenge_edited',
      expect.objectContaining({ deadline_changed: true }),
    )
  })
})

describe('EditChallenge — plazo (reto CERRADO)', () => {
  test('muestra que ya cerró y NO ofrece "Cambiar plazo" ni chips para reabrirlo', async () => {
    const closed = challenge({ deadline_at: new Date(Date.now() - 60_000).toISOString() })
    renderScreen(closed)

    expect(await screen.findByText(/^Cerró el /)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cambiar plazo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: '1 h' })).not.toBeInTheDocument()
    expect(screen.getByText(/cerrar es otra acción/i)).toBeInTheDocument()
  })

  test('guardar en un reto cerrado nunca manda deadlineAt (aunque el resto de campos se editen)', async () => {
    const closed = challenge({ deadline_at: new Date(Date.now() - 60_000).toISOString() })
    updateChallengeMock.mockResolvedValue(closed)
    const user = userEvent.setup()
    renderScreen(closed)

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(updateChallengeMock).toHaveBeenCalledTimes(1))
    expect(updateChallengeMock.mock.calls[0][1]).not.toHaveProperty('deadlineAt')
  })
})
