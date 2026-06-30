import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UnitInput } from './UnitInput'

const units = [
  { value: 'eur', symbol: '€', label: 'euros' },
  { value: 'km', symbol: 'km', label: 'kilómetros' },
] as const

describe('UnitInput', () => {
  test('filtra caracteres no numéricos al teclear', async () => {
    const onValueChange = vi.fn()
    render(
      <UnitInput
        value=""
        onValueChange={onValueChange}
        units={units}
        unit="eur"
        onUnitChange={() => {}}
        label="Respuesta"
      />,
    )
    await userEvent.type(screen.getByLabelText('Respuesta'), 'a2')
    // 'a' se descarta; solo el dígito llega al onChange.
    expect(onValueChange).toHaveBeenLastCalledWith('2')
  })

  test('cambia la unidad por el selector', async () => {
    const onUnitChange = vi.fn()
    render(
      <UnitInput
        value="240"
        onValueChange={() => {}}
        units={units}
        unit="eur"
        onUnitChange={onUnitChange}
        label="Respuesta"
      />,
    )
    await userEvent.selectOptions(screen.getByLabelText('Unidad de Respuesta'), 'km')
    expect(onUnitChange).toHaveBeenCalledWith('km')
  })
})
