import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '@supabase/supabase-js'
import type { LatLng } from '../../lib/geo'
import type { ChallengeForPlay } from '../../lib/challenges'

const trackMock = vi.fn()
vi.mock('../../lib/analytics', () => ({ track: (...args: unknown[]) => trackMock(...args) }))
vi.mock('../../lib/observability', () => ({ reportError: vi.fn() }))

const createChallengeMock = vi.fn()
vi.mock('../../lib/challenges', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/challenges')>()
  return { ...actual, createChallenge: (...args: unknown[]) => createChallengeMock(...args) }
})

const uploadImageMock = vi.fn()
vi.mock('../../lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/storage')>()
  return { ...actual, uploadImage: (...args: unknown[]) => uploadImageMock(...args) }
})

// La hoja "¡Reto creado!" (ChallengeCreatedShare) genera una tarjeta-imagen
// (issue #595): fuera del alcance de este test (foto opcional del reto ¿Dónde estamos?),
// dobles simples para no tocar Supabase/html-to-image reales.
vi.mock('../group/shareLeaderboard', () => ({
  nodeToPngBlob: vi.fn().mockResolvedValue(new Blob()),
  shareDomain: vi.fn(() => 'momentu.art'),
  shareLeaderboardImage: vi.fn().mockResolvedValue('cancelled'),
  downloadBlob: vi.fn(),
}))
vi.mock('./challengeShareCover', () => ({
  resolveChallengeShareCover: vi.fn().mockResolvedValue(null),
}))

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
import { loadDraft } from '../../lib/drafts'

const session: SessionState = {
  session: null,
  user: { id: 'u-me' } as User,
  profile: { display_name: 'Iker' } as SessionState['profile'],
  loading: false,
  verified: true,
  refreshProfile: async () => {},
}

function renderScreen(groupId = 'g-1') {
  return render(
    <SessionContext.Provider value={session}>
      <ToastProvider>
        <CreateLocationChallenge
          groupId={groupId}
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
  trackMock.mockClear()
  createChallengeMock.mockReset()
  uploadImageMock.mockReset()
  // jsdom no implementa createObjectURL/revokeObjectURL (solo la miniatura de la
  // foto opcional los usa; irrelevante para los tests de pasos/navegación).
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() })
})

// Lleva el flujo hasta el paso 2 con cobertura confirmada (mismo camino que los
// tests de arriba): tap en el mapa + "Continuar a las reglas".
async function advanceToRules(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /simular tap/i }))
  await user.click(await screen.findByRole('button', { name: /continuar a las reglas/i }))
}

