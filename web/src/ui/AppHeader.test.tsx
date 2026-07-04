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

// Variante "dense" (issue #705): 5B en miniatura para pantallas con
// protagonista a sangre (el mapa de "¿Dónde?") — atrás y título EN LA MISMA
// FILA, kicker opcional, hilo corto. Mucho menos alto que "plain".
describe('AppHeader — variant="dense" (issue #705)', () => {
  test('el título se pinta junto al atrás, en la misma fila', () => {
    const { container } = render(
      <AppHeader variant="dense" title="¿Dónde?" onLead={() => {}} leadLabel="Atrás" />,
    )
    expect(screen.getByRole('heading', { name: '¿Dónde?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Atrás' })).toBeInTheDocument()
    // Una única fila (denseRow) como hijo directo del header: atrás y título
    // NO están en filas separadas, a diferencia de "plain".
    const denseRow = container.querySelector('header > div:first-child')
    expect(denseRow?.querySelector('button')).toBeInTheDocument()
    expect(denseRow?.querySelector('h1')).toBeInTheDocument()
  })

  test('con kicker, se apila encima del título dentro de la misma fila', () => {
    render(
      <AppHeader
        variant="dense"
        title="¿Dónde?"
        kicker="Japón en primavera"
        onLead={() => {}}
        leadLabel="Atrás"
      />,
    )
    expect(screen.getByText('Japón en primavera')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '¿Dónde?' })).toBeInTheDocument()
  })

  test('sin título, la cabecera queda solo con el atrás', () => {
    const { container } = render(<AppHeader variant="dense" onLead={() => {}} leadLabel="Atrás" />)
    expect(screen.getByRole('button', { name: 'Atrás' })).toBeInTheDocument()
    expect(container.querySelector('h1')).not.toBeInTheDocument()
    // Sin título tampoco se pinta el hilo (solo acompaña al título) — el único
    // svg que queda es el del icono del botón atrás.
    expect(screen.getByRole('button', { name: 'Atrás' }).querySelector('svg')).toBeInTheDocument()
    expect(container.querySelectorAll('svg').length).toBe(1)
  })

  test('la acción se pinta al final de la fila', () => {
    render(
      <AppHeader variant="dense" title="¿Dónde?" onLead={() => {}} action={<button>GPS</button>} />,
    )
    expect(screen.getByRole('button', { name: 'GPS' })).toBeInTheDocument()
  })
})
