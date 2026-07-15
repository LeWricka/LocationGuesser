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
const reportSilentWarningMock = vi.fn()
vi.mock('./lib/observability', () => ({
  initObservability: vi.fn(),
  reportSilentWarning: reportSilentWarningMock,
}))
vi.mock('./lib/cleanRoute', () => ({ applyCleanRoute: vi.fn(async () => {}) }))

// `registerSW` (virtual:pwa-register, provisto por vite-plugin-pwa en build)
// se mockea para poder disparar `onNeedRefresh`/`onRegisteredSW`/`onRegisterError`
// manualmente y espiar el `updateSW` que dispara el reload real.
type RegisterSWOptions = {
  onNeedRefresh?: () => void
  onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void
  onRegisterError?: (error: unknown) => void
}
let onNeedRefresh: () => void = () => {}
let registerSWOptions: RegisterSWOptions = {}
const updateSWMock = vi.fn()
vi.mock('virtual:pwa-register', () => ({
  registerSW: (options: RegisterSWOptions) => {
    onNeedRefresh = options.onNeedRefresh ?? (() => {})
    registerSWOptions = options
    return updateSWMock
  },
}))

function setHash(hash: string): void {
  window.location.hash = hash
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
}

// jsdom define `window.location.reload` como no configurable, así que
// `vi.spyOn(window.location, 'reload')` revienta con "Cannot redefine
// property". Sustituimos el objeto `location` entero por uno que conserva el
// resto de propiedades (el `hash` que usan otros tests de este fichero) y
// espía solo `reload`. `configurable: true` para poder deshacerlo si hiciera
// falta; no hace falta restaurarlo explícitamente porque cada test de este
// bloque no depende de un `location` real más allá de `reload`.
function mockLocationReload() {
  const reload = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  })
  return reload
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
let addedPreloadErrorHandlers: EventListenerOrEventListenerObject[] = []

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
    reportSilentWarningMock.mockClear()
    registerSWOptions = {}
    onNeedRefresh = () => {}
    sessionStorage.clear() // guard de #761 (shouldReloadOnPreloadError): aislar cada test

    addedVisibilityHandlers = []
    addedHashHandlers = []
    addedPreloadErrorHandlers = []
    vi.spyOn(document, 'addEventListener').mockImplementation((type, handler, options) => {
      if (type === 'visibilitychange') addedVisibilityHandlers.push(handler as EventListener)
      originalDocAddEventListener(type, handler, options)
    })
    vi.spyOn(window, 'addEventListener').mockImplementation((type, handler, options) => {
      if (type === 'hashchange') addedHashHandlers.push(handler as EventListener)
      if (type === 'vite:preloadError') addedPreloadErrorHandlers.push(handler as EventListener)
      originalWinAddEventListener(type, handler, options)
    })
  })

  afterEach(() => {
    addedVisibilityHandlers.forEach((h) => document.removeEventListener('visibilitychange', h))
    addedHashHandlers.forEach((h) => window.removeEventListener('hashchange', h))
    addedPreloadErrorHandlers.forEach((h) => window.removeEventListener('vite:preloadError', h))
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

describe('main: vite:preloadError recarga una vez (#761)', () => {
  beforeEach(() => {
    vi.resetModules()
    document.body.innerHTML = ''
    sessionStorage.clear()
    addedPreloadErrorHandlers = []
    addedHashHandlers = []
    addedVisibilityHandlers = []
    // `loadMain()` también registra los listeners de `hashchange`/
    // `visibilitychange` (#647, no relacionados con este test): los
    // capturamos igual para retirarlos en `afterEach` y no acumular
    // listeners reales entre tests de este bloque.
    vi.spyOn(document, 'addEventListener').mockImplementation((type, handler, options) => {
      if (type === 'visibilitychange') addedVisibilityHandlers.push(handler as EventListener)
      originalDocAddEventListener(type, handler, options)
    })
    vi.spyOn(window, 'addEventListener').mockImplementation((type, handler, options) => {
      if (type === 'vite:preloadError') addedPreloadErrorHandlers.push(handler as EventListener)
      if (type === 'hashchange') addedHashHandlers.push(handler as EventListener)
      originalWinAddEventListener(type, handler, options)
    })
  })

  afterEach(() => {
    addedPreloadErrorHandlers.forEach((h) => window.removeEventListener('vite:preloadError', h))
    addedHashHandlers.forEach((h) => window.removeEventListener('hashchange', h))
    addedVisibilityHandlers.forEach((h) => document.removeEventListener('visibilitychange', h))
    vi.restoreAllMocks()
  })

  test('un chunk con hash viejo (deploy) recarga la página', async () => {
    const reloadSpy = mockLocationReload()
    await loadMain()

    const event = new Event('vite:preloadError', { cancelable: true }) as Event & {
      payload?: Error
    }
    event.payload = new Error('Failed to fetch dynamically imported module')
    window.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true) // no debe escapar como rechazo sin manejar
    expect(reloadSpy).toHaveBeenCalledTimes(1)
  })

  test('si el error persiste tras recargar (misma sesión), NO cicla: deja fluir', async () => {
    const reloadSpy = mockLocationReload()
    await loadMain()

    const first = new Event('vite:preloadError', { cancelable: true })
    window.dispatchEvent(first)
    expect(reloadSpy).toHaveBeenCalledTimes(1)
    expect(first.defaultPrevented).toBe(true)

    // Misma sesión (sessionStorage no se limpia entre estos dos dispatches, a
    // diferencia de recargar de verdad): el guard ya está consumido.
    const second = new Event('vite:preloadError', { cancelable: true })
    window.dispatchEvent(second)
    expect(reloadSpy).toHaveBeenCalledTimes(1) // no una segunda vez
    expect(second.defaultPrevented).toBe(false) // deja fluir el error real
  })
})

describe('main: silencia el ruido de registro/actualización del SW (#761)', () => {
  beforeEach(() => {
    vi.resetModules()
    document.body.innerHTML = ''
    reportSilentWarningMock.mockClear()
    registerSWOptions = {}
    addedPreloadErrorHandlers = []
    addedHashHandlers = []
    addedVisibilityHandlers = []
    // `loadMain()` registra de paso los listeners de `vite:preloadError` /
    // `hashchange` / `visibilitychange` (otros tests de este fichero): los
    // capturamos para retirarlos y no acumular listeners reales entre tests.
    vi.spyOn(document, 'addEventListener').mockImplementation((type, handler, options) => {
      if (type === 'visibilitychange') addedVisibilityHandlers.push(handler as EventListener)
      originalDocAddEventListener(type, handler, options)
    })
    vi.spyOn(window, 'addEventListener').mockImplementation((type, handler, options) => {
      if (type === 'vite:preloadError') addedPreloadErrorHandlers.push(handler as EventListener)
      if (type === 'hashchange') addedHashHandlers.push(handler as EventListener)
      originalWinAddEventListener(type, handler, options)
    })
  })

  afterEach(() => {
    addedPreloadErrorHandlers.forEach((h) => window.removeEventListener('vite:preloadError', h))
    addedHashHandlers.forEach((h) => window.removeEventListener('hashchange', h))
    addedVisibilityHandlers.forEach((h) => document.removeEventListener('visibilitychange', h))
    vi.restoreAllMocks()
  })

  test('onRegisterError: warning silencioso, nunca lanza ni llega como excepción', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await loadMain()

    expect(() =>
      registerSWOptions.onRegisterError?.(new Error('Script sw.js load failed')),
    ).not.toThrow()

    expect(reportSilentWarningMock).toHaveBeenCalledWith(
      'sw_register_or_update_failed',
      expect.objectContaining({ error: 'Script sw.js load failed' }),
    )
    expect(warnSpy).toHaveBeenCalled()
  })

  test('registration.update() que rechaza no queda como rechazo sin manejar', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.useFakeTimers()
    await loadMain()

    const updateError = new Error(
      "Failed to update a ServiceWorker for scope ('/'): An unknown error occurred when fetching the script.",
    )
    const registration = {
      update: vi.fn().mockRejectedValue(updateError),
    } as unknown as ServiceWorkerRegistration
    registerSWOptions.onRegisteredSW?.('/sw.js', registration)

    // El sondeo (60 s) dispara `registration.update()`; con `.catch(reportSwNoise)`
    // el rechazo queda atrapado en vez de escapar como unhandledrejection.
    await vi.advanceTimersByTimeAsync(60_000)

    expect(registration.update).toHaveBeenCalledTimes(1)
    expect(reportSilentWarningMock).toHaveBeenCalledWith(
      'sw_register_or_update_failed',
      expect.objectContaining({ error: updateError.message }),
    )

    vi.useRealTimers()
  })
})
