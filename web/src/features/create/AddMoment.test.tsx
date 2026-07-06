import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
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
const uploadVideoMock = vi.fn()
const validateVideoFileMock = vi.fn()
const extractVideoCoverFrameMock = vi.fn()
vi.mock('../../lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/storage')>()
  return {
    ...actual,
    uploadImage: (...args: unknown[]) => uploadImageMock(...args),
    uploadAudio: (...args: unknown[]) => uploadAudioMock(...args),
    uploadVideo: (...args: unknown[]) => uploadVideoMock(...args),
    validateVideoFile: (...args: unknown[]) => validateVideoFileMock(...args),
    extractVideoCoverFrame: (...args: unknown[]) => extractVideoCoverFrameMock(...args),
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
import { ImageDecodeError, VideoValidationError } from '../../lib/storage'
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

function renderAddMoment(groupId = 'g1') {
  const onCreated = vi.fn()
  const view = render(
    <SessionContext.Provider value={session}>
      <ToastProvider>
        <AddMoment
          groupId={groupId}
          onBack={vi.fn()}
          onCreated={onCreated}
          onAddChallenge={vi.fn()}
        />
      </ToastProvider>
    </SessionContext.Provider>,
  )
  return { onCreated, ...view }
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
    uploadVideoMock.mockReset()
    validateVideoFileMock.mockReset()
    extractVideoCoverFrameMock.mockReset()
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

describe('AddMoment — clip corto de vídeo (#649)', () => {
  beforeEach(() => {
    trackMock.mockClear()
    reportErrorMock.mockClear()
    createMomentMock.mockReset()
    addMomentImagesMock.mockReset()
    uploadImageMock.mockReset()
    uploadVideoMock.mockReset()
    validateVideoFileMock.mockReset()
    extractVideoCoverFrameMock.mockReset()
    getGroupMock.mockReset().mockResolvedValue(null)
    latestMomentMock.mockReset().mockResolvedValue({ data: null, error: null })
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() })
  })

  function fakeVideoFile(name = 'clip.mp4'): File {
    return new File(['video-bytes'], name, { type: 'video/mp4' })
  }

  test('elige un vídeo válido: su fotograma sube como foto (portada) y el clip llega a createMoment', async () => {
    validateVideoFileMock.mockResolvedValue({ durationSeconds: 8, width: 640, height: 360 })
    extractVideoCoverFrameMock.mockResolvedValue(
      new File(['frame'], 'clip-portada.jpg', { type: 'image/jpeg' }),
    )
    uploadImageMock.mockResolvedValue('ok/clip-portada.jpg')
    uploadVideoMock.mockResolvedValue('video/clip-1.mp4')
    createMomentMock.mockResolvedValue({
      challenge: { id: 'm1', title: 'Mi recuerdo' } as ChallengeForPlay,
      groupId: 'g1',
    })
    addMomentImagesMock.mockResolvedValue(undefined)

    renderAddMoment()

    await userEvent.type(screen.getByLabelText(/título/i), 'Mi recuerdo')
    await userEvent.upload(screen.getByLabelText('Añadir fotos del día'), [fakeVideoFile()])
    await waitFor(() => expect(validateVideoFileMock).toHaveBeenCalledTimes(1))
    await userEvent.click(screen.getByRole('button', { name: /guardar recuerdo/i }))

    await waitFor(() => expect(createMomentMock).toHaveBeenCalledTimes(1))
    expect(uploadImageMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'clip-portada.jpg' }),
    )
    expect(uploadVideoMock).toHaveBeenCalledWith(expect.any(File), 'video/mp4')
    expect(createMomentMock).toHaveBeenCalledWith(
      expect.objectContaining({ videoPath: 'video/clip-1.mp4', imagePath: 'ok/clip-portada.jpg' }),
    )
    expect(addMomentImagesMock).toHaveBeenCalledWith('m1', ['ok/clip-portada.jpg'])
    expect(trackMock).toHaveBeenCalledWith(
      'moment_created',
      expect.objectContaining({ has_video: true }),
    )
  })

  test('un vídeo que no pasa la validación no entra: aviso claro, sin extraer fotograma ni tocar el guardado', async () => {
    validateVideoFileMock.mockRejectedValue(
      new VideoValidationError(
        'duration',
        'El vídeo dura 20s; el máximo es 15s. Recorta el clip antes de subirlo.',
      ),
    )

    renderAddMoment()

    await userEvent.type(screen.getByLabelText(/título/i), 'Mi recuerdo')
    await userEvent.upload(screen.getByLabelText('Añadir fotos del día'), [fakeVideoFile()])

    expect(await screen.findByText(/el vídeo dura 20s; el máximo es 15s/i)).toBeInTheDocument()
    expect(extractVideoCoverFrameMock).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /guardar recuerdo/i }))
    await waitFor(() => expect(createMomentMock).toHaveBeenCalledTimes(1))
    expect(createMomentMock).toHaveBeenCalledWith(expect.objectContaining({ videoPath: null }))
    expect(uploadVideoMock).not.toHaveBeenCalled()
  })

  test('si falla la subida del vídeo, el recuerdo se guarda igual (best-effort) con la portada del fotograma', async () => {
    validateVideoFileMock.mockResolvedValue({ durationSeconds: 5, width: 640, height: 360 })
    extractVideoCoverFrameMock.mockResolvedValue(
      new File(['frame'], 'clip-portada.jpg', { type: 'image/jpeg' }),
    )
    uploadImageMock.mockResolvedValue('ok/clip-portada.jpg')
    uploadVideoMock.mockRejectedValue(new Error('network boom'))
    createMomentMock.mockResolvedValue({
      challenge: { id: 'm1', title: 'Mi recuerdo' } as ChallengeForPlay,
      groupId: 'g1',
    })
    addMomentImagesMock.mockResolvedValue(undefined)

    renderAddMoment()

    await userEvent.type(screen.getByLabelText(/título/i), 'Mi recuerdo')
    await userEvent.upload(screen.getByLabelText('Añadir fotos del día'), [fakeVideoFile()])
    await waitFor(() => expect(validateVideoFileMock).toHaveBeenCalledTimes(1))
    await userEvent.click(screen.getByRole('button', { name: /guardar recuerdo/i }))

    await waitFor(() => expect(createMomentMock).toHaveBeenCalledTimes(1))
    expect(createMomentMock).toHaveBeenCalledWith(
      expect.objectContaining({ videoPath: null, imagePath: 'ok/clip-portada.jpg' }),
    )
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ area: 'add_moment', stage: 'upload_video' }),
    )
    expect(await screen.findByText(/no se pudo subir el vídeo/i)).toBeInTheDocument()
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

  // Issue #566: desde la migración 0037, `latestMomentDate` puede llegar como un
  // `happened_on` PURO (`YYYY-MM-DD`, sin hora ni huso) en vez de un `created_at`
  // ISO completo. No debe pasar por la conversión de huso horario (que asumiría
  // medianoche UTC y podría restar un día) — se usa tal cual.
  test('happened_on PURO (YYYY-MM-DD) se usa tal cual, sin conversión de huso', () => {
    expect(computeDefaultDate('2024-09-10', '2024-09-01', '2024-09-15', today)).toEqual({
      date: '2024-09-10',
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
    // Formato compacto del disparador (issue #673): "10 sep 2024", no la fecha
    // larga (que se corta con elipsis en un chip estrecho). El calendario abierto
    // sí muestra el mes en formato largo, ver la aserción de más abajo.
    await waitFor(() => expect(trigger).toHaveTextContent('10 sep 2024'))

    // Al abrir el calendario, el mes visible es el de la fecha pre-rellenada (sept
    // 2024), no el de hoy: DatePicker recalcula el mes visible en el gesto de abrir
    // (`toggleOpen`), así que no hace falta ninguna prop nueva de "mes inicial".
    await userEvent.click(trigger)
    expect(screen.getByRole('dialog')).toHaveTextContent('septiembre 2024')
  })

  // Issue #566: `happened_on` (fecha ELEGIDA, migración 0037) manda sobre
  // `created_at` (cuándo se subió) al anclar la cascada — el caso real de
  // backfill: el último momento se SUBIÓ hoy pero OCURRIÓ hace días.
  test('con happened_on en el último momento, ancla ESA fecha, no created_at', async () => {
    latestMomentMock.mockResolvedValue({
      data: { happened_on: '2024-09-12', created_at: '2026-07-03T09:00:00.000Z' },
      error: null,
    })

    renderAddMoment()

    const trigger = await screen.findByLabelText('Fecha')
    // Formato compacto del disparador (issue #673), ver el test de más arriba.
    await waitFor(() => expect(trigger).toHaveTextContent('12 sep 2024'))
  })
})

