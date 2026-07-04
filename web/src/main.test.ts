// Prueba el flujo de auto-apply del update de PWA (#555 → #633 → #647): el
// guard de ruta segura (`lib/safeUpdateRoute.ts`) debe cortar el auto-apply por
// `visibilitychange` cuando el usuario está en una ruta no segura, y el
// `hashchange` debe aplicarlo en cuanto navega a una ruta segura. El resto del
// entrypoint (App, UI, analítica…) se mockea: no es lo que este test verifica.
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import type { ReactNode } from 'react'

vi.mock('./App.tsx', () => ({ default: () => null }))
vi.mock('./ui', () => ({
  ToastProvider: ({ children }: { children: ReactNode }) => children,
  UpdateBanner: () => null,
}))
vi.mock('./lib/RootErrorBoundary', () => ({
  RootErrorBoundary: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('./lib/analytics', () => ({ initAnalytics: vi.fn() }))
vi.mock('./lib/observability', () => ({ initObservability: vi.fn() }))
vi.mock('./lib/cleanRoute', () => ({ applyCleanRoute: vi.fn(async () => {}) }))

// `registerSW` (virtual:pwa-register, provisto por vite-plugin-pwa en build)
// se mockea para poder disparar `onNeedRefresh` manualmente y espiar el
// `updateSW` que dispara el reload real.
let onNeedRefresh: () => void = () => {}
const updateSWMock = vi.fn()
vi.mock('virtual:pwa-register', () => ({
  registerSW: (options: { onNeedRefresh?: () => void }) => {
    onNeedRefresh = options.onNeedRefresh ?? (() => {})
    return updateSWMock
  },
}))

function setHash(hash: string): void {
  window.location.hash = hash
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
}

// jsdom no implementa `navigator.serviceWorker`: `applyUpdate` (main.tsx) lo usa
// para escuchar `controllerchange`. Un stub inerte basta — el reload real (vía
// `updateSW`) ya está mockeado arriba, esto solo evita que `applyUpdate` reviente.
if (!('serviceWorker' in navigator)) {
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
    configurable: true,
  })
}

// Cada `loadMain()` (uno por test, tras `vi.resetModules()`) vuelve a ejecutar
// `main.tsx` y por tanto vuelve a registrar los listeners de `visibilitychange`
// y `hashchange` en el `document`/`window` REALES de jsdom (compartidos entre
// tests del mismo fichero). Sin limpiarlos, se ACUMULAN: un test posterior
// dispararía también los listeners de instancias de módulo de tests
// anteriores (con su propio `updateAvailable` cerrado sobre el mismo
// `updateSWMock` compartido), contando llamadas de más. Capturamos los
// handlers añadidos para poder retirarlos en `afterEach`.
const originalDocAddEventListener = document.addEventListener.bind(document)
const originalWinAddEventListener = window.addEventListener.bind(window)
let addedVisibilityHandlers: EventListenerOrEventListenerObject[] = []
let addedHashHandlers: EventListenerOrEventListenerObject[] = []

async function loadMain(): Promise<void> {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
  await import('./main.tsx')
}

describe('main: auto-apply del update de PWA en rutas seguras (#647)', () => {
  beforeEach(() => {
    vi.resetModules()
    // Timers falsos: `applyUpdate` arma un cinturón `setTimeout(reloadOnce, 1500)`
    // que si no, quedaría vivo de verdad entre tests (no hace falta que corra:
    // estos tests verifican si se LLAMA a `updateSW`, no el reload en sí).
    vi.useFakeTimers()
    document.body.innerHTML = ''
    setHidden(false)
    window.location.hash = ''
    updateSWMock.mockClear()
    onNeedRefresh = () => {}

    addedVisibilityHandlers = []
    addedHashHandlers = []
    vi.spyOn(document, 'addEventListener').mockImplementation((type, handler, options) => {
      if (type === 'visibilitychange') addedVisibilityHandlers.push(handler as EventListener)
      originalDocAddEventListener(type, handler, options)
    })
    vi.spyOn(window, 'addEventListener').mockImplementation((type, handler, options) => {
      if (type === 'hashchange') addedHashHandlers.push(handler as EventListener)
      originalWinAddEventListener(type, handler, options)
    })
  })

  afterEach(() => {
    addedVisibilityHandlers.forEach((h) => document.removeEventListener('visibilitychange', h))
    addedHashHandlers.forEach((h) => window.removeEventListener('hashchange', h))
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  test('visibilidad en ruta NO segura: no aplica', async () => {
    setHash('#nuevo')
    await loadMain()
    onNeedRefresh() // hay una actualización pendiente

    setHidden(true)
    document.dispatchEvent(new Event('visibilitychange'))

    expect(updateSWMock).not.toHaveBeenCalled()
  })

  test('visibilidad en ruta segura: aplica tras el retardo, no al instante', async () => {
    setHash('#g=abc123')
    await loadMain()
    onNeedRefresh()

    setHidden(true)
    document.dispatchEvent(new Event('visibilitychange'))

    // Al ocultarse NO aplica ya (un salto corto a otra app no debe recargar)…
    expect(updateSWMock).not.toHaveBeenCalled()

    // …pero tras el retardo de ausencia real, sí.
    vi.advanceTimersByTime(5 * 60_000)
    expect(updateSWMock).toHaveBeenCalledTimes(1)
  })

  test('salto corto: volver antes del retardo cancela la recarga', async () => {
    setHash('#g=abc123')
    await loadMain()
    onNeedRefresh()

    setHidden(true)
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(2 * 60_000)

    // Vuelve antes de que venza el retardo: el timer se cancela.
    setHidden(false)
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(10 * 60_000)

    expect(updateSWMock).not.toHaveBeenCalled()
  })

  test('hashchange a ruta segura NO aplica solo: enseña la pastilla y decide el usuario', async () => {
    setHash('#nuevo')
    await loadMain()
    setHidden(true)
    onNeedRefresh()

    // Oculta en ruta no segura: ni al instante ni tras el retardo.
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(5 * 60_000)
    expect(updateSWMock).not.toHaveBeenCalled()

    // Navega a una ruta segura: antes (#647) esto recargaba en la cara del
    // usuario ("volver atrás" = refresco); ahora solo muestra la pastilla.
    setHash('#g=abc123')
    window.dispatchEvent(new Event('hashchange'))
    expect(updateSWMock).not.toHaveBeenCalled()
    expect(document.getElementById('update-banner-root')).not.toBeNull()
  })

  test('hashchange a ruta NO segura no aplica', async () => {
    setHash('#g=abc123')
    await loadMain()
    onNeedRefresh()

    setHash('#g=abc123&add=recuerdo')
    window.dispatchEvent(new Event('hashchange'))

    expect(updateSWMock).not.toHaveBeenCalled()
  })
})
