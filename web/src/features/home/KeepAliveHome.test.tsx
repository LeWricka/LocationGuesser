import { describe, test, expect } from 'vitest'
import { render } from '@testing-library/react'
import { KeepAliveHome } from './KeepAliveHome'

// Keep-alive de la home (issue #847, estrategia A): el subárbol sigue MONTADO en ambos
// estados (para que el globo no se destruya), pero cuando está oculto debe ser invisible
// para el foco, los lectores de pantalla y axe — y las View Transitions no deben
// capturarlo. Verificamos el contrato de a11y (inert + aria-hidden + display:none) y que
// los hijos permanecen montados siempre (la esencia del keep-alive).
describe('KeepAliveHome — ocultar sin desmontar (#847)', () => {
  test('OCULTA: subárbol montado pero inerte, aria-hidden y display:none (nada focusable)', () => {
    const { container, getByTestId } = render(
      <KeepAliveHome hidden>
        <button data-testid="child">Inicio</button>
      </KeepAliveHome>,
    )
    const wrapper = container.firstElementChild as HTMLElement
    // Fuera del árbol de accesibilidad y del orden de tabulación (foco/lectores/axe):
    expect(wrapper).toHaveAttribute('inert')
    expect(wrapper).toHaveAttribute('aria-hidden', 'true')
    expect(wrapper).toHaveAttribute('hidden')
    // Sin pintar (no lo captura ninguna View Transition):
    expect(wrapper.style.display).toBe('none')
    // Pero el subárbol SIGUE montado (keep-alive): el globo no se destruye.
    expect(getByTestId('child')).toBeInTheDocument()
  })

  test('VISIBLE: sin inert/aria-hidden/hidden y display:contents (no añade caja al layout)', () => {
    const { container, getByTestId } = render(
      <KeepAliveHome hidden={false}>
        <button data-testid="child">Inicio</button>
      </KeepAliveHome>,
    )
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper).not.toHaveAttribute('inert')
    expect(wrapper).not.toHaveAttribute('aria-hidden')
    expect(wrapper).not.toHaveAttribute('hidden')
    // `display: contents` → el wrapper no participa del layout (la <main> de la home se
    // comporta como hija directa, sin romper su 100dvh/position:fixed).
    expect(wrapper.style.display).toBe('contents')
    expect(getByTestId('child')).toBeInTheDocument()
  })
})
