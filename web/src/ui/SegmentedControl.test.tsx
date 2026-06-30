import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SegmentedControl } from './SegmentedControl'

const options = [
  { value: '1h', label: '1h' },
  { value: '4h', label: '4h' },
  { value: 'hoy', label: 'Hoy' },
] as const

describe('SegmentedControl', () => {
  test('marca el seleccionado con aria-checked', () => {
    render(<SegmentedControl options={options} value="4h" onChange={() => {}} label="Plazo" />)
    expect(screen.getByRole('radio', { name: '4h' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '1h' })).not.toBeChecked()
  })

  test('llama a onChange al pulsar otra opción', async () => {
    const onChange = vi.fn()
    render(<SegmentedControl options={options} value="1h" onChange={onChange} label="Plazo" />)
    await userEvent.click(screen.getByRole('radio', { name: 'Hoy' }))
    expect(onChange).toHaveBeenCalledWith('hoy')
  })

  test('las flechas mueven la selección y envuelven', async () => {
    const onChange = vi.fn()
    render(<SegmentedControl options={options} value="hoy" onChange={onChange} label="Plazo" />)
    screen.getByRole('radio', { name: 'Hoy' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenCalledWith('1h')
  })
})
