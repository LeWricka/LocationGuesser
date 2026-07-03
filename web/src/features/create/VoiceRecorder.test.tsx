import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VoiceRecorder, type VoiceValue } from './VoiceRecorder'
import { ToastProvider } from '../../ui'

const trackMock = vi.fn()
vi.mock('../../lib/analytics', () => ({ track: (...args: unknown[]) => trackMock(...args) }))

/** MediaRecorder mínimo: arranca en 'inactive', simula un `dataavailable` +
 * `stop` cuando se le pide parar (patrón real: los datos llegan al detener). */
class FakeMediaRecorder {
  static isTypeSupported = vi.fn((type: string) => type === 'audio/webm;codecs=opus')
  state: 'inactive' | 'recording' = 'inactive'
  mimeType: string
  stream: MediaStream
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  constructor(stream: MediaStream, options?: { mimeType?: string }) {
    this.stream = stream
    this.mimeType = options?.mimeType ?? ''
  }
  start() {
    this.state = 'recording'
  }
  stop() {
    if (this.state === 'inactive') return
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['audio-bytes'], { type: this.mimeType }) })
    this.onstop?.()
  }
}

function fakeStream(): MediaStream {
  return { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream
}

function stubMediaApis(opts: { getUserMedia?: () => Promise<MediaStream> } = {}) {
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: opts.getUserMedia ?? (async () => fakeStream()) },
    configurable: true,
  })
  // jsdom no implementa createObjectURL/revokeObjectURL; los añadimos al URL
  // real (no lo sustituimos entero) — mismo patrón que AddMoment.test.tsx.
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:draft'), revokeObjectURL: vi.fn() })
}

function renderRecorder(value: VoiceValue = { kind: 'none' }) {
  const onChange = vi.fn()
  const utils = render(
    <ToastProvider>
      <VoiceRecorder value={value} onChange={onChange} />
    </ToastProvider>,
  )
  return { onChange, ...utils }
}

describe('VoiceRecorder — grabadora de nota de voz (#648)', () => {
  beforeEach(() => {
    trackMock.mockClear()
    stubMediaApis()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    Reflect.deleteProperty(navigator, 'mediaDevices')
  })

  test('el permiso del micro se pide SOLO al pulsar "Grabar" (patrón GPS #599), no antes', async () => {
    const getUserMedia = vi.fn(async () => fakeStream())
    stubMediaApis({ getUserMedia })
    renderRecorder()

    expect(getUserMedia).not.toHaveBeenCalled()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /grabar nota de voz/i }))

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(await screen.findByLabelText('Detener grabación')).toBeInTheDocument()
  })

  test('permiso denegado (NotAllowedError): avisa y se queda en el botón de grabar', async () => {
    const denied = new DOMException('nope', 'NotAllowedError')
    stubMediaApis({ getUserMedia: async () => Promise.reject(denied) })
    renderRecorder()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /grabar nota de voz/i }))

    expect(await screen.findByText(/diste «no» al permiso del micrófono/i)).toBeInTheDocument()
    // No entró en modo grabación: el botón sigue siendo el de arrancar.
    expect(screen.getByRole('button', { name: /grabar nota de voz/i })).toBeInTheDocument()
  })

  // Fake timers instalados ANTES del click: el `setInterval` del contador lo
  // crea `startRecording` en cuanto resuelve `getUserMedia` (una promesa), así
  // que si el reloj falso entrara DESPUÉS, ese intervalo ya habría quedado
  // enganchado al reloj REAL y `advanceTimersByTimeAsync` no lo movería.
  // `fireEvent` (no `userEvent`) evita el retraso interno de puntero de
  // user-event, pensado para reloj real.
  describe('contador y tope de 60s (reloj falso)', () => {
    beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
    afterEach(() => vi.useRealTimers())

    test('el contador sube y detener a mano entrega un draft con el mime real', async () => {
      const { onChange } = renderRecorder()
      fireEvent.click(screen.getByRole('button', { name: /grabar nota de voz/i }))
      // Flush del microtask de getUserMedia (resuelto) sin avanzar el reloj.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(screen.getByText('0:00')).toBeInTheDocument()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000)
      })
      expect(screen.getByText('0:03')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Detener grabación' }))

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'draft', mimeType: 'audio/webm;codecs=opus' }),
      )
      expect(trackMock).toHaveBeenCalledWith('voice_note_recorded', { duration_seconds: 3 })
    })

    test('tope de 60s: auto-stop sin intervención, entrega el draft igual', async () => {
      const { onChange } = renderRecorder()
      fireEvent.click(screen.getByRole('button', { name: /grabar nota de voz/i }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(screen.getByText('0:00')).toBeInTheDocument()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000)
      })

      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'draft' }))
      expect(trackMock).toHaveBeenCalledWith('voice_note_recorded', { duration_seconds: 60 })
      // El botón vuelve al estado "grabar" — no queda colgado en "grabando".
      expect(screen.queryByLabelText('Detener grabación')).not.toBeInTheDocument()
    })
  })

  test('con una nota ya guardada ("existing"): muestra el player y "Descartar" limpia el estado', async () => {
    const { onChange } = renderRecorder({
      kind: 'existing',
      url: 'https://firmada.example/nota.webm',
    })

    expect(screen.getByLabelText(/reproducir nota de voz/i)).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /descartar/i }))

    expect(onChange).toHaveBeenCalledWith({ kind: 'none' })
  })

  test('"Regrabar" sobre un draft revoca el object URL anterior y vuelve a pedir el micro', async () => {
    const getUserMedia = vi.fn(async () => fakeStream())
    stubMediaApis({ getUserMedia })
    const revokeSpy = vi.fn()
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:draft-2'), revokeObjectURL: revokeSpy })

    renderRecorder({
      kind: 'draft',
      blob: new Blob(['x']),
      mimeType: 'audio/webm',
      url: 'blob:draft-1',
    })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /regrabar/i }))

    expect(revokeSpy).toHaveBeenCalledWith('blob:draft-1')
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(await screen.findByLabelText('Detener grabación')).toBeInTheDocument()
  })
})
