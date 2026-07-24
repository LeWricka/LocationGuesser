import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ChallengeForPlay } from '../../lib/challenges'

// Issue #922: editar un reto de NÚMERO abría el editor de UBICACIÓN (mapa,
// Street View) y podía corromperlo (escribía lat/lng sobre una fila que no los
// tiene). Este test cubre el editor DEDICADO: monta sin mapa, guarda solo
// columnas de número y nunca manda lat/lng.

const trackMock = vi.fn()
vi.mock('../../lib/analytics', () => ({ track: (...args: unknown[]) => trackMock(...args) }))

const updateNumberChallengeMock = vi.fn()
const countVotesMock = vi.fn()
vi.mock('../../lib/challenges', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/challenges')>()
  return {
    ...actual,
    updateNumberChallenge: (...args: unknown[]) => updateNumberChallengeMock(...args),
    countVotes: (...args: unknown[]) => countVotesMock(...args),
  }
})

import { EditNumberChallenge } from './EditNumberChallenge'
import { ToastProvider } from '../../ui'

function numberChallenge(overrides: Partial<ChallengeForPlay> = {}): ChallengeForPlay {
  return {
    id: 'n1',
    group_id: 'g-1',
    title: 'La porra de la cena',
    description: null,
    challenge_kind: 'number',
    number_question: '¿Cuánto creéis que nos costó?',
    number_unit: '€',
    number_decimals: 2,
    number_tolerance: 'normal',
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
      <EditNumberChallenge challenge={c} onBack={() => {}} onSaved={onSaved} />
    </ToastProvider>,
  )
}

beforeEach(() => {
  trackMock.mockClear()
  updateNumberChallengeMock.mockReset()
  countVotesMock.mockReset()
  countVotesMock.mockResolvedValue(0)
})

describe('EditNumberChallenge — monta el editor correcto (no el de ubicación)', () => {
  test('renderiza el formulario de número: pregunta, unidad y respuesta oculta; SIN mapa ni Street View', async () => {
    renderScreen(numberChallenge())

    expect(screen.getByText('Editar reto · ¿Cuánto?')).toBeInTheDocument()
    expect(await screen.findByDisplayValue('¿Cuánto creéis que nos costó?')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Cambiar la respuesta correcta' }),
    ).toBeInTheDocument()

    // Nada de mapa/Street View: el bug corrompía retos de número montando eso.
    expect(screen.queryByText(/Toca el mapa/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Street View/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/No hay Street View aquí/i)).not.toBeInTheDocument()
  })

  test('la cifra correcta NUNCA se muestra ni se prefija (spoiler write-only)', async () => {
    renderScreen(numberChallenge())
    await screen.findByDisplayValue('¿Cuánto creéis que nos costó?')

    // Ningún input trae ya escrita la cifra (84,50, 99, etc.) — no hay forma de
    // releerla (SELECT revocado en answer_number_src).
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[]
    for (const input of inputs) {
      expect(input.value).not.toMatch(/^\d/)
    }
  })
})

describe('EditNumberChallenge — guardar solo toca columnas de número', () => {
  test('guardar título/pregunta/unidad sin tocar la respuesta: updateNumberChallenge recibe SOLO esas columnas', async () => {
    updateNumberChallengeMock.mockResolvedValue(numberChallenge())
    const user = userEvent.setup()
    renderScreen(numberChallenge())

    const questionInput = await screen.findByDisplayValue('¿Cuánto creéis que nos costó?')
    await user.clear(questionInput)
    await user.type(questionInput, '¿Cuánto costó al final?')

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(updateNumberChallengeMock).toHaveBeenCalledTimes(1))
    const patch = updateNumberChallengeMock.mock.calls[0][1] as Record<string, unknown>
    expect(patch.question).toBe('¿Cuánto costó al final?')
    expect(patch).not.toHaveProperty('answer')
    // NUNCA lat/lng/sv_*: este reto no tiene ubicación.
    expect(patch).not.toHaveProperty('lat')
    expect(patch).not.toHaveProperty('lng')
    expect(patch).not.toHaveProperty('location')
    expect(patch).not.toHaveProperty('scene')
    expect(patch).not.toHaveProperty('svPanoId')
  })

  test('re-introducir la respuesta (sin votos) la manda como `answer` con la cifra y decimales nuevos', async () => {
    updateNumberChallengeMock.mockResolvedValue(numberChallenge())
    const user = userEvent.setup()
    renderScreen(numberChallenge())
    await screen.findByDisplayValue('¿Cuánto creéis que nos costó?')

    await user.click(screen.getByRole('button', { name: 'Cambiar la respuesta correcta' }))
    const answerInput = screen.getByLabelText('Nueva respuesta correcta')
    await user.type(answerInput, '99,50')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(updateNumberChallengeMock).toHaveBeenCalledTimes(1))
    const patch = updateNumberChallengeMock.mock.calls[0][1] as {
      answer?: { answerNumber: number; decimals: number }
    }
    expect(patch.answer).toEqual({ answerNumber: 99.5, decimals: 2 })
  })

  test('sin tocar el botón de "cambiar respuesta", guardar no manda `answer`', async () => {
    updateNumberChallengeMock.mockResolvedValue(numberChallenge())
    const user = userEvent.setup()
    renderScreen(numberChallenge())
    await screen.findByDisplayValue('¿Cuánto creéis que nos costó?')

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(updateNumberChallengeMock).toHaveBeenCalledTimes(1))
    expect(updateNumberChallengeMock.mock.calls[0][1]).not.toHaveProperty('answer')
  })
})

describe('EditNumberChallenge — bloqueo de la respuesta con jugadas (mismo criterio que ubicación)', () => {
  test('con votos, la respuesta queda bloqueada: no se ofrece el botón de cambiarla', async () => {
    countVotesMock.mockResolvedValue(2)
    renderScreen(numberChallenge())

    expect(await screen.findByText(/ya tiene jugadas/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Cambiar la respuesta correcta' }),
    ).not.toBeInTheDocument()
  })

  test('pregunta y unidad se pueden seguir editando aunque haya votos (no son la respuesta)', async () => {
    countVotesMock.mockResolvedValue(2)
    updateNumberChallengeMock.mockResolvedValue(numberChallenge())
    const user = userEvent.setup()
    renderScreen(numberChallenge())

    const questionInput = await screen.findByDisplayValue('¿Cuánto creéis que nos costó?')
    await user.clear(questionInput)
    await user.type(questionInput, 'Pregunta corregida')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(updateNumberChallengeMock).toHaveBeenCalledTimes(1))
    const patch = updateNumberChallengeMock.mock.calls[0][1] as Record<string, unknown>
    expect(patch.question).toBe('Pregunta corregida')
    expect(patch).not.toHaveProperty('answer')
  })
})
