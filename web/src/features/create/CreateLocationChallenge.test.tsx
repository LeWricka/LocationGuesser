import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '@supabase/supabase-js'
import type { LatLng } from '../../lib/geo'

vi.mock('../../lib/analytics', () => ({ track: vi.fn() }))
vi.mock('../../lib/observability', () => ({ reportError: vi.fn() }))

// El mapa (Leaflet) es pesado e irrelevante para el flujo de pasos (mismo
// patrón que AddMoment.test.tsx): el doble expone lo que este test necesita —
// un botón que simula el tap en el mapa (onPick) y los props observables
// (el pin actual y la variante del buscador).
vi.mock('./MapPicker', () => ({
  MapPicker: ({
    value,
    onPick,
    searchPlacement,
  }: {
    value: LatLng | null
    onPick: (p: LatLng) => void
    searchPlacement?: 'above' | 'overlay'
  }) => (
    <div
      data-testid="map-picker"
      data-placement={searchPlacement ?? 'above'}
      data-pin={value ? `${value.lat},${value.lng}` : ''}
    >
      <button type="button" onClick={() => onPick({ lat: 41.38, lng: 2.17 })}>
        simular tap en el mapa
      </button>
    </div>
  ),
}))

// La previa de SV monta el SDK de Google Maps: fuera del alcance de este test.
vi.mock('./StreetViewPreview', () => ({
  StreetViewPreview: () => <div data-testid="sv-preview" />,
}))

const findPanoramaMock = vi.fn()
vi.mock('../../lib/streetview', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/streetview')>()
  return { ...actual, findPanorama: (...args: unknown[]) => findPanoramaMock(...args) }
})

import { CreateLocationChallenge } from './CreateLocationChallenge'
import { SessionContext, type SessionState } from '../../lib/session-context'
import { ToastProvider } from '../../ui'

const session: SessionState = {
  session: null,
  user: { id: 'u-me' } as User,
  profile: { display_name: 'Iker' } as SessionState['profile'],
  loading: false,
  verified: true,
  refreshProfile: async () => {},
}

function renderScreen() {
  return render(
    <SessionContext.Provider value={session}>
      <ToastProvider>
        <CreateLocationChallenge
          groupId="g-1"
          groupName="Japón 2026"
          onBack={() => {}}
          onCreated={() => {}}
        />
      </ToastProvider>
    </SessionContext.Provider>,
  )
}

beforeEach(() => {
  findPanoramaMock.mockReset()
  findPanoramaMock.mockResolvedValue({ panoId: 'pano-1', lat: 41.38, lng: 2.17 })
})

