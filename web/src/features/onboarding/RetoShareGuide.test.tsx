import { useRef, type RefObject } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RetoShareGuide } from './RetoShareGuide'

// jsdom no implementa scrollIntoView; RetoShareGuide lo usa para llevar a la
// vista el objetivo del coach-mark activo (la tarjeta de puntos / el mapa).
Element.prototype.scrollIntoView = vi.fn()

// Arnés con dos objetivos reales (como el reveal tendría la tarjeta de puntos y
// el mapa con los pines de todos): cada coach-mark ancla a uno de ellos.
function Harness({
  onCreateAccount = vi.fn(),
  onFinish = vi.fn(),
  initialPhase,
}: {
  onCreateAccount?: () => void
  onFinish?: () => void
  initialPhase?: 'result' | 'others' | 'cards'
}) {
  const resultRef = useRef<HTMLDivElement>(null)
  const othersRef = useRef<HTMLDivElement>(null)
  return (
    <>
      <div ref={resultRef}>tarjeta de resultado</div>
      <div ref={othersRef}>mapa de los demás</div>
      <RetoShareGuide
        ownerName="Lucía"
        resultRef={resultRef as RefObject<HTMLElement | null>}
        othersRef={othersRef as RefObject<HTMLElement | null>}
        onCreateAccount={onCreateAccount}
        onFinish={onFinish}
        initialPhase={initialPhase}
      />
    </>
  )
}

describe('RetoShareGuide', () => {
  test('arranca señalando el resultado (no tapa el reveal: es un coach-mark)', () => {
    render(<Harness />)
    expect(screen.getByText('Esto es tu resultado')).toBeInTheDocument()
    // El reveal sigue en el DOM debajo (no hay overlay opaco que lo sustituya).
    expect(screen.getByText('tarjeta de resultado')).toBeInTheDocument()
  })

  test('"Siguiente" pasa del resultado al mapa de los demás y luego a las tarjetas', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(screen.getByText('Esto marcaron los demás')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    // Entra a las tarjetas por el principio (la sección de retos / el Marcador).
    expect(screen.getByText('Aquí se sigue la partida')).toBeInTheDocument()
  })

  test('"Saltar" en un coach-mark entra a las tarjetas directo por el registro', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Saltar' }))
    expect(screen.getByText('No pierdas tus retos')).toBeInTheDocument()
  })

  test('al terminar (registro → "Ahora no") llama a onFinish para aterrizar en el Marcador', () => {
    const onFinish = vi.fn()
    render(<Harness onFinish={onFinish} initialPhase="cards" />)
    // Salta las tarjetas hasta el registro y cierra con "Ahora no".
    fireEvent.click(screen.getByRole('button', { name: 'Saltar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  test('"Crear cuenta" en el registro llama a onCreateAccount', () => {
    const onCreateAccount = vi.fn()
    render(<Harness onCreateAccount={onCreateAccount} initialPhase="cards" />)
    fireEvent.click(screen.getByRole('button', { name: 'Saltar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    expect(onCreateAccount).toHaveBeenCalledTimes(1)
  })
})
