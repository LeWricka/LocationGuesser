import { describe, expect, test } from 'vitest'
import { shouldReloadForSwUpdate, SW_RELOAD_WINDOW_MS } from './swUpdateReload'

// `storage` de mentira en memoria para no depender de un `sessionStorage` real.
function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  }
}

describe('shouldReloadForSwUpdate', () => {
  test('primera vez: recarga y deja la marca con el timestamp actual', () => {
    const storage = fakeStorage()
    expect(shouldReloadForSwUpdate(storage, 1_000)).toBe(true)
    expect(storage.getItem('lg:sw-update-reloaded')).toBe('1000')
  })

  test('dentro de la ventana: NO recarga (corta el bucle) y NO alarga la marca', () => {
    const storage = fakeStorage({ 'lg:sw-update-reloaded': '1000' })
    expect(shouldReloadForSwUpdate(storage, 1_000 + SW_RELOAD_WINDOW_MS - 1)).toBe(false)
    // La marca NO se toca: el bloqueo cuenta desde la recarga real.
    expect(storage.getItem('lg:sw-update-reloaded')).toBe('1000')
  })

  test('fuera de la ventana: vuelve a recargar y renueva la marca', () => {
    const storage = fakeStorage({ 'lg:sw-update-reloaded': '1000' })
    const now = 1_000 + SW_RELOAD_WINDOW_MS
    expect(shouldReloadForSwUpdate(storage, now)).toBe(true)
    expect(storage.getItem('lg:sw-update-reloaded')).toBe(String(now))
  })
})
