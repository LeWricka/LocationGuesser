// Prueba el flujo de auto-apply del update de PWA (#555 → #633 → #647 → #819):
// el guard de ruta segura (`lib/safeUpdateRoute.ts`) debe cortar el auto-apply
// por `visibilitychange` cuando el usuario está en una ruta no segura, y solo
// aplicar tras el retardo de ausencia real en rutas seguras (#819 retiró el
// banner "Actualizar" y su gate por `hashchange`: sin banner, la actualización
// pendiente en una ruta no segura solo se aplica cuando el usuario navega a
// una segura Y oculta la pestaña, no antes). El resto del entrypoint (App, UI,
// analítica…) se mockea: no es lo que este test verifica.
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import type { ReactNode } from 'react'

vi.mock('./App.tsx', () => ({ default: () => null }))
vi.mock('./ui', () => ({
  ToastProvider: ({ children }: { children: ReactNode }) => children,
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
// `registerChunkReloadListeners` (#926) tiene su propia batería de tests en
// `lib/chunkReload.test.ts` (guard anti-bucle, detección de mensaje, las tres
// vías de entrada): aquí solo verificamos que `main.tsx` la LLAMA al arrancar.
const registerChunkReloadListenersMock = vi.fn()
vi.mock('./lib/chunkReload', () => ({
  registerChunkReloadListeners: registerChunkReloadListenersMock,
}))

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
// `main.tsx` y por tanto vuelve a registrar el listener de `visibilitychange`
// en el `document` REAL de jsdom (compartido entre tests del mismo fichero).
// Sin limpiarlo, se ACUMULA: un test posterior dispararía también los
// listeners de instancias de módulo de tests anteriores (con su propio
// `updateAvailable` cerrado sobre el mismo `updateSWMock` compartido),
// contando llamadas de más. Capturamos los handlers añadidos para poder
// retirarlos en `afterEach`. `addedHashHandlers` se mantiene por si acaso
// (main.tsx no registra hoy ningún `hashchange` — #819 retiró el que existía
// solo para el gate del banner — pero el spy no molesta si el array queda
// vacío). `vite:preloadError` ya no se registra aquí directamente (#926: pasó
// a `registerChunkReloadListeners`, mockeada arriba), así que no hace falta
// rastrearlo.
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
    reportSilentWarningMock.mockClear()
    registerSWOptions = {}
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
    // Sesión ya AVANZADA (fuera de la ventana de arranque del 19-jul, donde
    // aplicar al instante sí es lo correcto): los timers falsos también mueven
    // Date.now(), así que esto simula que la página lleva rato viva.
    vi.advanceTimersByTime(11_000)
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
    // Fuera de la ventana de arranque (ver test anterior).
    vi.advanceTimersByTime(11_000)
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

  // Ventana de ARRANQUE (19-jul): abrir la app con una versión nueva esperando
  // debe aplicarla YA (recarga única al abrir, sin scroll/estado que perder) —
  // sin esto el usuario iba siempre una versión por detrás (el retardo de 5 min
  // solo cubre sesiones vivas).
  test('arranque en ruta segura: una actualización detectada al abrir se aplica al instante', async () => {
    setHash('#g=abc123')
    await loadMain()
    onNeedRefresh() // el sondeo inicial la encuentra a los pocos segundos

    expect(updateSWMock).toHaveBeenCalledTimes(1)
  })

  test('arranque en ruta NO segura (jugar/crear): no se aplica al abrir', async () => {
    setHash('#nuevo')
    await loadMain()
    onNeedRefresh()

    expect(updateSWMock).not.toHaveBeenCalled()
  })

  test('arranque con un SW ya EN ESPERA de la sesión anterior: se aplica al registrar', async () => {
    setHash('#g=abc123')
    await loadMain()
    registerSWOptions.onRegisteredSW?.('sw.js', {
      waiting: {},
      update: () => Promise.resolve(),
    } as unknown as ServiceWorkerRegistration)

    expect(updateSWMock).toHaveBeenCalledTimes(1)
  })
})

describe('main: registra los listeners de recarga de chunk al arrancar (#926)', () => {
  beforeEach(() => {
    vi.resetModules()
    document.body.innerHTML = ''
    registerChunkReloadListenersMock.mockClear()
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
      if (type === 'hashchange') addedHashHandlers.push(handler as EventListener)
      originalWinAddEventListener(type, handler, options)
    })
  })

  afterEach(() => {
    addedHashHandlers.forEach((h) => window.removeEventListener('hashchange', h))
    addedVisibilityHandlers.forEach((h) => document.removeEventListener('visibilitychange', h))
    vi.restoreAllMocks()
  })

  // La lógica (guard anti-bucle, las tres vías de entrada) vive y se testea
  // en `lib/chunkReload.test.ts`; aquí solo comprobamos que el arranque la
  // engancha, sin duplicar esos casos.
  test('se registran una vez al arrancar', async () => {
    await loadMain()

    expect(registerChunkReloadListenersMock).toHaveBeenCalledTimes(1)
  })
})

describe('main: silencia el ruido de registro/actualización del SW (#761)', () => {
  beforeEach(() => {
    vi.resetModules()
    document.body.innerHTML = ''
    reportSilentWarningMock.mockClear()
    registerSWOptions = {}
    addedHashHandlers = []
    addedVisibilityHandlers = []
    // `loadMain()` registra de paso los listeners de `hashchange`/
    // `visibilitychange` (otros tests de este fichero): los capturamos para
    // retirarlos y no acumular listeners reales entre tests.
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
