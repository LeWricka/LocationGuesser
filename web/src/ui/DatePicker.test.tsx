import { useState } from 'react'
import { describe, test, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DatePicker } from './DatePicker'

// Arnés controlado: el DatePicker es controlado (value + onChange), así que un
// wrapper con estado reproduce el uso real y deja observar lo que emite.
function Harness({
  initial = null,
  min,
  max,
  onChange,
}: {
  initial?: string | null
  min?: string
  max?: string
  onChange?: (v: string | null) => void
}) {
  const [value, setValue] = useState<string | null>(initial)
  return (
    <DatePicker
      value={value}
      min={min}
      max={max}
      aria-label="Fecha"
      onChange={(v) => {
        setValue(v)
        onChange?.(v)
      }}
    />
  )
}

describe('DatePicker', () => {
  test('el disparador muestra el placeholder cuando no hay fecha', () => {
    render(
      <DatePicker value={null} onChange={vi.fn()} aria-label="Fecha" placeholder="Elige día" />,
    )
    const trigger = screen.getByRole('button', { name: 'Fecha' })
    expect(trigger).toHaveTextContent('Elige día')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  test('muestra la fecha elegida en formato humano', () => {
    render(<DatePicker value="2026-03-15" onChange={vi.fn()} aria-label="Fecha" />)
    expect(screen.getByRole('button', { name: 'Fecha' })).toHaveTextContent('15 de marzo de 2026')
  })

  test('abrir → seleccionar un día emite YYYY-MM-DD y cierra', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness initial="2026-03-10" onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Fecha' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // Elige el día 20 de marzo (el mes visible arranca en la selección).
    await user.click(screen.getByRole('gridcell', { name: '20 de marzo de 2026' }))
    expect(onChange).toHaveBeenCalledWith('2026-03-20')
    // El popover se cierra al elegir.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('navegar de mes hacia adelante y atrás', async () => {
    const user = userEvent.setup()
    render(<Harness initial="2026-03-10" />)
    await user.click(screen.getByRole('button', { name: 'Fecha' }))

    // El rótulo del mes es aria-live; hay otro texto igual (título sr-only de la
    // rejilla), así que apuntamos al rótulo visible por su status live.
    const label = () => screen.getByText((_c, el) => el?.getAttribute('aria-live') === 'polite')
    expect(label()).toHaveTextContent('marzo 2026')
    await user.click(screen.getByRole('button', { name: 'Mes siguiente' }))
    expect(label()).toHaveTextContent('abril 2026')
    await user.click(screen.getByRole('button', { name: 'Mes anterior' }))
    await user.click(screen.getByRole('button', { name: 'Mes anterior' }))
    expect(label()).toHaveTextContent('febrero 2026')
  })

  test('vaciar la fecha emite null (aspa del disparador)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness initial="2026-03-10" onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Quitar la fecha' }))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  test('el botón Borrar del calendario emite null', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness initial="2026-03-10" onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Fecha' }))
    await user.click(screen.getByRole('button', { name: 'Borrar' }))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  test('respeta min/max deshabilitando días fuera de rango', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness initial="2026-03-10" min="2026-03-05" max="2026-03-15" onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Fecha' }))

    // Un día antes del mínimo está deshabilitado y no emite.
    const before = screen.getByRole('gridcell', { name: '3 de marzo de 2026' })
    expect(before).toBeDisabled()
    await user.click(before)
    expect(onChange).not.toHaveBeenCalled()

    // Un día dentro del rango sí emite.
    await user.click(screen.getByRole('gridcell', { name: '12 de marzo de 2026' }))
    expect(onChange).toHaveBeenCalledWith('2026-03-12')
  })

  test('teclado: flechas mueven el foco y Enter elige', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness initial="2026-03-10" onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Fecha' }))

    // El día seleccionado arranca con el foco (roving tabindex).
    const selected = screen.getByRole('gridcell', { name: '10 de marzo de 2026' })
    expect(selected).toHaveFocus()

    await user.keyboard('{ArrowRight}') // → 11
    await user.keyboard('{ArrowDown}') // → 18 (una semana)
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith('2026-03-18')
  })

  test('Escape cierra el calendario y devuelve el foco al disparador', async () => {
    const user = userEvent.setup()
    render(<Harness initial="2026-03-10" />)
    const trigger = screen.getByRole('button', { name: 'Fecha' })
    await user.click(trigger)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  test('aria del disparador: haspopup dialog y aria-invalid al ser inválido', () => {
    render(<DatePicker value={null} onChange={vi.fn()} aria-label="Fecha" invalid />)
    const trigger = screen.getByRole('button', { name: 'Fecha' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    expect(trigger).toHaveAttribute('aria-invalid', 'true')
  })

  test('el día de hoy lleva aria-current="date"', async () => {
    const user = userEvent.setup()
    const today = new Date()
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
      today.getDate(),
    ).padStart(2, '0')}`
    render(<Harness initial={iso} />)
    await user.click(screen.getByRole('button', { name: 'Fecha' }))
    const grid = screen.getByRole('grid')
    const current = within(grid).getByRole('gridcell', { current: 'date' })
    expect(current).toHaveTextContent(String(today.getDate()))
  })
})
