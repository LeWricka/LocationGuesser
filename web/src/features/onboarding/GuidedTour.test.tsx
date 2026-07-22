import { useRef, type RefObject } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GuidedTour, type TourStep } from './GuidedTour'
import coachStyles from './CoachMark.module.css'

// jsdom no implementa scrollIntoView; GuidedTour lo usa para llevar el
// objetivo de cada paso a pantalla si vive dentro de algo que scrollea.
Element.prototype.scrollIntoView = vi.fn()

// Arnés con dos objetivos reales (como el viaje de ejemplo tendría el globo y
// una tarjeta de momento): cada paso ancla a uno de los dos, y `onBeforeShow`
// simula el cambio de pestaña que en TripPage haría `setSection`.
function Harness({
  onFinish,
  onSkip,
  onNavigate,
}: {
  onFinish: () => void
  onSkip: () => void
  onNavigate: (view: string) => void
}) {
  const diarioRef = useRef<HTMLDivElement>(null)
  const marcadorRef = useRef<HTMLDivElement>(null)

  const steps: TourStep[] = [
    {
      targetRef: diarioRef as RefObject<HTMLElement | null>,
      step: 'El Diario',
      title: 'Cada parada, en su sitio',
      body: 'Cada parada del viaje queda aquí, en el Diario.',
      ariaLabel: 'Cada parada, en su sitio',
      onBeforeShow: () => onNavigate('diario'),
    },
    {
      targetRef: marcadorRef as RefObject<HTMLElement | null>,
      step: 'El Marcador',
      title: 'Aquí se juega',
      body: 'Los retos del viaje: aquí se juega.',
      ariaLabel: 'Aquí se juega',
      onBeforeShow: () => onNavigate('marcador'),
    },
  ]

  return (
    <div>
      <div ref={diarioRef}>Globo del diario</div>
      <div ref={marcadorRef}>Camino de retos</div>
      <GuidedTour
        steps={steps}
        closingTitle="Ya conoces el viaje"
        closingBody="Así se ve un viaje completo en Momentu."
        onFinish={onFinish}
        onSkip={onSkip}
      />
    </div>
  )
}

describe('GuidedTour', () => {
  test('arranca en el primer paso y conduce la navegación (onBeforeShow)', () => {
    const onNavigate = vi.fn()
    render(<Harness onFinish={vi.fn()} onSkip={vi.fn()} onNavigate={onNavigate} />)
    expect(screen.getByText('Cada parada, en su sitio')).toBeInTheDocument()
    expect(onNavigate).toHaveBeenCalledWith('diario')
  })

  test('"Siguiente" avanza al paso 2 y conduce a su vista', () => {
    const onNavigate = vi.fn()
    render(<Harness onFinish={vi.fn()} onSkip={vi.fn()} onNavigate={onNavigate} />)
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(screen.getByText('Aquí se juega')).toBeInTheDocument()
    expect(onNavigate).toHaveBeenCalledWith('marcador')
  })

  test('tras el último paso, "Ver cierre" pinta la pantalla de cierre', () => {
    render(<Harness onFinish={vi.fn()} onSkip={vi.fn()} onNavigate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ver cierre' }))
    expect(screen.getByText('Ya conoces el viaje')).toBeInTheDocument()
  })

  test('el CTA del cierre llama a onFinish', () => {
    const onFinish = vi.fn()
    render(<Harness onFinish={onFinish} onSkip={vi.fn()} onNavigate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ver cierre' }))
    fireEvent.click(screen.getByRole('button', { name: 'Terminar' }))
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  test('"Saltar" en cualquier paso sale de la guía (onSkip)', () => {
    const onSkip = vi.fn()
    render(<Harness onFinish={vi.fn()} onSkip={onSkip} onNavigate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Saltar' }))
    expect(onSkip).toHaveBeenCalledTimes(1)
  })
})

// Sin pantalla de cierre + paso bloqueante (issue #891): el tour del reto
// compartido no tiene cierre genérico (remata con un registro que monta el
// padre) y su primer paso ancla al mapa/globo vivo, así que va `blocking`.
describe('GuidedTour — sin cierre y con pasos bloqueantes (#891)', () => {
  function HarnessNoClosing({ onFinish, onSkip }: { onFinish: () => void; onSkip: () => void }) {
    const diarioRef = useRef<HTMLDivElement>(null)
    const marcadorRef = useRef<HTMLDivElement>(null)
    const steps: TourStep[] = [
      {
        targetRef: diarioRef as RefObject<HTMLElement | null>,
        step: 'El Diario',
        title: 'El viaje entero',
        body: 'Cada parada queda aquí.',
        ariaLabel: 'El viaje entero',
        blocking: true,
      },
      {
        targetRef: marcadorRef as RefObject<HTMLElement | null>,
        step: 'El Marcador',
        title: 'Aquí se juega',
        body: 'Quién va ganando.',
        ariaLabel: 'Aquí se juega',
      },
    ]
    return (
      <div>
        <div ref={diarioRef}>Globo del diario</div>
        <div ref={marcadorRef}>Camino de retos</div>
        <GuidedTour steps={steps} lastStepLabel="Listo" onFinish={onFinish} onSkip={onSkip} />
      </div>
    )
  }

  test('el primer paso (mapa) se pinta como bloqueante', () => {
    const { container } = render(<HarnessNoClosing onFinish={vi.fn()} onSkip={vi.fn()} />)
    const layerClass = coachStyles.layerBlocking as string
    expect(container.getElementsByClassName(layerClass).length).toBe(1)
  })

  test('sin cierre: el último paso remata con onFinish (no hay pantalla de cierre)', () => {
    const onFinish = vi.fn()
    render(<HarnessNoClosing onFinish={onFinish} onSkip={vi.fn()} />)
    // Avanza al último paso.
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    // En el último paso el CTA es el `lastStepLabel` (no "Ver cierre") y remata ya.
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }))
    expect(onFinish).toHaveBeenCalledTimes(1)
    // No hay pantalla de cierre genérica.
    expect(screen.queryByText('Ya conoces el viaje')).not.toBeInTheDocument()
  })
})
