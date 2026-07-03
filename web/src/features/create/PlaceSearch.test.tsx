import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import fs from 'node:fs'
import path from 'node:path'
import type { PlaceResult } from '../../lib/geocode'

const searchPlacesMock = vi.fn<(query: string) => Promise<PlaceResult[]>>()
vi.mock('../../lib/geocode', () => ({
  searchPlaces: (query: string) => searchPlacesMock(query),
}))

import { PlaceSearch } from './PlaceSearch'

function renderSearch(onSelect = vi.fn()) {
  render(<PlaceSearch onSelect={onSelect} />)
  return onSelect
}

describe('PlaceSearch', () => {
  beforeEach(() => {
    searchPlacesMock.mockReset()
    searchPlacesMock.mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('pinta el campo con su label y placeholder', () => {
    renderSearch()
    expect(screen.getByRole('combobox', { name: /busca un sitio/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Busca un sitio…')).toBeInTheDocument()
  })

  test('no busca con 1 sola letra (umbral mínimo)', async () => {
    const user = userEvent.setup()
    renderSearch()

    await user.type(screen.getByRole('combobox', { name: /busca un sitio/i }), 'a')
    await new Promise((r) => setTimeout(r, 500))

    expect(searchPlacesMock).not.toHaveBeenCalled()
  })

  test('debounce: espera a que el usuario pare de teclear antes de buscar', async () => {
    // `fireEvent.change` (no `userEvent.type`) porque user-event usa sus propios
    // timers internos, que chocan con los fake timers de este test.
    vi.useFakeTimers()
    renderSearch()

    const input = screen.getByRole('combobox', { name: /busca un sitio/i })
    fireEvent.change(input, { target: { value: 'Bo' } })
    fireEvent.change(input, { target: { value: 'Bog' } })

    // Antes de que pase el debounce completo, no debería haber llamado aún.
    await act(() => vi.advanceTimersByTimeAsync(200))
    expect(searchPlacesMock).not.toHaveBeenCalled()

    await act(() => vi.advanceTimersByTimeAsync(300))
    expect(searchPlacesMock).toHaveBeenCalledTimes(1)
    expect(searchPlacesMock).toHaveBeenCalledWith('Bog')
  })

  test('pinta hasta 5 resultados (nombre + detalle) y elegir uno centra, cierra la lista y CONSERVA el nombre en el campo', async () => {
    searchPlacesMock.mockResolvedValue([
      { lat: 4.71, lng: -74.07, name: 'Bogotá', detail: 'Colombia' },
      { lat: 41.9, lng: 12.49, name: 'Roma', detail: 'Italia' },
    ])
    const user = userEvent.setup()
    const onSelect = renderSearch()

    await user.type(screen.getByRole('combobox', { name: /busca un sitio/i }), 'Bo')

    const bogota = await screen.findByRole('option', { name: /bogotá/i })
    expect(screen.getByText('Colombia')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /roma/i })).toBeInTheDocument()

    await user.click(bogota)

    expect(onSelect).toHaveBeenCalledWith({ lat: 4.71, lng: -74.07 })
    // Al elegir, se cierra la lista pero el campo CONSERVA el nombre del sitio
    // elegido (issue #592 punto 2 — antes se vaciaba).
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    expect(screen.getByRole('combobox', { name: /busca un sitio/i })).toHaveValue('Bogotá')
  })

  test('tras elegir, el campo NO reabre la lista sola; editar sí vuelve a buscar', async () => {
    searchPlacesMock.mockResolvedValue([
      { lat: 4.71, lng: -74.07, name: 'Bogotá', detail: 'Colombia' },
    ])
    const user = userEvent.setup()
    renderSearch()

    await user.type(screen.getByRole('combobox', { name: /busca un sitio/i }), 'Bo')
    const bogota = await screen.findByRole('option', { name: /bogotá/i })
    await user.click(bogota)

    // El texto elegido ('Bogotá', 7 caracteres) supera el umbral mínimo, pero
    // NO debe reabrir la lista ni relanzar la búsqueda por sí solo.
    expect(searchPlacesMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    // Editar el campo SÍ es una búsqueda nueva del usuario: reabre la lista.
    searchPlacesMock.mockResolvedValue([{ lat: 1, lng: 2, name: 'Bogotá Norte', detail: '' }])
    await user.type(screen.getByRole('combobox', { name: /busca un sitio/i }), ' Norte')

    expect(await screen.findByRole('option', { name: /bogotá norte/i })).toBeInTheDocument()
    expect(searchPlacesMock).toHaveBeenCalledTimes(2)
  })

  test('muestra "Sin resultados" cuando la búsqueda no encuentra nada', async () => {
    searchPlacesMock.mockResolvedValue([])
    const user = userEvent.setup()
    renderSearch()

    await user.type(screen.getByRole('combobox', { name: /busca un sitio/i }), 'xyzxyz')

    expect(await screen.findByText('Sin resultados')).toBeInTheDocument()
  })

  test('ignora una respuesta que llega tarde de una búsqueda anterior', async () => {
    let resolveFirst!: (v: PlaceResult[]) => void
    const first = new Promise<PlaceResult[]>((resolve) => {
      resolveFirst = resolve
    })
    searchPlacesMock.mockImplementationOnce(() => first)
    searchPlacesMock.mockImplementationOnce(() =>
      Promise.resolve([{ lat: 1, lng: 2, name: 'Segundo', detail: '' }]),
    )

    vi.useFakeTimers()
    renderSearch()

    const input = screen.getByRole('combobox', { name: /busca un sitio/i })
    fireEvent.change(input, { target: { value: 'Pri' } })
    await act(() => vi.advanceTimersByTimeAsync(400))
    fireEvent.change(input, { target: { value: 'Seg' } })
    await act(() => vi.advanceTimersByTimeAsync(400))

    // La 2ª búsqueda ya resolvió (mock síncrono); ahora resolvemos la 1ª, tarde.
    resolveFirst([{ lat: 9, lng: 9, name: 'Primero', detail: '' }])
    await act(() => vi.runAllTimersAsync())

    expect(screen.queryByRole('option', { name: /primero/i })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: /segundo/i })).toBeInTheDocument()
  })
})

// --- Regresión #574: la lista de resultados quedaba pintada DEBAJO del mapa ---
//
// Causa raíz REAL: `.lg-map` (index.css) aísla la escalada interna de z-index de
// Leaflet (`isolation: isolate`, paneles/controles hasta ~1000) para que no se
// coma a hermanos con z-index EXPLÍCITO (p.ej. `.controls` de MapPicker, z:100).
// Pero esa unidad aislada sigue participando ELLA MISMA al nivel "auto" (0) del
// stacking context de `MapPicker` — y en un empate a nivel 0 gana el que va
// DESPUÉS en el DOM: `.canvas` (con el mapa dentro) va detrás de este buscador
// en el árbol, así que sin z-index propio `.results` perdía el empate y quedaba
// pintada debajo del mapa aunque visualmente se superponga.
//
// jsdom no calcula stacking/pintado real (la reproducción visual se hizo aparte
// con la galería + Playwright, ver PR), así que este test monta la hoja de
// estilos REAL de `PlaceSearch.module.css` en jsdom (cuyo motor de selectores sí
// resuelve la cascada) y comprueba, vía `getComputedStyle`, que `.results` fija
// un `z-index` explícito (no `auto`) al piso `--z-sheet` — el mismo patrón que
// ya usa `Toast.test.tsx` para su regresión #552.
describe('PlaceSearch — la lista de resultados no queda debajo del mapa (#574)', () => {
  function loadRealStylesheet(): void {
    const css = fs.readFileSync(path.resolve(__dirname, './PlaceSearch.module.css'), 'utf8')
    const style = document.createElement('style')
    // Variables mínimas que usan las declaraciones bajo prueba (el resto de
    // tokens no afecta a la propiedad que comprobamos).
    style.textContent = `:root { --z-sheet: 500; } ${css}`
    document.head.appendChild(style)
  }

  test('.results fija un z-index explícito (no "auto") al piso --z-sheet', () => {
    loadRealStylesheet()
    const results = document.createElement('ul')
    results.className = 'results'
    document.body.appendChild(results)

    const cs = getComputedStyle(results)
    // jsdom no resuelve `var()` en propiedades enteras como `z-index` (a
    // diferencia de otras, como `max-width`, que sí lo hace parcialmente);
    // el valor computado se queda como el propio `var(...)` sin evaluar. Basta
    // para la regresión: si se quita el `z-index` de `.results`, cae a `auto`.
    expect(cs.zIndex).not.toBe('auto')
    expect(cs.zIndex).toBe('var(--z-sheet)')
  })
})