// Flujo v3 (issue #592, rediseño de #585): paso 1 = mapa a pantalla completa
// para elegir el sitio, con la previa de SV (o el aviso de "sin cobertura")
// EN UNA TARJETA FLOTANTE sobre el propio mapa — nunca cambia de paso para
// eso. El CTA "Continuar" solo se habilita con cobertura y lleva al paso 2,
// que queda SOLO con las reglas (plazo/tiempo) + Lanzar.
describe('CreateLocationChallenge — ¿Dónde? v3 (#592)', () => {
  test('paso 1: mapa con buscador en overlay y sin CTA ni tarjeta SV hasta que hay pin', () => {
    renderScreen()

    expect(screen.getByTestId('map-picker')).toHaveAttribute('data-placement', 'overlay')
    expect(screen.queryByRole('button', { name: /continuar/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('sv-preview')).not.toBeInTheDocument()
    expect(screen.queryByText('Plazo')).not.toBeInTheDocument()
  })

  test('al marcar el pin CON cobertura: tarjeta SV inline en el paso 1 y CTA "Continuar" habilitado', async () => {
    const user = userEvent.setup()
    renderScreen()

    await user.click(screen.getByRole('button', { name: /simular tap/i }))

    // La previa aparece EN EL MAPA (paso 1 sigue montado, no hay cambio de paso).
    expect(await screen.findByTestId('sv-preview')).toBeInTheDocument()
    expect(screen.getByTestId('map-picker')).toBeInTheDocument()
    const continueBtn = screen.getByRole('button', { name: /continuar a las reglas/i })
    expect(continueBtn).toBeEnabled()
  })

  test('al marcar el pin SIN cobertura: aviso "Sin Street View aquí" inline y CTA deshabilitado, sin cambiar de paso', async () => {
    findPanoramaMock.mockResolvedValue(null)
    const user = userEvent.setup()
    renderScreen()

    await user.click(screen.getByRole('button', { name: /simular tap/i }))

    expect(await screen.findByText(/sin street view aquí/i)).toBeInTheDocument()
    expect(screen.getByTestId('map-picker')).toBeInTheDocument()
    const continueBtn = screen.getByRole('button', {
      name: /elige un punto con cobertura de street view/i,
    })
    expect(continueBtn).toBeDisabled()
  })

  test('paso 1 → paso 2: "Continuar" con cobertura muestra SOLO las reglas (sin mapa ni previa)', async () => {
    const user = userEvent.setup()
    renderScreen()

    await user.click(screen.getByRole('button', { name: /simular tap/i }))
    await user.click(await screen.findByRole('button', { name: /continuar a las reglas/i }))

    // Paso 2: el mapa y la previa se van; solo quedan las reglas + Lanzar.
    expect(screen.queryByTestId('map-picker')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sv-preview')).not.toBeInTheDocument()
    expect(screen.getByText('Plazo')).toBeInTheDocument()
    expect(screen.getByText('Tiempo por jugada')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /lanzar el reto al grupo/i })).toBeInTheDocument()
  })

  test('paso 2 → flecha "Atrás" de la cabecera vuelve al paso 1 CONSERVANDO el pin (sin repetir la búsqueda)', async () => {
    const user = userEvent.setup()
    renderScreen()

    await user.click(screen.getByRole('button', { name: /simular tap/i }))
    await user.click(await screen.findByRole('button', { name: /continuar a las reglas/i }))
    await user.click(screen.getByRole('button', { name: 'Atrás' }))

    // De vuelta en el paso 1: el pin sigue puesto y la tarjeta SV ya lista,
    // sin volver a llamar a `findPanorama`.
    await waitFor(() => expect(screen.getByTestId('map-picker')).toBeInTheDocument())
    expect(screen.getByTestId('map-picker')).toHaveAttribute('data-pin', '41.38,2.17')
    expect(screen.getByTestId('sv-preview')).toBeInTheDocument()
    expect(findPanoramaMock).toHaveBeenCalledTimes(1)
  })

  test('paso 2 → el atrás DEL NAVEGADOR también vuelve al paso 1 (issue #592 punto 4)', async () => {
    const user = userEvent.setup()
    renderScreen()

    await user.click(screen.getByRole('button', { name: /simular tap/i }))
    await user.click(await screen.findByRole('button', { name: /continuar a las reglas/i }))
    expect(screen.getByText('Plazo')).toBeInTheDocument()

    // Simula el botón atrás del navegador (no el de la cabecera): el paso 2
    // empujó su propia entrada de historial al entrar, así que retrocede al
    // paso 1 en vez de saltárselo.
    window.history.back()

    await waitFor(() => expect(screen.getByTestId('map-picker')).toBeInTheDocument())
    expect(screen.queryByText('Plazo')).not.toBeInTheDocument()
    expect(screen.getByTestId('map-picker')).toHaveAttribute('data-pin', '41.38,2.17')
  })

  test('paso 1 → la flecha "Atrás" de la cabecera sale del flujo (llama a onBack)', async () => {
    const onBack = vi.fn()
    const user = userEvent.setup()
    render(
      <SessionContext.Provider value={session}>
        <ToastProvider>
          <CreateLocationChallenge
            groupId="g-1"
            groupName="Japón 2026"
            onBack={onBack}
            onCreated={() => {}}
          />
        </ToastProvider>
      </SessionContext.Provider>,
    )

    await user.click(screen.getByRole('button', { name: 'Atrás' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
