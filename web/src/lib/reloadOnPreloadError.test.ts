import { describe, test, expect } from 'vitest'
import { shouldReloadOnPreloadError } from './reloadOnPreloadError'

// Storage fake mínimo (solo lo que usa el guard): evita depender de
// `sessionStorage` real de jsdom para tener un test 100% aislado y explícito.
function fakeStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const store = new Map<string, string>()
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
  }
}

describe('shouldReloadOnPreloadError', () => {
  test('primera llamada de la sesión: true (recargar)', () => {
    expect(shouldReloadOnPreloadError(fakeStorage())).toBe(true)
  })

  test('segunda llamada con el mismo storage: false (no ciclar)', () => {
    const storage = fakeStorage()
    expect(shouldReloadOnPreloadError(storage)).toBe(true)
    expect(shouldReloadOnPreloadError(storage)).toBe(false)
    expect(shouldReloadOnPreloadError(storage)).toBe(false) // sigue en false, no se resetea sola
  })

  test('storages independientes no se pisan (dos sesiones distintas)', () => {
    const storageA = fakeStorage()
    const storageB = fakeStorage()
    expect(shouldReloadOnPreloadError(storageA)).toBe(true)
    expect(shouldReloadOnPreloadError(storageB)).toBe(true)
  })
})
