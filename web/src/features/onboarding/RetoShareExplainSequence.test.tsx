import { describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RetoShareExplainSequence } from './RetoShareExplainSequence'

describe('RetoShareExplainSequence', () => {
  test('arranca en "qué es Momentu" con el nombre del dueño sustituido', () => {
    render(
      <RetoShareExplainSequence
        ownerName="Lucía"
        onViewTrip={vi.fn()}
        onCreateAccount={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
    expect(screen.getByText('Esto es Momentu')).toBeInTheDocument()
    expect(screen.getByText('El diario de un viaje compartido')).toBeInTheDocument()
    expect(screen.getByText(/^Lucía guarda cada parada de este viaje/)).toBeInTheDocument()
  })

  test('sin dueño resuelto, cae al copy genérico (nunca "de undefined")', () => {
    render(
      <RetoShareExplainSequence
        onViewTrip={vi.fn()}
        onCreateAccount={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
    expect(screen.getByText(/^Guardan cada parada de este viaje/)).toBeInTheDocument()
  })

  test('"Seguir" avanza qué es → retos → puente, con el copy exacto de cada paso', () => {
    render(
      <RetoShareExplainSequence
        ownerName="Lucía"
        onViewTrip={vi.fn()}
        onCreateAccount={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Seguir/ }))
    expect(screen.getByText('Los retos')).toBeInTheDocument()
    expect(screen.getByText('Se juegan sobre un lugar')).toBeInTheDocument()
    expect(screen.getByText('¿Dónde estamos?')).toBeInTheDocument()
    expect(
      screen.getByText('Ves la foto y marcas en el mapa dónde crees que es.'),
    ).toBeInTheDocument()
    expect(screen.getByText('¿Adivinas?')).toBeInTheDocument()
    expect(
      screen.getByText('Una pregunta sobre el lugar; respondes con un número.'),
    ).toBeInTheDocument()
    expect(screen.getByText(/Cada reto tiene/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Seguir/ }))
    expect(screen.getByText('El viaje entero')).toBeInTheDocument()
    expect(screen.getByText('De un reto a un viaje')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Este reto es parte del viaje de Lucía. Míralo entero: cada parada en el Diario, y todo reunido en la Bitácora.',
      ),
    ).toBeInTheDocument()
  })

  test('en el puente, "Ver el viaje de X" llama a onViewTrip', () => {
    const onViewTrip = vi.fn()
    render(
      <RetoShareExplainSequence
        ownerName="Lucía"
        onViewTrip={onViewTrip}
        onCreateAccount={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Seguir/ })) // → retos
    fireEvent.click(screen.getByRole('button', { name: /Seguir/ })) // → puente
    fireEvent.click(screen.getByRole('button', { name: 'Ver el viaje de Lucía' }))
    expect(onViewTrip).toHaveBeenCalledTimes(1)
  })

  test('sin dueño, el CTA del puente cae a "Ver el viaje"', () => {
    render(
      <RetoShareExplainSequence
        onViewTrip={vi.fn()}
        onCreateAccount={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Seguir/ }))
    fireEvent.click(screen.getByRole('button', { name: /Seguir/ }))
    expect(screen.getByRole('button', { name: 'Ver el viaje' })).toBeInTheDocument()
  })

  test('"Saltar" desde cualquier paso lleva DIRECTO al registro', () => {
    render(
      <RetoShareExplainSequence
        ownerName="Lucía"
        onViewTrip={vi.fn()}
        onCreateAccount={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Saltar' }))
    expect(screen.getByText('No pierdas tus retos')).toBeInTheDocument()
    expect(screen.getByText('Guárdalo')).toBeInTheDocument()
  })

  test('el registro nunca aparece antes de "puente" salvo por "Saltar"', () => {
    render(
      <RetoShareExplainSequence
        ownerName="Lucía"
        onViewTrip={vi.fn()}
        onCreateAccount={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
    expect(screen.queryByText('No pierdas tus retos')).not.toBeInTheDocument()
  })

  test('en el registro, "Crear cuenta" llama a onCreateAccount', () => {
    const onCreateAccount = vi.fn()
    render(
      <RetoShareExplainSequence
        ownerName="Lucía"
        onViewTrip={vi.fn()}
        onCreateAccount={onCreateAccount}
        onDismiss={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Saltar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    expect(onCreateAccount).toHaveBeenCalledTimes(1)
  })

  // `initialStep` solo existe para capturar cada paso por separado en la
  // galería de diseño/a11y (mismo criterio que `initialSection`/`initialEditing`
  // en TripPage/MomentSheet); PlayChallenge nunca lo pasa.
  test('`initialStep` aterriza directo en ese paso', () => {
    render(
      <RetoShareExplainSequence
        ownerName="Lucía"
        initialStep="puente"
        onViewTrip={vi.fn()}
        onCreateAccount={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
    expect(screen.getByText('De un reto a un viaje')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver el viaje de Lucía' })).toBeInTheDocument()
  })

  test('en el registro, "Ahora no" llama a onDismiss', () => {
    const onDismiss = vi.fn()
    render(
      <RetoShareExplainSequence
        ownerName="Lucía"
        onViewTrip={vi.fn()}
        onCreateAccount={vi.fn()}
        onDismiss={onDismiss}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Saltar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
