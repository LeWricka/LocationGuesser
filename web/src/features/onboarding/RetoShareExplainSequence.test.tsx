import { describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RetoShareExplainSequence } from './RetoShareExplainSequence'

describe('RetoShareExplainSequence', () => {
  test('arranca en la sección de retos (el Marcador): clasificación, retos pasados y premios', () => {
    render(
      <RetoShareExplainSequence ownerName="Lucía" onCreateAccount={vi.fn()} onDismiss={vi.fn()} />,
    )
    expect(screen.getByText('El Marcador')).toBeInTheDocument()
    expect(screen.getByText('Aquí se sigue la partida')).toBeInTheDocument()
    expect(screen.getByText('La clasificación')).toBeInTheDocument()
    expect(screen.getByText('Los retos pasados')).toBeInTheDocument()
    expect(screen.getByText('Los premios')).toBeInTheDocument()
  })

  test('"Seguir" avanza retos → puente (Diario/Bitácora) → qué es Momentu', () => {
    render(
      <RetoShareExplainSequence ownerName="Lucía" onCreateAccount={vi.fn()} onDismiss={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Seguir/ }))
    expect(screen.getByText('De un reto a un viaje')).toBeInTheDocument()
    expect(screen.getByText('El Diario')).toBeInTheDocument()
    expect(screen.getByText('La Bitácora')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Este reto es parte del viaje de Lucía. Míralo entero: cada parada en el Diario, y todo reunido en la Bitácora.',
      ),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Seguir/ }))
    expect(screen.getByText('Esto es Momentu')).toBeInTheDocument()
    expect(screen.getByText('El diario de un viaje compartido')).toBeInTheDocument()
    expect(screen.getByText(/^Lucía guarda cada parada de este viaje/)).toBeInTheDocument()
  })

  test('sin dueño resuelto, cae al copy genérico (nunca "de undefined")', () => {
    render(<RetoShareExplainSequence onCreateAccount={vi.fn()} onDismiss={vi.fn()} />)
    // Avanza hasta el puente (donde el copy usa el nombre del dueño).
    fireEvent.click(screen.getByRole('button', { name: /Seguir/ }))
    expect(screen.getByText(/^Este reto es parte de un viaje/)).toBeInTheDocument()
  })

  test('el último "Seguir" (qué es Momentu) lleva al registro', () => {
    render(
      <RetoShareExplainSequence ownerName="Lucía" onCreateAccount={vi.fn()} onDismiss={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Seguir/ })) // → puente
    fireEvent.click(screen.getByRole('button', { name: /Seguir/ })) // → qué es
    fireEvent.click(screen.getByRole('button', { name: /Seguir/ })) // → registro
    expect(screen.getByText('No pierdas tus retos')).toBeInTheDocument()
  })

  test('"Saltar" desde cualquier tarjeta lleva DIRECTO al registro', () => {
    render(
      <RetoShareExplainSequence ownerName="Lucía" onCreateAccount={vi.fn()} onDismiss={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Saltar' }))
    expect(screen.getByText('No pierdas tus retos')).toBeInTheDocument()
    expect(screen.getByText('Guárdalo')).toBeInTheDocument()
  })

  test('el registro nunca aparece antes de tiempo salvo por "Saltar"', () => {
    render(
      <RetoShareExplainSequence ownerName="Lucía" onCreateAccount={vi.fn()} onDismiss={vi.fn()} />,
    )
    expect(screen.queryByText('No pierdas tus retos')).not.toBeInTheDocument()
  })

  test('en el registro, "Crear cuenta" llama a onCreateAccount', () => {
    const onCreateAccount = vi.fn()
    render(
      <RetoShareExplainSequence
        ownerName="Lucía"
        onCreateAccount={onCreateAccount}
        onDismiss={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Saltar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    expect(onCreateAccount).toHaveBeenCalledTimes(1)
  })

  test('en el registro, "Ahora no" llama a onDismiss (el llamador navega al Marcador)', () => {
    const onDismiss = vi.fn()
    render(
      <RetoShareExplainSequence
        ownerName="Lucía"
        onCreateAccount={vi.fn()}
        onDismiss={onDismiss}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Saltar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  // `initialStep` solo existe para saltar a un paso (RetoShareGuide → 'registro')
  // y para capturar cada tarjeta por separado en la galería de diseño/a11y.
  test('`initialStep` aterriza directo en ese paso', () => {
    render(
      <RetoShareExplainSequence
        ownerName="Lucía"
        initialStep="puente"
        onCreateAccount={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
    expect(screen.getByText('De un reto a un viaje')).toBeInTheDocument()
  })
})
