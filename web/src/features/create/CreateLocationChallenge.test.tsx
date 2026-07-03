import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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

// Flujo en DOS PASOS (#585): paso 1 = mapa a pantalla completa para elegir y
// afinar (CTA "Confirmar sitio" al haber pin); paso 2 = previa SV + reglas +
// "Cambiar sitio" (vuelve al paso 1 CONSERVANDO el pin) + Lanzar.
describe('CreateLocationChallenge — ¿Dónde? en dos pasos (#585)', () => {
  test('paso 1: mapa con buscador en overlay y sin CTA hasta que hay pin', () => {
    renderScreen()

    // El buscador va DENTRO del mapa (variante overlay de MapPicker), no encima.
    expect(screen.getByTestId('map-picker')).toHaveAttribute('data-placement', 'overlay')
    // Sin pin todavía: ni CTA de confirmar ni contenido del paso 2.
    expect(screen.queryByRole('button', { name: /confirmar este sitio/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Plazo')).not.toBeInTheDocument()
  })

  test('paso 1 → paso 2: confirmar el sitio muestra la previa y las reglas', async () => {
    const user = userEvent.setup()
    renderScreen()

    await user.click(screen.getByRole('button', { name: /simular tap/i }))
    // Con pin: aparece el CTA fijo "Confirmar sitio".
    const confirm = await screen.findByRole('button', { name: /confirmar este sitio/i })
    await user.click(confirm)

    // Paso 2: el mapa se va; la previa de SV y las reglas mandan.
    expect(screen.queryByTestId('map-picker')).not.toBeInTheDocument()
    expect(await screen.findByTestId('sv-preview')).toBeInTheDocument()
    expect(screen.getByText('Plazo')).toBeInTheDocument()
    expect(screen.getByText('Tiempo por jugada')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /lanzar el reto al grupo/i })).toBeInTheDocument()
  })

  test('paso 2 → "Cambiar sitio" vuelve al paso 1 CONSERVANDO el pin', async () => {
    const user = userEvent.setup()
    renderScreen()

    await user.click(screen.getByRole('button', { name: /simular tap/i }))
    await user.click(await screen.findByRole('button', { name: /confirmar este sitio/i }))
    await user.click(screen.getByRole('button', { name: /cambiar sitio/i }))

    // De vuelta en el paso 1: el pin sigue puesto (el picker lo recibe como
    // `value`) y el CTA de confirmar sigue disponible sin volver a tocar.
    expect(screen.getByTestId('map-picker')).toHaveAttribute('data-pin', '41.38,2.17')
    expect(screen.getByRole('button', { name: /confirmar este sitio/i })).toBeInTheDocument()
    // Y NO se relanza la búsqueda de panorama (el resultado se conserva).
    expect(findPanoramaMock).toHaveBeenCalledTimes(1)
  })
})
