import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  TripRouteSkeleton,
  PlayRouteSkeleton,
  UtilityRouteSkeleton,
  HomeRouteSkeleton,
} from './RouteSkeletons'

describe('RouteSkeletons', () => {
  test('TripRouteSkeleton se anuncia como región de carga', () => {
    render(<TripRouteSkeleton />)
    expect(screen.getByRole('status', { name: 'Cargando…' })).toBeInTheDocument()
  })

  test('PlayRouteSkeleton se anuncia como región de carga', () => {
    render(<PlayRouteSkeleton />)
    expect(screen.getByRole('status', { name: 'Cargando…' })).toBeInTheDocument()
  })

  test('UtilityRouteSkeleton se anuncia como región de carga', () => {
    render(<UtilityRouteSkeleton />)
    expect(screen.getByRole('status', { name: 'Cargando…' })).toBeInTheDocument()
  })

  test('UtilityRouteSkeleton pinta 4 campos (label + input) sobre papel', () => {
    const { container } = render(<UtilityRouteSkeleton />)
    // 4 campos × 2 bloques (label + input) + botón redondo + spacer de cabecera
    // + título = bloques decorativos aria-hidden.
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(8)
  })

  test('HomeRouteSkeleton se anuncia como región de carga (mismo label que usaba HomePage)', () => {
    // "perf(cargas): entrada sin saltos": el esqueleto de la home es COMPARTIDO
    // entre el fallback de <Suspense> (App.tsx, mientras llega el chunk) y la
    // espera por datos de HomePage — un único layout de espera, sin doble-swap.
    render(<HomeRouteSkeleton />)
    expect(screen.getByRole('status', { name: 'Cargando tu inicio' })).toBeInTheDocument()
  })
})
