import { describe, test, expect, vi, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { DelayedFallback } from './DelayedFallback'
import { SKELETON_DELAY_MS } from './useDelayedFlag'
import styles from './DelayedFallback.module.css'

// El hook `useDelayedFlag` (y la constante `SKELETON_DELAY_MS`) tienen sus
// propios tests en `useDelayedFlag.test.ts`; aquí solo se prueba el componente
// envoltorio (`DelayedFallback`) que lo consume.

afterEach(() => {
  vi.useRealTimers()
})

describe('DelayedFallback', () => {
  test('no pinta el hijo antes del umbral (250ms por defecto)', () => {
    vi.useFakeTimers()
    render(
      <DelayedFallback bg="scene">
        <div>Esqueleto</div>
      </DelayedFallback>,
    )
    expect(screen.queryByText('Esqueleto')).not.toBeInTheDocument()

    act(() => void vi.advanceTimersByTime(SKELETON_DELAY_MS - 1))
    expect(screen.queryByText('Esqueleto')).not.toBeInTheDocument()
  })

  test('pinta el hijo pasado el umbral', () => {
    vi.useFakeTimers()
    render(
      <DelayedFallback bg="scene">
        <div>Esqueleto</div>
      </DelayedFallback>,
    )

    act(() => void vi.advanceTimersByTime(SKELETON_DELAY_MS))
    expect(screen.getByText('Esqueleto')).toBeInTheDocument()
  })

  test('acepta un umbral propio (ms)', () => {
    vi.useFakeTimers()
    render(
      <DelayedFallback bg="scene" ms={500}>
        <div>Esqueleto</div>
      </DelayedFallback>,
    )

    act(() => void vi.advanceTimersByTime(250))
    expect(screen.queryByText('Esqueleto')).not.toBeInTheDocument()

    act(() => void vi.advanceTimersByTime(250))
    expect(screen.getByText('Esqueleto')).toBeInTheDocument()
  })

  test('el hueco pre-umbral nunca queda en blanco: lleva el fondo de la familia', () => {
    vi.useFakeTimers()
    const { container, rerender } = render(
      <DelayedFallback bg="scene">
        <div>Esqueleto</div>
      </DelayedFallback>,
    )
    const gapScene = container.firstElementChild as HTMLElement
    expect(gapScene.className).toContain(styles.gap as string)
    expect(gapScene.className).toContain(styles['bg-scene'] as string)
    expect(gapScene).toHaveAttribute('role', 'status')

    rerender(
      <DelayedFallback bg="paper">
        <div>Esqueleto</div>
      </DelayedFallback>,
    )
    const gapPaper = container.firstElementChild as HTMLElement
    expect(gapPaper.className).toContain(styles['bg-paper'] as string)
  })

  test('con fixed, el hueco cubre el viewport igual que la escena fija de la home', () => {
    vi.useFakeTimers()
    const { container } = render(
      <DelayedFallback bg="scene" fixed>
        <div>Esqueleto</div>
      </DelayedFallback>,
    )
    const gap = container.firstElementChild as HTMLElement
    expect(gap.className).toContain(styles.fixed as string)
  })

  test('sin parpadeo si el contenido real llega antes del umbral', () => {
    vi.useFakeTimers()

    // Espejo mínimo del patrón real (Suspense/`if(loading)`): mientras el dato
    // no ha resuelto se pinta el fallback envuelto; en cuanto resuelve (aquí a
    // los 50ms, muy por debajo del umbral de 250ms) se DESMONTA por completo y
    // se pinta el contenido real en su lugar.
    function Wrapper() {
      const [ready, setReady] = useState(false)
      useEffect(() => {
        const id = window.setTimeout(() => setReady(true), 50)
        return () => window.clearTimeout(id)
      }, [])
      if (ready) return <div>Contenido real</div>
      return (
        <DelayedFallback bg="scene">
          <div>Esqueleto</div>
        </DelayedFallback>
      )
    }

    render(<Wrapper />)
    act(() => void vi.advanceTimersByTime(50))
    expect(screen.getByText('Contenido real')).toBeInTheDocument()
    expect(screen.queryByText('Esqueleto')).not.toBeInTheDocument()

    // Aunque siga corriendo el reloj más allá del umbral, el esqueleto nunca
    // llega a pintarse: su temporizador se canceló al desmontar `DelayedFallback`.
    act(() => void vi.advanceTimersByTime(SKELETON_DELAY_MS + 100))
    expect(screen.queryByText('Esqueleto')).not.toBeInTheDocument()
    expect(screen.getByText('Contenido real')).toBeInTheDocument()
  })

  test('el contenido revelado usa el fundido que ya respeta prefers-reduced-motion (lg-content-in, index.css)', () => {
    vi.useFakeTimers()
    render(
      <DelayedFallback bg="scene">
        <div>Esqueleto</div>
      </DelayedFallback>,
    )
    act(() => void vi.advanceTimersByTime(SKELETON_DELAY_MS))
    expect(screen.getByText('Esqueleto').parentElement).toHaveClass('lg-content-in')
  })
})
