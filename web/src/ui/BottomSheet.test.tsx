import { act } from 'react'
import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BottomSheet } from './BottomSheet'

// Simula el teclado del sistema: `window.visualViewport` con un alto menor que
// `window.innerHeight`. El hueco (innerHeight − vv.height − offsetTop) es lo que
// el teclado "se come" por abajo; con >120px el hook lo trata como teclado.
// Devuelve un limpiador que restaura el viewport original.
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

describe('BottomSheet', () => {
  test('no renderiza nada cuando está cerrada', () => {
    render(
      <BottomSheet open={false} onClose={() => {}} ariaLabel="Hoja">
        contenido
      </BottomSheet>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('renderiza el contenido y el título cuando está abierta', () => {
    render(
      <BottomSheet open onClose={() => {}} title="Ajustes">
        contenido
      </BottomSheet>,
    )
    expect(screen.getByRole('dialog', { name: 'Ajustes' })).toBeInTheDocument()
    expect(screen.getByText('contenido')).toBeInTheDocument()
  })

  test('cierra con Escape', async () => {
    const onClose = vi.fn()
    render(
      <BottomSheet open onClose={onClose} ariaLabel="Hoja">
        contenido
      </BottomSheet>,
    )
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  test('el asa cierra al pulsar', async () => {
    const onClose = vi.fn()
    render(
      <BottomSheet open onClose={onClose} ariaLabel="Hoja">
        contenido
      </BottomSheet>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar hoja' }))
    expect(onClose).toHaveBeenCalled()
  })

  // --- A prueba de teclado (harness del bug del CTA tapado) ---
  //
  // Qué cubre: la LÓGICA de ajuste al viewport visible. Con el teclado abierto,
  // la hoja debe (1) acotar su alto máximo al alto visible (≤ viewport, no se
  // extiende por debajo del teclado) y (2) subir `offsetBottom` px para que su
  // borde inferior —con el footer/CTA— caiga sobre el teclado, no tapado.
  // Qué NO cubre: el teclado real del sistema y su geometría exacta (solo se
  // valida en dispositivo); jsdom no dispone layout ni un teclado de verdad, así
  // que mockeamos `visualViewport`.
  describe('a prueba de teclado (visualViewport)', () => {
    test('con el teclado abierto acota el alto al viewport visible y sube el pie', () => {
      const kb = mockKeyboard({ innerHeight: 800, visibleHeight: 480 })
      render(
        <BottomSheet open onClose={() => {}} ariaLabel="Hoja" footer={<button>Borrar</button>}>
          contenido
        </BottomSheet>,
      )
      kb.fireResize()
      const panel = screen.getByRole('dialog')
      // Alto acotado al alto visible: la hoja no se extiende por debajo del teclado.
      expect(panel.style.maxHeight).toBe('480px')
      // Desplazada por encima del teclado: su borde inferior queda sobre él.
      expect(panel.style.marginBottom).toBe(`${kb.offsetBottom}px`)
      // El pie con el CTA sigue montado dentro de la hoja acotada.
      expect(screen.getByRole('button', { name: 'Borrar' })).toBeInTheDocument()
      kb.restore()
    })

    test('sin teclado no fija alto ni margen (manda el CSS)', () => {
      // innerHeight === visibleHeight → offsetBottom 0 → keyboardOpen false.
      const kb = mockKeyboard({ innerHeight: 800, visibleHeight: 800 })
      render(
        <BottomSheet open onClose={() => {}} ariaLabel="Hoja">
          contenido
        </BottomSheet>,
      )
      kb.fireResize()
      const panel = screen.getByRole('dialog')
      expect(panel.style.maxHeight).toBe('')
      expect(panel.style.marginBottom).toBe('')
      kb.restore()
    })
  })
})
