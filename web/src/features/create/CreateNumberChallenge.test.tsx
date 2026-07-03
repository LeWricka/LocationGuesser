import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '@supabase/supabase-js'
import type { ChallengeForPlay } from '../../lib/challenges'

const trackMock = vi.fn()
vi.mock('../../lib/analytics', () => ({ track: (...args: unknown[]) => trackMock(...args) }))

const reportErrorMock = vi.fn()
vi.mock('../../lib/observability', () => ({
  reportError: (...args: unknown[]) => reportErrorMock(...args),
}))

const createNumberChallengeMock = vi.fn()
vi.mock('../../lib/challenges', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/challenges')>()
  return {
    ...actual,
    createNumberChallenge: (...args: unknown[]) => createNumberChallengeMock(...args),
  }
})

const uploadImageMock = vi.fn()
vi.mock('../../lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/storage')>()
  return { ...actual, uploadImage: (...args: unknown[]) => uploadImageMock(...args) }
})

import { CreateNumberChallenge } from './CreateNumberChallenge'
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

function renderCreate() {
  const onBack = vi.fn()
  const onCreated = vi.fn()
  render(
    <SessionContext.Provider value={session}>
      <ToastProvider>
        <CreateNumberChallenge
          groupId="g1"
          groupName="Lisboa"
          onBack={onBack}
          onCreated={onCreated}
        />
      </ToastProvider>
    </SessionContext.Provider>,
  )
  return { onBack, onCreated }
}

// Rellena el paso 1 (nombre + pregunta) y avanza al paso 2.
async function fillStepOneAndAdvance() {
  await userEvent.type(screen.getByLabelText('Nombre del reto'), 'La cuenta de la cena')
  await userEvent.type(screen.getByLabelText('Tu pregunta'), '¿Cuánto costó la cena del grupo?')
  await userEvent.click(screen.getByRole('button', { name: /siguiente/i }))
}

describe('CreateNumberChallenge — formulario de papel en 2 pasos (#586)', () => {
  beforeEach(() => {
    trackMock.mockClear()
    reportErrorMock.mockClear()
    createNumberChallengeMock.mockReset()
    uploadImageMock.mockReset()
    // jsdom no implementa createObjectURL/revokeObjectURL (solo la miniatura de
    // la foto opcional los usa; irrelevante para estos casos).
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() })
  })

  test('paso 1 no avanza sin nombre y pregunta; con ambos pasa a "Respuesta y reglas"', async () => {
    renderCreate()

    // Formulario de papel: paso 1 con sus campos y el CTA de avanzar bloqueado.
    expect(screen.getByText('¿Qué adivinan?')).toBeInTheDocument()
    const next = screen.getByRole('button', { name: /siguiente/i })
    expect(next).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Nombre del reto'), 'La cuenta de la cena')
    expect(next).toBeDisabled() // falta la pregunta

    await userEvent.type(screen.getByLabelText('Tu pregunta'), '¿Cuánto costó la cena?')
    expect(next).toBeEnabled()

    await userEvent.click(next)
    // Paso 2: cifra + reglas (plazo y tiempo por jugada) en la misma hoja.
    expect(screen.getByText('La cifra correcta')).toBeInTheDocument()
    expect(screen.getByText('Plazo para jugar')).toBeInTheDocument()
    expect(screen.getByText('Tiempo por jugada')).toBeInTheDocument()
    // La nota de que la respuesta queda oculta hasta que todos voten.
    expect(screen.getByText(/oculta hasta que voten/i)).toBeInTheDocument()
  })

  test('atrás desde el paso 2 vuelve al paso 1 con lo escrito intacto; desde el paso 1 sale', async () => {
    const { onBack } = renderCreate()
    await fillStepOneAndAdvance()
    expect(screen.getByText('La cifra correcta')).toBeInTheDocument()

    // El atrás de la cabecera en el paso 2 retrocede de paso (no sale del flujo).
    await userEvent.click(screen.getByRole('button', { name: 'Paso anterior' }))
    expect(screen.getByText('¿Qué adivinan?')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre del reto')).toHaveValue('La cuenta de la cena')
    expect(onBack).not.toHaveBeenCalled()

    // En el paso 1 el atrás sí sale (vuelve al selector de tipo).
    await userEvent.click(screen.getByRole('button', { name: 'Atrás' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  test('no crea sin cifra válida; con "84,50" crea con valor, decimales y unidad', async () => {
    createNumberChallengeMock.mockResolvedValue({
      challenge: { id: 'reto-1', title: 'La cuenta de la cena' } as ChallengeForPlay,
      groupId: 'g1',
    })
    renderCreate()
    await fillStepOneAndAdvance()

    const create = screen.getByRole('button', { name: /crear el reto/i })
    expect(create).toBeDisabled() // falta la respuesta correcta

    // Formato es-ES: la coma marca los decimales y estos se conservan (84,50 → 2).
    await userEvent.type(screen.getByLabelText('Respuesta correcta'), '84,50')
    expect(create).toBeEnabled()
    await userEvent.click(create)

    await waitFor(() => expect(createNumberChallengeMock).toHaveBeenCalledTimes(1))
    expect(createNumberChallengeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'La cuenta de la cena',
        question: '¿Cuánto costó la cena del grupo?',
        answerNumber: 84.5,
        decimals: 2,
        unit: '€',
        groupId: 'g1',
      }),
    )
    // Sin foto no se sube nada a Storage.
    expect(uploadImageMock).not.toHaveBeenCalled()
    // El destino de crear es la hoja de Compartir, no saltar a jugar.
    expect(await screen.findByRole('button', { name: /compartir enlace/i })).toBeInTheDocument()
  })
})
