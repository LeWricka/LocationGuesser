import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppHeader } from './AppHeader'

// Cobertura del bloque de título "5B · papel con alma" (issue #659): la
// variante plain (por defecto, cabeceras de tarea) pinta kicker opcional +
// título + hilo; la variante floating (escenas inmersivas) NO cambia.
describe('AppHeader — variant="plain" (issue #659)', () => {
  test('sin kicker no pinta el párrafo de contexto', () => {
    render(<AppHeader title="Nuevo viaje" />)
    expect(screen.getByRole('heading', { name: 'Nuevo viaje' })).toBeInTheDocument()
    expect(screen.queryByText(/./, { selector: 'p' })).not.toBeInTheDocument()
  })

  test('con kicker pinta el contexto encima del título', () => {
    render(<AppHeader title="¿Dónde?" kicker="Japón en primavera" />)
    expect(screen.getByText('Japón en primavera')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '¿Dónde?' })).toBeInTheDocument()
  })

  test('sin atrás ni acción no pinta la fila de controles (sin franja vacía)', () => {
    const { container } = render(<AppHeader title="Recuerdo guardado" />)
    // Solo dos hijos directos: el bloque de título (con el hilo dentro), nada más.
    expect(container.querySelector('header')?.children.length).toBe(1)
  })

  test('con atrás, el botón invoca onLead y lleva su etiqueta accesible', async () => {
    const onLead = vi.fn()
    render(<AppHeader title="Tu perfil" onLead={onLead} leadLabel="Volver" />)
    const back = screen.getByRole('button', { name: 'Volver' })
    back.click()
    expect(onLead).toHaveBeenCalledTimes(1)
  })

  test('la acción se pinta junto al atrás en la fila de controles', () => {
    render(<AppHeader title="¿Dónde?" onLead={() => {}} action={<button>GPS</button>} />)
    expect(screen.getByRole('button', { name: 'GPS' })).toBeInTheDocument()
  })
})

describe('AppHeader — variant="floating" (sin cambios por #659)', () => {
  test('el kicker no se pinta (patrón de fila única, fuera de alcance)', () => {
    render(<AppHeader variant="floating" title="Reto" kicker="Japón en primavera" />)
    expect(screen.getByRole('heading', { name: 'Reto' })).toBeInTheDocument()
    expect(screen.queryByText('Japón en primavera')).not.toBeInTheDocument()
  })
})
