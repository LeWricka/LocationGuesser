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
const uploadAudioMock = vi.fn()
vi.mock('../../lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/storage')>()
  return {
    ...actual,
    uploadImage: (...args: unknown[]) => uploadImageMock(...args),
    uploadAudio: (...args: unknown[]) => uploadAudioMock(...args),
  }
})

// La grabadora (MediaRecorder/getUserMedia) tiene su propio test unitario
// (VoiceRecorder.test.tsx); aquí la sustituimos por un stub que dispara
// `onChange` con un draft ya "grabado", para probar el CABLEADO del guardado
// (subida best-effort + `audioPath` a `createMoment`) sin la mecánica del micro.
vi.mock('./VoiceRecorder', () => ({
  VoiceRecorder: ({ onChange }: { onChange: (v: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        onChange({
          kind: 'draft',
          blob: new Blob(['audio-bytes'], { type: 'audio/webm' }),
          mimeType: 'audio/webm;codecs=opus',
          url: 'blob:audio-draft',
        })
      }
    >
      stub: grabar nota de voz
    </button>
  ),
}))

// Fecha por defecto en cascada (#553): mocks de las dos consultas ligeras que
// resuelve AddMoment al montar (el último momento del viaje + sus fechas). Por
// defecto no hay ni lo uno ni lo otro (cae en "hoy", el comportamiento previo);
// cada test de la cascada los sobreescribe.
const getGroupMock = vi.fn()
vi.mock('../../lib/groupData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/groupData')>()
  return { ...actual, getGroup: (...args: unknown[]) => getGroupMock(...args) }
})

const latestMomentMock = vi.fn()
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => ({ maybeSingle: latestMomentMock })),
          })),
        })),
      })),
    })),
  },
}))

// Import DESPUÉS de los vi.mock (hoisted igualmente, pero así queda claro el orden
// de lectura: primero qué se mockea, luego qué se prueba).
import { AddMoment, computeDefaultDate } from './AddMoment'
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
    uploadAudioMock.mockReset()
    // Por defecto, viaje sin momentos ni fechas propias (cae en "hoy").
    getGroupMock.mockReset().mockResolvedValue(null)
    latestMomentMock.mockReset().mockResolvedValue({ data: null, error: null })
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
    // La foto fallida queda MARCADA en el picker (#550), no desaparece sin más:
    // el dueño ve cuál fue y puede quitarla o reintentar pulsando guardar de nuevo.
    expect(await screen.findByText('No subida')).toBeInTheDocument()
  })

  test('reintentar pulsando «Guardar recuerdo» vuelve a intentar la foto marcada como fallida (#550)', async () => {
    uploadImageMock
      .mockRejectedValueOnce(new ImageDecodeError('rota.jpg'))
      .mockResolvedValueOnce('ok/rota.jpg')
    createMomentMock.mockResolvedValue({
      challenge: { id: 'm1', title: 'Mi recuerdo' } as ChallengeForPlay,
      groupId: 'g1',
    })
    addMomentImagesMock.mockResolvedValue(undefined)

    renderAddMoment()

    await userEvent.type(screen.getByLabelText(/título/i), 'Mi recuerdo')
    await userEvent.upload(screen.getByLabelText('Añadir fotos del día'), [fakeFile('rota.jpg')])
    await userEvent.click(screen.getByRole('button', { name: /guardar recuerdo/i }))
    expect(await screen.findByText('No subida')).toBeInTheDocument()

    // Reintento: SIN tocar nada más, vuelve a pulsar guardar y esta vez sube.
    await userEvent.click(screen.getByRole('button', { name: /guardar recuerdo/i }))

    await waitFor(() => expect(createMomentMock).toHaveBeenCalledTimes(1))
    expect(uploadImageMock).toHaveBeenCalledTimes(2)
    expect(await screen.findByText('Recuerdo guardado')).toBeInTheDocument()
  })
})

