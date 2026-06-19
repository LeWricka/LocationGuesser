import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from './ToastProvider'
import { useToast } from './toast-context'

// Botón de prueba que dispara un toast con las opciones que le pasemos.
function Trigger({ message, duration }: { message: string; duration?: number }) {
  const toast = useToast()
  return (
    <button type="button" onClick={() => toast.show(message, { duration })}>
      mostrar
    </button>
  )
}

describe('Toast', () => {
  test('useToast fuera del provider lanza un error explicativo', () => {
    // Silenciamos el error que React imprime al romper el render.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Trigger message="x" />)).toThrow(/ToastProvider/)
    spy.mockRestore()
  })

  test('show pinta el aviso dentro de la región aria-live', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <Trigger message="Guardado" />
      </ToastProvider>,
    )
    expect(screen.queryByText('Guardado')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'mostrar' }))

    const region = screen.getByRole('region', { name: 'Avisos' })
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByText('Guardado')).toBeInTheDocument()
  })

  test('el botón de cerrar descarta el aviso', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <Trigger message="Bórrame" duration={0} />
      </ToastProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'mostrar' }))
    expect(screen.getByText('Bórrame')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cerrar aviso' }))
    expect(screen.queryByText('Bórrame')).not.toBeInTheDocument()
  })

  describe('auto-cierre con timers falsos', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    // Con timers falsos usamos fireEvent (síncrono) en vez de userEvent, que
    // espera delays reales y colgaría el test.
    test('el aviso desaparece solo al cumplirse la duración', () => {
      render(
        <ToastProvider>
          <Trigger message="Efímero" duration={3000} />
        </ToastProvider>,
      )
      fireEvent.click(screen.getByRole('button', { name: 'mostrar' }))
      expect(screen.getByText('Efímero')).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(3000)
      })
      expect(screen.queryByText('Efímero')).not.toBeInTheDocument()
    })

    test('duration=0 lo deja persistente (no se auto-cierra)', () => {
      render(
        <ToastProvider>
          <Trigger message="Persistente" duration={0} />
        </ToastProvider>,
      )
      fireEvent.click(screen.getByRole('button', { name: 'mostrar' }))
      act(() => {
        vi.advanceTimersByTime(60_000)
      })
      expect(screen.getByText('Persistente')).toBeInTheDocument()
    })
  })
})
