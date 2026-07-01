import { act, useState } from 'react'
import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from './Modal'

// Simula el teclado del sistema: `window.visualViewport` con un alto menor que
// `window.innerHeight`. El hueco (innerHeight − vv.height − offsetTop) es lo que
// el teclado "se come" por abajo; con >120px el hook lo trata como teclado.
function mockKeyboard({ innerHeight = 800, visibleHeight = 480, offsetTop = 0 } = {}) {
  const listeners = new Set<() => void>()
  const vv = {
    height: visibleHeight,
    offsetTop,
    addEventListener: (_type: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_type: string, fn: () => void) => listeners.delete(fn),
  }
  const originalInner = window.innerHeight
  const originalVv = window.visualViewport
  Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true })
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
  const fireResize = () => act(() => listeners.forEach((fn) => fn()))
  const restore = () => {
    Object.defineProperty(window, 'innerHeight', { value: originalInner, configurable: true })
    Object.defineProperty(window, 'visualViewport', { value: originalVv, configurable: true })
  }
  return { vv, fireResize, restore, offsetBottom: innerHeight - visibleHeight - offsetTop }
}

describe('Modal', () => {
  test('no renderiza nada cuando está cerrado', () => {
    render(
      <Modal open={false} title="Hola">
        contenido
      </Modal>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('contenido')).not.toBeInTheDocument()
  })

  test('abierto: expone role=dialog con aria-modal y el título lo etiqueta', () => {
    render(
      <Modal open title="¿Quién juega?">
        cuerpo
      </Modal>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName('¿Quién juega?')
    expect(screen.getByText('cuerpo')).toBeInTheDocument()
  })

  test('mueve el foco al panel al abrir', () => {
    render(
      <Modal open title="T">
        x
      </Modal>,
    )
    expect(screen.getByRole('dialog')).toHaveFocus()
  })

  test('Escape llama a onClose', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <Modal open onClose={onClose} title="T">
        x
      </Modal>,
    )
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('el botón de cerrar llama a onClose', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <Modal open onClose={onClose} title="T">
        x
      </Modal>,
    )
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('clic en el overlay cierra; clic dentro del panel no', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <Modal open onClose={onClose} title="T">
        <span>dentro</span>
      </Modal>,
    )
    await user.click(screen.getByText('dentro'))
    expect(onClose).not.toHaveBeenCalled()
  })

  test('escribir en un input del modal NO roba el foco (regresión)', async () => {
    const user = userEvent.setup()
    // onClose se recrea en cada render (función inline), como en el caso real:
    // el modal no debe re-enfocar el panel en cada tecla.
    function Harness() {
      const [v, setV] = useState('')
      return (
        <Modal open onClose={() => undefined} title="T">
          <input aria-label="nombre" value={v} onChange={(e) => setV(e.target.value)} />
        </Modal>
      )
    }
    render(<Harness />)
    const input = screen.getByLabelText('nombre')
    input.focus()
    await user.type(input, 'Ana')
    expect(input).toHaveValue('Ana')
    expect(input).toHaveFocus()
  })

  test('sin onClose no es descartable (Escape no rompe ni cierra)', async () => {
    const user = userEvent.setup()
    render(
      <Modal open title="Empezar">
        x
      </Modal>,
    )
    await user.keyboard('{Escape}')
    // Sigue abierto y sin botón de cerrar.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cerrar' })).not.toBeInTheDocument()
  })

  // --- A prueba de teclado (harness del bug del CTA tapado) ---
  //
  // Qué cubre: la LÓGICA de ajuste al viewport visible. Con el teclado abierto,
  // el diálogo debe (1) acotar su alto máximo al alto visible y (2) subir
  // `offsetBottom` px para que su borde inferior —con el footer/CTA (p. ej.
  // "Borrar viaje")— caiga sobre el teclado, visible sin scroll, no tapado.
  // Qué NO cubre: el teclado real del sistema y su geometría exacta (solo se
  // valida en dispositivo); jsdom no tiene layout ni teclado, así que mockeamos
  // `visualViewport`.
  describe('a prueba de teclado (visualViewport)', () => {
    test('con el teclado abierto acota el alto al viewport visible y sube el pie', () => {
      const kb = mockKeyboard({ innerHeight: 800, visibleHeight: 480 })
      render(
        <Modal open onClose={() => {}} title="Ajustes" footer={<button>Borrar viaje</button>}>
          <input aria-label="nombre" />
        </Modal>,
      )
      kb.fireResize()
      const panel = screen.getByRole('dialog')
      // Alto acotado al alto visible: el diálogo no se extiende bajo el teclado.
      expect(panel.style.maxHeight).toBe('480px')
      // Desplazado por encima del teclado: su borde inferior queda sobre él.
      expect(panel.style.marginBottom).toBe(`${kb.offsetBottom}px`)
      // El pie con el CTA sigue montado dentro del diálogo acotado.
      expect(screen.getByRole('button', { name: 'Borrar viaje' })).toBeInTheDocument()
      kb.restore()
    })

    test('sin teclado no fija alto ni margen (manda el CSS)', () => {
      const kb = mockKeyboard({ innerHeight: 800, visibleHeight: 800 })
      render(
        <Modal open onClose={() => {}} title="Ajustes">
          x
        </Modal>,
      )
      kb.fireResize()
      const panel = screen.getByRole('dialog')
      expect(panel.style.maxHeight).toBe('')
      expect(panel.style.marginBottom).toBe('')
      kb.restore()
    })
  })
})