describe('AddMoment — nota de voz (#648)', () => {
  beforeEach(() => {
    trackMock.mockClear()
    reportErrorMock.mockClear()
    createMomentMock.mockReset()
    addMomentImagesMock.mockReset()
    uploadAudioMock.mockReset()
    getGroupMock.mockReset().mockResolvedValue(null)
    latestMomentMock.mockReset().mockResolvedValue({ data: null, error: null })
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() })
  })

  test('graba una nota de voz y la sube al guardar: el path llega a createMoment', async () => {
    uploadAudioMock.mockResolvedValue('audio/nota-1.webm')
    createMomentMock.mockResolvedValue({
      challenge: { id: 'm1', title: 'Mi recuerdo' } as ChallengeForPlay,
      groupId: 'g1',
    })

    renderAddMoment()

    await userEvent.type(screen.getByLabelText(/título/i), 'Mi recuerdo')
    await userEvent.click(screen.getByRole('button', { name: /stub: grabar nota de voz/i }))
    await userEvent.click(screen.getByRole('button', { name: /guardar recuerdo/i }))

    await waitFor(() => expect(createMomentMock).toHaveBeenCalledTimes(1))
    expect(uploadAudioMock).toHaveBeenCalledWith(expect.any(Blob), 'audio/webm;codecs=opus')
    expect(createMomentMock).toHaveBeenCalledWith(
      expect.objectContaining({ audioPath: 'audio/nota-1.webm' }),
    )
    expect(trackMock).toHaveBeenCalledWith(
      'moment_created',
      expect.objectContaining({ has_audio: true }),
    )
  })

  test('si falla la subida de la nota, el recuerdo se guarda igual (best-effort) y avisa cuál falló', async () => {
    uploadAudioMock.mockRejectedValue(new Error('network boom'))
    createMomentMock.mockResolvedValue({
      challenge: { id: 'm1', title: 'Mi recuerdo' } as ChallengeForPlay,
      groupId: 'g1',
    })

    renderAddMoment()

    await userEvent.type(screen.getByLabelText(/título/i), 'Mi recuerdo')
    await userEvent.click(screen.getByRole('button', { name: /stub: grabar nota de voz/i }))
    await userEvent.click(screen.getByRole('button', { name: /guardar recuerdo/i }))

    await waitFor(() => expect(createMomentMock).toHaveBeenCalledTimes(1))
    // El recuerdo se guarda sin audio (no bloquea el resto del guardado).
    expect(createMomentMock).toHaveBeenCalledWith(expect.objectContaining({ audioPath: null }))
    expect(trackMock).toHaveBeenCalledWith(
      'moment_created',
      expect.objectContaining({ has_audio: false }),
    )
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ area: 'add_moment', stage: 'upload_audio' }),
    )
    expect(await screen.findByText(/no se pudo subir la nota de voz/i)).toBeInTheDocument()
  })
})

describe('computeDefaultDate — fecha por defecto en cascada (#553)', () => {
  const today = '2026-07-03'

  test('1a. con momentos y created_at DENTRO del rango del viaje → la fecha del más reciente', () => {
    // Diario documentado en vivo: el último momento ancla la fecha.
    expect(
      computeDefaultDate('2024-09-10T12:00:00.000Z', '2024-09-01', '2024-09-15', today),
    ).toEqual({ date: '2024-09-10', max: today })
  })

  test('1b. con momentos pero SIN fechas del viaje → la fecha del más reciente (nada que contrastar)', () => {
    expect(computeDefaultDate('2026-06-20T12:00:00.000Z', null, null, today)).toEqual({
      date: '2026-06-20',
      max: today,
    })
  })

  test('1c. viaje PASADO rellenado hoy (created_at fuera del rango) → se ignora y cae a starts_on', () => {
    // El caso real del dueño con el SEGUNDO recuerdo: el primero se creó HOY
    // (backfill de un viaje de sept 2024), así que su created_at NO es la fecha
    // del viaje sino un artefacto. Si lo usáramos, el dolor original reaparecería
    // a partir del segundo recuerdo. Fuera del rango → regla 2 → starts_on.
    expect(computeDefaultDate(`${today}T10:00:00.000Z`, '2024-09-01', '2024-09-15', today)).toEqual(
      { date: '2024-09-01', max: today },
    )
  })

  test('2a. sin momentos, viaje PASADO con fechas → hoy acotado a starts_on', () => {
    expect(computeDefaultDate(null, '2024-09-01', '2024-09-15', today)).toEqual({
      date: '2024-09-01',
      max: today,
    })
  })

  test('2b. sin momentos, viaje FUTURO con fechas → starts_on, y el max se amplía a ends_on', () => {
    expect(computeDefaultDate(null, '2026-08-01', '2026-08-15', today)).toEqual({
      date: '2026-08-01',
      max: '2026-08-15',
    })
  })

  test('2c. sin momentos, hoy DENTRO del rango del viaje → hoy (max se queda en hoy)', () => {
    expect(computeDefaultDate(null, '2026-07-01', '2026-07-10', today)).toEqual({
      date: today,
      max: today,
    })
  })

  test('3. sin momentos ni fechas del viaje → hoy (comportamiento de siempre)', () => {
    expect(computeDefaultDate(null, null, null, today)).toEqual({ date: today, max: today })
  })

  test('viaje futuro SIN ends_on → starts_on, pero el max no se amplía (nada a lo que ampliar)', () => {
    expect(computeDefaultDate(null, '2026-08-01', null, today)).toEqual({
      date: '2026-08-01',
      max: today,
    })
  })
})

describe('AddMoment — fecha por defecto pre-rellenada (#553)', () => {
  test('preselecciona la fecha del recuerdo más reciente y el calendario abre en su mes', async () => {
    latestMomentMock.mockResolvedValue({
      data: { created_at: '2024-09-10T12:00:00.000Z' },
      error: null,
    })

    renderAddMoment()

    // El campo llega con "hoy" (mientras resuelve la cascada) y se actualiza solo,
    // sin que el usuario toque nada, en cuanto llega el último momento del viaje.
    const trigger = await screen.findByLabelText('Fecha')
    await waitFor(() => expect(trigger).toHaveTextContent('10 de septiembre de 2024'))

    // Al abrir el calendario, el mes visible es el de la fecha pre-rellenada (sept
    // 2024), no el de hoy: DatePicker recalcula el mes visible en el gesto de abrir
    // (`toggleOpen`), así que no hace falta ninguna prop nueva de "mes inicial".
    await userEvent.click(trigger)
    expect(screen.getByRole('dialog')).toHaveTextContent('septiembre 2024')
  })
})
