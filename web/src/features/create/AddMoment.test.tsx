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

const createMomentMock = vi.fn()
vi.mock('../../lib/challenges', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/challenges')>()
  return { ...actual, createMoment: (...args: unknown[]) => createMomentMock(...args) }
})

const addMomentImagesMock = vi.fn()
vi.mock('../../lib/momentImages', () => ({
  addMomentImages: (...args: unknown[]) => addMomentImagesMock(...args),
}))

// El GPS del EXIF es irrelevante para el caso de subida parcial: sin GPS, el
// usuario marca el lugar a mano (o ninguno, es opcional).
vi.mock('../../lib/exif', () => ({ readGpsFromExif: async () => null }))

// El mapa (Leaflet) es pesado e irrelevante para este caso (mismo patrón que
// MomentSheet.test.tsx).
vi.mock('./MapPicker', () => ({ MapPicker: () => <div data-testid="map-picker" /> }))

const uploadImageMock = vi.fn()
vi.mock('../../lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/storage')>()
  return { ...actual, uploadImage: (...args: unknown[]) => uploadImageMock(...args) }
})

// Import DESPUÉS de los vi.mock (hoisted igualmente, pero así queda claro el orden
// de lectura: primero qué se mockea, luego qué se prueba).
import { AddMoment } from './AddMoment'
import { ImageDecodeError } from '../../lib/storage'
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

function renderAddMoment() {
  const onCreated = vi.fn()
  render(
    <SessionContext.Provider value={session}>
      <ToastProvider>
        <AddMoment groupId="g1" onBack={vi.fn()} onCreated={onCreated} onAddChallenge={vi.fn()} />
      </ToastProvider>
    </SessionContext.Provider>,
  )
  return { onCreated }
}

function fakeFile(name: string): File {
  return new File(['contenido'], name, { type: 'image/jpeg' })
}

describe('AddMoment — subida de fotos resiliente (#531, remate del #520)', () => {
  beforeEach(() => {
    trackMock.mockClear()
    reportErrorMock.mockClear()
    createMomentMock.mockReset()
    addMomentImagesMock.mockReset()
    uploadImageMock.mockReset()
    // jsdom no implementa createObjectURL/revokeObjectURL; el componente los usa
    // solo para la miniatura de la galería, irrelevante para este caso.
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() })
  })

  test('si una foto falla al decodificar, las demás se suben y el recuerdo se guarda', async () => {
    uploadImageMock
      .mockRejectedValueOnce(new ImageDecodeError('rota.jpg'))
      .mockResolvedValueOnce('ok/foto2.jpg')
    createMomentMock.mockResolvedValue({
      challenge: { id: 'm1', title: 'Mi recuerdo' } as ChallengeForPlay,
      groupId: 'g1',
    })
    addMomentImagesMock.mockResolvedValue(undefined)

    const { onCreated } = renderAddMoment()

    await userEvent.type(screen.getByLabelText(/título/i), 'Mi recuerdo')
    await userEvent.upload(screen.getByLabelText('Añadir fotos del día'), [
      fakeFile('rota.jpg'),
      fakeFile('foto2.jpg'),
    ])

    await userEvent.click(screen.getByRole('button', { name: /guardar recuerdo/i }))

    // El recuerdo se guarda con la ÚNICA foto que sí subió (la portada se corre a
    // la que sobrevivió), no se pierde el formulario ni se aborta todo el guardado.
    await waitFor(() => expect(createMomentMock).toHaveBeenCalledTimes(1))
    expect(createMomentMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Mi recuerdo', imagePath: 'ok/foto2.jpg' }),
    )
    expect(addMomentImagesMock).toHaveBeenCalledWith('m1', ['ok/foto2.jpg'])

    // Avisa cuál falló, sin bloquear el camino feliz.
    expect(await screen.findByText(/no se pudo subir «rota\.jpg»/i)).toBeInTheDocument()
    // Reporta el fallo puntual a observabilidad (no revienta la app).
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.any(ImageDecodeError),
      expect.objectContaining({ area: 'add_moment' }),
    )
    // Termina en el estado "guardado" (no se quedó colgado en el formulario).
    expect(onCreated).not.toHaveBeenCalled() // "Añadir reto" / "volver" son manuales
    expect(await screen.findByText('Recuerdo guardado')).toBeInTheDocument()
  })

  test('si TODAS las fotos fallan, no se guarda nada y el formulario queda intacto', async () => {
    uploadImageMock.mockRejectedValue(new ImageDecodeError('rota.jpg'))

    renderAddMoment()

    await userEvent.type(screen.getByLabelText(/título/i), 'Mi recuerdo')
    await userEvent.upload(screen.getByLabelText('Añadir fotos del día'), [fakeFile('rota.jpg')])
    await userEvent.click(screen.getByRole('button', { name: /guardar recuerdo/i }))

    expect(await screen.findByText(/no se pudo subir «rota\.jpg»/i)).toBeInTheDocument()
    expect(createMomentMock).not.toHaveBeenCalled()
    // El título sigue ahí: no se perdió el formulario.
    expect(screen.getByLabelText(/título/i)).toHaveValue('Mi recuerdo')
  })
})
