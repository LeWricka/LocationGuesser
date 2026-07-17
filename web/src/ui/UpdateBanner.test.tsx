import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UpdateBanner } from './UpdateBanner'

describe('UpdateBanner', () => {
  test('anuncia la versión nueva sin robar el foco (role=status)', () => {
    render(<UpdateBanner onUpdate={() => {}} onDismiss={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('Hay una versión nueva')
  })

  test('el botón "Actualizar" dispara onUpdate', async () => {
    const onUpdate = vi.fn()
    render(<UpdateBanner onUpdate={onUpdate} onDismiss={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  // #810 (caso Nerea): el banner necesita un cierre — antes no había forma de
  // quitarlo de encima sin aplicar la actualización.
  test('el botón ✕ dispara onDismiss sin llamar a onUpdate', async () => {
    const onUpdate = vi.fn()
    const onDismiss = vi.fn()
    render(<UpdateBanner onUpdate={onUpdate} onDismiss={onDismiss} />)
    await userEvent.click(screen.getByRole('button', { name: 'Descartar aviso de actualización' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onUpdate).not.toHaveBeenCalled()
  })
})
