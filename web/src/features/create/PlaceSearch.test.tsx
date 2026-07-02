import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  test('pinta hasta 5 resultados (nombre + detalle) y elegir uno centra y cierra', async () => {
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
    // Al elegir, se limpia la búsqueda y se cierra la lista.
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    expect(screen.getByRole('combobox', { name: /busca un sitio/i })).toHaveValue('')
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