describe('AddMoment — fecha elegida en happened_on (#566)', () => {
  beforeEach(() => {
    trackMock.mockClear()
    reportErrorMock.mockClear()
    createMomentMock.mockReset()
    getGroupMock.mockReset().mockResolvedValue(null)
    latestMomentMock.mockReset().mockResolvedValue({ data: null, error: null })
  })

  test('guarda la fecha del campo "Fecha" en happenedOn (YYYY-MM-DD, sin hora ni huso)', async () => {
    createMomentMock.mockResolvedValue({
      challenge: { id: 'm1', title: 'Mi recuerdo' } as ChallengeForPlay,
      groupId: 'g1',
    })

    renderAddMoment()

    await userEvent.type(screen.getByLabelText(/título/i), 'Mi recuerdo')
    await userEvent.click(screen.getByRole('button', { name: /guardar recuerdo/i }))

    await waitFor(() => expect(createMomentMock).toHaveBeenCalledTimes(1))
    const call = createMomentMock.mock.calls[0][0] as { happenedOn?: string }
    expect(call.happenedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  // Antes de la migración 0037 la fecha se anteponía a la descripción como texto
  // (`📅 8 de abril · ...`, ver `buildDescription`); ahora vive en happened_on y
  // la descripción se guarda tal cual la escribió el dueño.
  test('la descripción ya NO incrusta la fecha (vive en happened_on)', async () => {
    createMomentMock.mockResolvedValue({
      challenge: { id: 'm1', title: 'Mi recuerdo' } as ChallengeForPlay,
      groupId: 'g1',
    })

    renderAddMoment()

    await userEvent.type(screen.getByLabelText(/título/i), 'Mi recuerdo')
    await userEvent.type(screen.getByLabelText(/descripción/i), 'Un día genial')
    await userEvent.click(screen.getByRole('button', { name: /guardar recuerdo/i }))

    await waitFor(() => expect(createMomentMock).toHaveBeenCalledTimes(1))
    expect(createMomentMock).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Un día genial' }),
    )
  })
})

// --- Borrador persistente (issue #718) ---------------------------------------------
//
// El reporte del dueño: creando un momento con fotos, clips y descripción,
// sale a mirar una notificación y al volver todo está perdido. Este bloque
// cubre el caso estrella: un draft con fotos (Blobs reales) se restaura con
// sus previews, no solo el texto.
describe('AddMoment — borrador persistente (#718)', () => {
  beforeEach(() => {
    trackMock.mockClear()
    reportErrorMock.mockClear()
    createMomentMock.mockReset()
    addMomentImagesMock.mockReset()
    getGroupMock.mockReset().mockResolvedValue(null)
    latestMomentMock.mockReset().mockResolvedValue({ data: null, error: null })
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() })
  })

  test('caso estrella: título + 2 fotos, desmontar y volver a montar restaura ambas con previews', async () => {
    const groupId = `g-draft-${crypto.randomUUID()}`
    const { unmount } = renderAddMoment(groupId)

    await userEvent.type(screen.getByLabelText(/título/i), 'Día de playa')
    await userEvent.upload(screen.getByLabelText('Añadir fotos del día'), [
      fakeFile('playa.jpg'),
      fakeFile('atardecer.jpg'),
    ])
    await screen.findByText('2 fotos · la 1ª es la portada')

    const { loadDraft } = await import('../../lib/drafts')
    await waitFor(async () => expect(await loadDraft(`moment:${groupId}`)).not.toBeNull(), {
      timeout: 2000,
    })
    unmount()

    renderAddMoment(groupId)
    // La restauración es async: espera al toast (solo aparece tras aplicarla)
    // antes de comprobar campos/galería.
    await screen.findByText(/recuperado tu borrador/i)
    expect(screen.getByLabelText(/título/i)).toHaveValue('Día de playa')
    expect(screen.getByText('2 fotos · la 1ª es la portada')).toBeInTheDocument()
    // Dos miniaturas con preview (object URL reconstruido, mismo criterio que
    // el picker en vivo).
    expect(screen.getAllByAltText('')).toHaveLength(2)
    expect(screen.getByText(/recuperado tu borrador/i)).toBeInTheDocument()
    expect(trackMock).toHaveBeenCalledWith('draft_restored', { form: 'moment', has_photos: true })
  })

  test('"Descartar" en el toast borra el draft y limpia el formulario (título y fotos)', async () => {
    const groupId = `g-draft-${crypto.randomUUID()}`
    const { unmount } = renderAddMoment(groupId)
    await userEvent.type(screen.getByLabelText(/título/i), 'Borrador a descartar')
    await userEvent.upload(screen.getByLabelText('Añadir fotos del día'), [fakeFile('foto.jpg')])

    const { loadDraft } = await import('../../lib/drafts')
    await waitFor(async () => expect(await loadDraft(`moment:${groupId}`)).not.toBeNull(), {
      timeout: 2000,
    })
    unmount()

    renderAddMoment(groupId)
    await screen.findByText(/recuperado tu borrador/i)
    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }))

    expect(screen.getByLabelText(/título/i)).toHaveValue('')
    expect(screen.queryByText(/foto · la 1ª es la portada/)).not.toBeInTheDocument()
    expect(await loadDraft(`moment:${groupId}`)).toBeNull()
  })

  test('guardar el recuerdo con éxito limpia el borrador', async () => {
    const groupId = `g-draft-${crypto.randomUUID()}`
    createMomentMock.mockResolvedValue({
      challenge: { id: 'm-clean', title: 'x' } as ChallengeForPlay,
      groupId,
    })
    renderAddMoment(groupId)

    await userEvent.type(screen.getByLabelText(/título/i), 'x')
    await userEvent.click(screen.getByRole('button', { name: /guardar recuerdo/i }))

    await waitFor(() => expect(createMomentMock).toHaveBeenCalledTimes(1))
    const { loadDraft } = await import('../../lib/drafts')
    expect(await loadDraft(`moment:${groupId}`)).toBeNull()
  })

  test('un formulario en blanco no se guarda ni se restaura (nada que perder)', async () => {
    const groupId = `g-draft-${crypto.randomUUID()}`
    const { unmount } = renderAddMoment(groupId)
    await act(() => new Promise((r) => setTimeout(r, 900)))
    unmount()

    const { unmount: unmountSecond } = renderAddMoment(groupId)
    await act(() => new Promise((r) => setTimeout(r, 50)))
    expect(screen.queryByText(/recuperado tu borrador/i)).not.toBeInTheDocument()
    unmountSecond()
  })
})
