import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UpdateBanner } from './UpdateBanner'

describe('UpdateBanner', () => {
  test('anuncia la versión nueva sin robar el foco (role=status)', () => {
    render(<UpdateBanner onUpdate={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('Hay una versión nueva')
  })

  test('el botón "Actualizar" dispara onUpdate', async () => {
    const onUpdate = vi.fn()
    render(<UpdateBanner onUpdate={onUpdate} />)
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })
})
