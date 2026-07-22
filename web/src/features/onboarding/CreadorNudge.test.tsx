import { Share2 } from 'lucide-react'
import { describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CreadorNudge } from './CreadorNudge'

describe('CreadorNudge', () => {
  test('pinta el mensaje', () => {
    render(
      <CreadorNudge icon={Share2} onDismiss={vi.fn()}>
        Pásale el enlace a tu gente. Entran sin instalar nada.
      </CreadorNudge>,
    )
    expect(
      screen.getByText('Pásale el enlace a tu gente. Entran sin instalar nada.'),
    ).toBeInTheDocument()
  })

  test('cerrar llama a onDismiss', () => {
    const onDismiss = vi.fn()
    render(
      <CreadorNudge icon={Share2} onDismiss={onDismiss}>
        Aviso
      </CreadorNudge>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