// Flujo v3 (issue #592, rediseño de #585): paso 1 = mapa a pantalla completa
// para elegir el sitio, con la previa de SV (o el aviso de "sin cobertura")
// EN UNA TARJETA FLOTANTE sobre el propio mapa — nunca cambia de paso para
// eso. El CTA "Continuar" solo se habilita con cobertura y lleva al paso 2,
// que queda SOLO con las reglas (plazo/tiempo) + Lanzar.
describe('CreateLocationChallenge — ¿Dónde estamos? v3 (#592)', () => {
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

// Foto opcional del reto ¿Dónde estamos? (issue #595): un tile más en el paso 2, sin
// tocar el paso 1 (el sitio lo fija el mapa, no el EXIF de esta foto).
describe('CreateLocationChallenge — foto opcional del reto (#595)', () => {
  test('sin foto: se lanza el reto sin subir nada a Storage y sin image_path', async () => {
    createChallengeMock.mockResolvedValue({
      challenge: {
        id: 'reto-1',
        title: '¿Dónde estamos? · Japón 2026',
        image_path: null,
      } as ChallengeForPlay,
      groupId: 'g-1',
    })
    const user = userEvent.setup()
    renderScreen()
    await advanceToRules(user)

    await user.click(screen.getByRole('button', { name: /lanzar el reto al grupo/i }))

    await waitFor(() => expect(createChallengeMock).toHaveBeenCalledTimes(1))
    expect(uploadImageMock).not.toHaveBeenCalled()
    expect(createChallengeMock).toHaveBeenCalledWith(
      expect.objectContaining({ imagePath: undefined, photoIsHint: true }),
    )
  })

  test('con foto: se sube (comprimida/sin EXIF) y se asocia como PISTA (photo_is_hint=true, sin toggle nuevo)', async () => {
    uploadImageMock.mockResolvedValue('u-me/foto.jpg')
    createChallengeMock.mockResolvedValue({
      challenge: {
        id: 'reto-2',
        title: '¿Dónde estamos? · Japón 2026',
        image_path: 'u-me/foto.jpg',
      } as ChallengeForPlay,
      groupId: 'g-1',
    })
    const user = userEvent.setup()
    renderScreen()
    await advanceToRules(user)

    const file = new File(['foto'], 'sitio.jpg', { type: 'image/jpeg' })
    await user.upload(screen.getByLabelText('Añadir foto del sitio'), file)

    await user.click(screen.getByRole('button', { name: /lanzar el reto al grupo/i }))

    await waitFor(() => expect(createChallengeMock).toHaveBeenCalledTimes(1))
    // NO es el mismo `File` (#642, `PhotoDropzone` copia los bytes al
    // seleccionar para no depender del `File` original del selector, que en
    // Android puede morir con el tiempo) — mismo nombre/tipo/contenido.
    expect(uploadImageMock).toHaveBeenCalledTimes(1)
    const uploaded = uploadImageMock.mock.calls[0][0] as File
    expect(uploaded).not.toBe(file)
    expect(uploaded.name).toBe(file.name)
    expect(uploaded.type).toBe(file.type)
    await expect(uploaded.text()).resolves.toBe('foto')
    // Decisión #595: sin toggle nuevo — comportamiento más simple ya existente
    // en el resto de flujos de crear (default `createChallenge`,
    // CreateChallengeImmersive, CreateNumberChallenge): pista, nunca sorpresa.
    expect(createChallengeMock).toHaveBeenCalledWith(
      expect.objectContaining({ imagePath: 'u-me/foto.jpg', photoIsHint: true }),
    )
    expect(trackMock).toHaveBeenCalledWith(
      'challenge_created',
      expect.objectContaining({ has_photo: true, photo_is_hint: true }),
    )
  })
})

// La velocidad puntúa (issue #628): toggle ON por defecto, solo visible con
// límite por jugada, y wiring a createChallenge/track.
describe('CreateLocationChallenge — "La velocidad puntúa" (#628)', () => {
  function launchResult() {
    createChallengeMock.mockResolvedValue({
      challenge: {
        id: 'reto-3',
        title: '¿Dónde estamos? · Japón 2026',
        image_path: null,
      } as ChallengeForPlay,
      groupId: 'g-1',
    })
  }

  test('visible y activado (ON) por defecto con el límite por defecto (30 s)', async () => {
    const user = userEvent.setup()
    renderScreen()
    await advanceToRules(user)

    const toggle = screen.getByRole('switch', { name: 'La velocidad puntúa' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  test('se OCULTA al elegir "Libre" (sin límite, no hay nada que medir)', async () => {
    const user = userEvent.setup()
    renderScreen()
    await advanceToRules(user)

    await user.click(screen.getByRole('radio', { name: 'Libre' }))

    expect(screen.queryByRole('switch', { name: 'La velocidad puntúa' })).not.toBeInTheDocument()
  })

  test('lanzar con el valor por defecto: createChallenge recibe timeScoring=true', async () => {
    launchResult()
    const user = userEvent.setup()
    renderScreen()
    await advanceToRules(user)

    await user.click(screen.getByRole('button', { name: /lanzar el reto al grupo/i }))

    await waitFor(() => expect(createChallengeMock).toHaveBeenCalledTimes(1))
    expect(createChallengeMock).toHaveBeenCalledWith(expect.objectContaining({ timeScoring: true }))
    expect(trackMock).toHaveBeenCalledWith(
      'challenge_created',
      expect.objectContaining({ time_scoring: true }),
    )
  })

  test('apagar el toggle: createChallenge recibe timeScoring=false', async () => {
    launchResult()
    const user = userEvent.setup()
    renderScreen()
    await advanceToRules(user)

    await user.click(screen.getByRole('switch', { name: 'La velocidad puntúa' }))
    await user.click(screen.getByRole('button', { name: /lanzar el reto al grupo/i }))

    await waitFor(() => expect(createChallengeMock).toHaveBeenCalledTimes(1))
    expect(createChallengeMock).toHaveBeenCalledWith(
      expect.objectContaining({ timeScoring: false }),
    )
  })
})

// --- Borrador persistente (issue #718) ---------------------------------------------

describe('CreateLocationChallenge — borrador persistente (#718)', () => {
  test('elegir un pin, desmontar y volver a montar restaura el punto y re-busca Street View', async () => {
    const groupId = `g-draft-${crypto.randomUUID()}`
    const user = userEvent.setup()
    const { unmount } = renderScreen(groupId)

    await user.click(screen.getByRole('button', { name: /simular tap/i }))
    await screen.findByTestId('sv-preview')

    await waitFor(
      async () => expect(await loadDraft(`locationChallenge:${groupId}`)).not.toBeNull(),
      {
        timeout: 2000,
      },
    )
    unmount()
    findPanoramaMock.mockClear()

    renderScreen(groupId)
    // Re-busca la cobertura desde el punto guardado (no resucita el panoId a ciegas).
    await waitFor(() =>
      expect(findPanoramaMock).toHaveBeenCalledWith(41.38, 2.17, expect.any(Number)),
    )
    expect(await screen.findByTestId('sv-preview')).toBeInTheDocument()
    expect(await screen.findByText(/recuperado tu borrador/i)).toBeInTheDocument()
    expect(trackMock).toHaveBeenCalledWith('draft_restored', {
      form: 'location_challenge',
      has_photos: false,
    })
  })

  test('lanzar el reto con éxito limpia el borrador', async () => {
    const groupId = `g-draft-${crypto.randomUUID()}`
    createChallengeMock.mockResolvedValue({
      challenge: { id: 'reto-clean', title: 'x', image_path: null } as ChallengeForPlay,
      groupId,
    })
    const user = userEvent.setup()
    renderScreen(groupId)
    await advanceToRules(user)
    await user.click(screen.getByRole('button', { name: /lanzar el reto al grupo/i }))

    await waitFor(() => expect(createChallengeMock).toHaveBeenCalledTimes(1))
    expect(await loadDraft(`locationChallenge:${groupId}`)).toBeNull()
  })
})
