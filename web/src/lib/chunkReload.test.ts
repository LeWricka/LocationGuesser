import { describe, test, expect, vi } from 'vitest'
import {
  isChunkLoadError,
  shouldReloadForChunkError,
  registerChunkReloadListeners,
} from './chunkReload'

// Storage fake mínimo (mismo patrón que reloadOnPreloadError.test.ts, ahora
// retirado): evita depender de `sessionStorage` real para tests 100% aislados.
function fakeStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const store = new Map<string, string>()
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
  }
}

// Target fake: solo lo que usa `registerChunkReloadListeners` (`addEventListener`),
// con un `dispatch` propio para no depender de `window`/`EventTarget` real —
// así los tests no chocan con listeners globales de otros ficheros. El cast
// (única vez, aquí) esquiva las sobrecargas de `WindowEventMap`: el fake solo
// necesita aceptar el evento genérico que le mandamos en cada test.
type Handler = (event: Record<string, unknown>) => void
function fakeTarget(): Pick<Window, 'addEventListener'> & {
  dispatch: (type: string, event: Record<string, unknown>) => void
} {
  const handlers = new Map<string, Handler>()
  return {
    addEventListener: vi.fn((type: string, handler: Handler) => {
      handlers.set(type, handler)
    }) as unknown as Pick<Window, 'addEventListener'>['addEventListener'],
    dispatch(type: string, event: Record<string, unknown>) {
      handlers.get(type)?.(event)
    },
  }
}

function fakeEvent(overrides: Record<string, unknown> = {}) {
  return { preventDefault: vi.fn(), ...overrides }
}

describe('isChunkLoadError', () => {
  test('detecta el mensaje de Chrome/Vite', () => {
    expect(isChunkLoadError('Failed to fetch dynamically imported module: x.js')).toBe(true)
  })

  test('detecta la variante de Firefox/Safari', () => {
    expect(isChunkLoadError('error loading dynamically imported module')).toBe(true)
  })

  test('es insensible a mayúsculas', () => {
    expect(isChunkLoadError('FAILED TO FETCH DYNAMICALLY IMPORTED MODULE')).toBe(true)
  })

  test('no marca mensajes sin relación', () => {
    expect(isChunkLoadError('Network request failed')).toBe(false)
  })

  test('mensajes vacíos/ausentes: false', () => {
    expect(isChunkLoadError(null)).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
    expect(isChunkLoadError('')).toBe(false)
  })
})

describe('shouldReloadForChunkError (guard anti-bucle, ventana de 10s)', () => {
  test('primera vez: recarga y deja la marca', () => {
    const storage = fakeStorage()
    expect(shouldReloadForChunkError(storage, 1_000)).toBe(true)
  })

  test('dentro de la ventana de 10s: NO recarga otra vez', () => {
    const storage = fakeStorage()
    expect(shouldReloadForChunkError(storage, 1_000)).toBe(true)
    expect(shouldReloadForChunkError(storage, 1_000 + 9_999)).toBe(false)
  })

  test('pasada la ventana de 10s: vuelve a permitir recarga', () => {
    const storage = fakeStorage()
    expect(shouldReloadForChunkError(storage, 1_000)).toBe(true)
    expect(shouldReloadForChunkError(storage, 1_000 + 10_001)).toBe(true)
  })
})

describe('registerChunkReloadListeners', () => {
  test('vite:preloadError: recarga y evita que el rechazo escape', () => {
    const target = fakeTarget()
    const reload = vi.fn()
    registerChunkReloadListeners({ target, storage: fakeStorage(), reload })

    const event = fakeEvent()
    target.dispatch('vite:preloadError', event)

    expect(reload).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })

  test('unhandledrejection con el mensaje del chunk: recarga', () => {
    const target = fakeTarget()
    const reload = vi.fn()
    registerChunkReloadListeners({ target, storage: fakeStorage(), reload })

    const event = fakeEvent({
      reason: new Error('Failed to fetch dynamically imported module: y.js'),
    })
    target.dispatch('unhandledrejection', event)

    expect(reload).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })

  test('unhandledrejection sin relación: no recarga, deja fluir', () => {
    const target = fakeTarget()
    const reload = vi.fn()
    registerChunkReloadListeners({ target, storage: fakeStorage(), reload })

    const event = fakeEvent({ reason: new Error('boom, algo distinto') })
    target.dispatch('unhandledrejection', event)

    expect(reload).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  test('error global con el mensaje del chunk: recarga (red de seguridad)', () => {
    const target = fakeTarget()
    const reload = vi.fn()
    registerChunkReloadListeners({ target, storage: fakeStorage(), reload })

    const event = fakeEvent({ message: 'error loading dynamically imported module' })
    target.dispatch('error', event)

    expect(reload).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })

  test('con la marca reciente (misma sesión), NO cicla: deja fluir para que Sentry lo vea', () => {
    const target = fakeTarget()
    const reload = vi.fn()
    const storage = fakeStorage()
    registerChunkReloadListeners({ target, storage, reload })

    const first = fakeEvent()
    target.dispatch('vite:preloadError', first)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(first.preventDefault).toHaveBeenCalledTimes(1)

    // Segundo fallo justo después: la marca sigue "reciente" → no recarga otra
    // vez ni evita el rechazo (se deja fluir, visible en Sentry).
    const second = fakeEvent()
    target.dispatch('vite:preloadError', second)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(second.preventDefault).not.toHaveBeenCalled()
  })
})
