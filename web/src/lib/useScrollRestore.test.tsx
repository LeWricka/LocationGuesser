import { describe, test, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { useRef } from 'react'
import { useScrollRestore, __resetScrollRestoreForTests } from './useScrollRestore'

// Componente mínimo: un <div> con scroll propio + el hook enganchado a su ref,
// tal y como lo usa `TripPage` sobre el panel activo (`ref={panelRef}`).
function ScrollBox({ scrollKey }: { scrollKey: string | null }) {
  const ref = useRef<HTMLDivElement>(null)
  useScrollRestore(scrollKey, ref)
  return <div ref={ref} data-testid="box" style={{ overflow: 'auto' }} />
}

beforeEach(() => {
  __resetScrollRestoreForTests()
})

describe('useScrollRestore', () => {
  test('restaura el scrollTop guardado al remontar con la MISMA clave', () => {
    const first = render(<ScrollBox scrollKey="g1:diario" />)
    const el = first.getByTestId('box') as HTMLDivElement
    el.scrollTop = 240
    el.dispatchEvent(new Event('scroll'))
    first.unmount()

    // Remonte (p.ej. TripPage entero al volver de un reto): arranca YA en 240,
    // sin esperar a que el usuario vuelva a hacer scroll.
    const second = render(<ScrollBox scrollKey="g1:diario" />)
    const el2 = second.getByTestId('box') as HTMLDivElement
    expect(el2.scrollTop).toBe(240)
  })

  test('guarda la última posición al DESMONTAR aunque no llegara a disparar el evento scroll', () => {
    const first = render(<ScrollBox scrollKey="g1:fotos" />)
    const el = first.getByTestId('box') as HTMLDivElement
    // Mueve el scroll SIN disparar el evento 'scroll' (p.ej. el navegador aún
    // no lo emitió cuando el usuario navega): el cleanup del efecto debe
    // capturarlo igual al desmontar.
    el.scrollTop = 90
    first.unmount()

    const second = render(<ScrollBox scrollKey="g1:fotos" />)
    expect((second.getByTestId('box') as HTMLDivElement).scrollTop).toBe(90)
  })

  test('claves DISTINTAS (otra sección, u otro viaje) no comparten posición', () => {
    const diario = render(<ScrollBox scrollKey="g1:diario" />)
    ;(diario.getByTestId('box') as HTMLDivElement).scrollTop = 300
    diario.getByTestId('box').dispatchEvent(new Event('scroll'))
    diario.unmount()

    const marcador = render(<ScrollBox scrollKey="g1:marcador" />)
    expect((marcador.getByTestId('box') as HTMLDivElement).scrollTop).toBe(0)
    marcador.unmount()

    const otroViaje = render(<ScrollBox scrollKey="g2:diario" />)
    expect((otroViaje.getByTestId('box') as HTMLDivElement).scrollTop).toBe(0)
  })

  test('clave null: no restaura ni revienta (viaje aún sin cargar)', () => {
    const { getByTestId } = render(<ScrollBox scrollKey={null} />)
    expect((getByTestId('box') as HTMLDivElement).scrollTop).toBe(0)
  })
})
