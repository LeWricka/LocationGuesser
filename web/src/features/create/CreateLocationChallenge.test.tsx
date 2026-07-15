import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '@supabase/supabase-js'
import type { LatLng } from '../../lib/geo'
import type { ChallengeForPlay } from '../../lib/challenges'
import { ImageDecodeError } from '../../lib/storage'

const trackMock = vi.fn()
vi.mock('../../lib/analytics', () => ({ track: (...args: unknown[]) => trackMock(...args) }))

const reportErrorMock = vi.fn()
vi.mock('../../lib/observability', () => ({
  reportError: (...args: unknown[]) => reportErrorMock(...args),
}))

const createChallengeMock = vi.fn()
const promoteToChallengeMock = vi.fn()
vi.mock('../../lib/challenges', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/challenges')>()
  return {
    ...actual,
    createChallenge: (...args: unknown[]) => createChallengeMock(...args),
    promoteToChallenge: (...args: unknown[]) => promoteToChallengeMock(...args),
  }
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

// Cascada de fecha por defecto (issue fecha del reto, mismo criterio que
// AddMoment/#553): `getGroup` (fechas del viaje) + la consulta mínima de
// `fetchLatestMomentDate` (último momento) sobre `supabase` directo.
const getGroupMock = vi.fn()
vi.mock('../../lib/groupData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/groupData')>()
  return { ...actual, getGroup: (...args: unknown[]) => getGroupMock(...args) }
})

const latestMomentMock = vi.fn()
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => ({ maybeSingle: latestMomentMock })),
          })),
        })),
      })),
    })),
  },
}))

import { CreateLocationChallenge } from './CreateLocationChallenge'
import type { ChallengePrefill } from './challengePrefill'
import { SessionContext, type SessionState } from '../../lib/session-context'
import { ToastProvider } from '../../ui'
import { loadDraft, saveDraft } from '../../lib/drafts'

const session: SessionState = {
  session: null,
  user: { id: 'u-me' } as User,
  profile: { display_name: 'Iker' } as SessionState['profile'],
  loading: false,
  verified: true,
  isAnonymous: false,
  refreshProfile: async () => {},
}

function renderScreen(groupId = 'g-1', prefill?: ChallengePrefill, promoteMomentId?: string) {
  return render(
    <SessionContext.Provider value={session}>
      <ToastProvider>
        <CreateLocationChallenge
          groupId={groupId}
          groupName="Japón 2026"
          prefill={prefill}
          promoteMomentId={promoteMomentId}
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
  reportErrorMock.mockClear()
  createChallengeMock.mockReset()
  promoteToChallengeMock.mockReset()
  uploadImageMock.mockReset()
  // Cascada de fecha por defecto: sin momentos ni fechas del viaje por defecto
  // (cae en "hoy", regla 3 de `computeDefaultDate`) — cada test que necesite
  // otra cosa lo sobreescribe.
  getGroupMock.mockReset().mockResolvedValue(null)
  latestMomentMock.mockReset().mockResolvedValue({ data: null, error: null })
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
    // `CreateNumberChallenge`): pista, nunca sorpresa.
    expect(createChallengeMock).toHaveBeenCalledWith(
      expect.objectContaining({ imagePath: 'u-me/foto.jpg', photoIsHint: true }),
    )
    expect(trackMock).toHaveBeenCalledWith(
      'challenge_created',
      expect.objectContaining({ has_photo: true, photo_is_hint: true }),
    )
  })

  // Issue #762: `uploadImage` (lib/storage) ya reporta el `ImageDecodeError` a
  // Sentry con el detalle rico (MIME, tamaño, magic bytes, vía que falló).
  // Reportarlo OTRA VEZ aquí, como se hacía antes, lo duplicaba con MENOS
  // contexto — y ese segundo evento pobre era el que se veía en Sentry en
  // producción (LOCATIONGUESSER-T, sin fileName/stage/magicBytesHex).
  test('si la foto falla al decodificar, NO duplica el reporte a Sentry y el toast es el mensaje corto y accionable de la foto (sin el prefijo "no se pudo lanzar el reto")', async () => {
    uploadImageMock.mockRejectedValue(new ImageDecodeError('IMG_6756.HEIC'))
    const user = userEvent.setup()
    renderScreen()
    await advanceToRules(user)

    const file = new File(['heic-bytes'], 'IMG_6756.HEIC', { type: 'image/heic' })
    await user.upload(screen.getByLabelText('Añadir foto del sitio'), file)
    await user.click(screen.getByRole('button', { name: /lanzar el reto al grupo/i }))

    expect(
      await screen.findByText(/no se pudo leer la imagen «img_6756\.heic»/i),
    ).toBeInTheDocument()
    expect(createChallengeMock).not.toHaveBeenCalled()
    expect(reportErrorMock).not.toHaveBeenCalled()
  })
})

// Fecha ELEGIDA de cuándo ocurrió el reto (issue fecha del reto): el reto
// CREADO desde cero (no promocionado) pide fecha con la misma cascada que
// AddMoment, para que el diario ordene por `happened_on` y no por
// `created_at` (cuándo se lanzó el reto).
describe('CreateLocationChallenge — fecha del reto creado desde cero', () => {
  test('el paso de reglas trae un selector de Fecha (por defecto hoy) y lo manda a createChallenge', async () => {
    createChallengeMock.mockResolvedValue({
      challenge: { id: 'reto-3', title: '¿Dónde estamos? · Japón 2026', image_path: null },
      groupId: 'g-1',
    })
    const user = userEvent.setup()
    renderScreen()
    await advanceToRules(user)

    // Sin momentos previos ni fechas del viaje (mocks por defecto de
    // `beforeEach`), la cascada cae en "hoy" (regla 3 de `computeDefaultDate`).
    await screen.findByLabelText('Fecha')

    await user.click(screen.getByRole('button', { name: /lanzar el reto al grupo/i }))

    await waitFor(() => expect(createChallengeMock).toHaveBeenCalledTimes(1))
    expect(createChallengeMock).toHaveBeenCalledWith(
      expect.objectContaining({ happenedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
    )
  })

  test('con un viaje FUTURO sin momentos, la fecha por defecto cae en el inicio del viaje', async () => {
    // Año claramente futuro (2030) para que la comparación con "hoy" sea
    // estable sin mockear el reloj del sistema.
    getGroupMock.mockResolvedValue({ starts_on: '2030-08-01', ends_on: '2030-08-15' })
    createChallengeMock.mockResolvedValue({
      challenge: { id: 'reto-4', title: 'x', image_path: null },
      groupId: 'g-1',
    })
    const user = userEvent.setup()
    renderScreen()
    await advanceToRules(user)

    const trigger = await screen.findByLabelText('Fecha')
    // El viaje es futuro (starts_on tras "hoy"): la fecha por defecto cae en el
    // inicio del viaje (regla 2 de `computeDefaultDate`), no en hoy.
    await waitFor(() => expect(trigger).toHaveTextContent('1 ago 2030'))
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

// --- Unificación: reto desde un recuerdo guardado abre ESTE MISMO asistente ---
// (antes `CreateChallengeImmersive`, eliminado — solo permitía foto y menos
// opciones). Con `prefill`: el pin, la foto (quitable) y el título del
// recuerdo llegan puestos; a partir de ahí, los mismos pasos que un reto nuevo.
describe('CreateLocationChallenge — prefill desde un recuerdo (unificación)', () => {
  const prefill: ChallengePrefill = {
    point: { lat: 41.38, lng: 2.17 },
    imagePath: 'u-me/recuerdo.jpg',
    photoUrl: 'https://signed.example/recuerdo.jpg',
    title: 'La Sagrada Família',
  }

  test('el pin llega puesto y se busca Street View YA, sin tocar el mapa', async () => {
    renderScreen('g-1', prefill)

    expect(await screen.findByTestId('sv-preview')).toBeInTheDocument()
    expect(screen.getByTestId('map-picker')).toHaveAttribute('data-pin', '41.38,2.17')
    expect(findPanoramaMock).toHaveBeenCalledWith(41.38, 2.17, expect.any(Number))
    expect(screen.getByRole('button', { name: /continuar a las reglas/i })).toBeEnabled()
  })

  test('la foto del recuerdo llega puesta (quitable) en el paso de las reglas', async () => {
    const user = userEvent.setup()
    renderScreen('g-1', prefill)
    await screen.findByTestId('sv-preview')
    await user.click(await screen.findByRole('button', { name: /continuar a las reglas/i }))

    expect(screen.getByRole('img', { name: 'Vista previa de la foto del reto' })).toHaveAttribute(
      'src',
      prefill.photoUrl,
    )
    // Sigue siendo opcional: se puede quitar como cualquier otra.
    expect(screen.getByRole('button', { name: 'Quitar foto' })).toBeInTheDocument()
  })

  test('lanzar sin tocar la foto: NO se re-sube, se reutiliza el path ya subido', async () => {
    createChallengeMock.mockResolvedValue({
      challenge: { id: 'reto-4', title: prefill.title, image_path: prefill.imagePath },
      groupId: 'g-1',
    })
    const user = userEvent.setup()
    renderScreen('g-1', prefill)
    await screen.findByTestId('sv-preview')
    await user.click(await screen.findByRole('button', { name: /continuar a las reglas/i }))

    await user.click(screen.getByRole('button', { name: /lanzar el reto al grupo/i }))

    await waitFor(() => expect(createChallengeMock).toHaveBeenCalledTimes(1))
    expect(uploadImageMock).not.toHaveBeenCalled()
    expect(createChallengeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'La Sagrada Família',
        imagePath: 'u-me/recuerdo.jpg',
        photoIsHint: true,
      }),
    )
  })

  test('quitar la foto del recuerdo antes de lanzar: el reto se crea sin image_path', async () => {
    createChallengeMock.mockResolvedValue({
      challenge: { id: 'reto-5', title: prefill.title, image_path: null },
      groupId: 'g-1',
    })
    const user = userEvent.setup()
    renderScreen('g-1', prefill)
    await screen.findByTestId('sv-preview')
    await user.click(await screen.findByRole('button', { name: /continuar a las reglas/i }))

    await user.click(screen.getByRole('button', { name: 'Quitar foto' }))
    await user.click(screen.getByRole('button', { name: /lanzar el reto al grupo/i }))

    await waitFor(() => expect(createChallengeMock).toHaveBeenCalledTimes(1))
    expect(uploadImageMock).not.toHaveBeenCalled()
    expect(createChallengeMock).toHaveBeenCalledWith(
      expect.objectContaining({ imagePath: undefined }),
    )
  })

  test('con prefill, un borrador anterior del viaje NO se restaura (el prefill manda)', async () => {
    const groupId = `g-draft-${crypto.randomUUID()}`
    await saveDraft(`locationChallenge:${groupId}`, {
      point: { lat: 10, lng: 10 },
      deadlineIndex: 0,
      guessIndex: 0,
      timeScoring: false,
      photo: null,
    })

    renderScreen(groupId, prefill)

    // El pin es el del recuerdo (2.17), no el del borrador viejo (10,10); y no
    // aparece el toast de "borrador recuperado".
    await waitFor(() =>
      expect(screen.getByTestId('map-picker')).toHaveAttribute('data-pin', '41.38,2.17'),
    )
    expect(screen.queryByText(/recuperado tu borrador/i)).not.toBeInTheDocument()
  })
})

// --- Modo PROMOCIÓN (issue #723): el asistente convierte, no duplica ------------
describe('CreateLocationChallenge — modo promoción (promoteMomentId)', () => {
  const prefill: ChallengePrefill = {
    point: { lat: 41.38, lng: 2.17 },
    imagePath: 'u-me/recuerdo.jpg',
    photoUrl: 'https://signed.example/recuerdo.jpg',
    title: 'La Sagrada Família',
  }

  function promoteResult() {
    promoteToChallengeMock.mockResolvedValue({
      id: 'm-9',
      title: prefill.title,
      image_path: prefill.imagePath,
    } as ChallengeForPlay)
  }

  test('lanzar llama a promoteToChallenge sobre el MISMO momento (no a createChallenge), con todos los campos', async () => {
    promoteResult()
    const user = userEvent.setup()
    renderScreen('g-1', prefill, 'm-9')
    await screen.findByTestId('sv-preview')
    await user.click(await screen.findByRole('button', { name: /continuar a las reglas/i }))
    await user.click(screen.getByRole('button', { name: /lanzar el reto al grupo/i }))

    await waitFor(() => expect(promoteToChallengeMock).toHaveBeenCalledTimes(1))
    // Identidad conservada: se promociona la fila del momento, no se crea otra.
    expect(createChallengeMock).not.toHaveBeenCalled()
    expect(promoteToChallengeMock).toHaveBeenCalledWith(
      'm-9',
      expect.objectContaining({
        title: 'La Sagrada Família',
        lat: 41.38,
        lng: 2.17,
        svPanoId: 'pano-1',
        guessSeconds: 30,
        timeScoring: true,
        photoIsHint: true,
        scoreScale: 'ciudad',
        deadlineAt: expect.any(String),
        // Foto del recuerdo sin tocar: NO se manda (conservar), ni se re-sube.
        imagePath: undefined,
      }),
    )
    expect(uploadImageMock).not.toHaveBeenCalled()
    expect(trackMock).toHaveBeenCalledWith(
      'challenge_created',
      expect.objectContaining({ challenge_id: 'm-9', promoted_from_moment: true }),
    )
  })

  // El reto convertido desde un momento YA hereda la fecha del recuerdo
  // (`promoteToChallenge` no toca `happened_on`): pedirla de nuevo aquí sería
  // redundante y confuso. El asistente NO enseña el selector en este modo.
  test('en modo promoción NO se pide Fecha (ya la hereda el recuerdo de origen)', async () => {
    promoteResult()
    const user = userEvent.setup()
    renderScreen('g-1', prefill, 'm-9')
    await screen.findByTestId('sv-preview')
    await user.click(await screen.findByRole('button', { name: /continuar a las reglas/i }))

    expect(screen.queryByLabelText('Fecha')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /lanzar el reto al grupo/i }))
    await waitFor(() => expect(promoteToChallengeMock).toHaveBeenCalledTimes(1))
    expect(promoteToChallengeMock.mock.calls[0][1]).not.toHaveProperty('happenedOn')
  })

  test('quitar la foto del recuerdo al promocionar manda imagePath null (se limpia en la fila)', async () => {
    promoteToChallengeMock.mockResolvedValue({
      id: 'm-9',
      title: prefill.title,
      image_path: null,
    } as ChallengeForPlay)
    const user = userEvent.setup()
    renderScreen('g-1', prefill, 'm-9')
    await screen.findByTestId('sv-preview')
    await user.click(await screen.findByRole('button', { name: /continuar a las reglas/i }))

    await user.click(screen.getByRole('button', { name: 'Quitar foto' }))
    await user.click(screen.getByRole('button', { name: /lanzar el reto al grupo/i }))

    await waitFor(() => expect(promoteToChallengeMock).toHaveBeenCalledTimes(1))
    expect(promoteToChallengeMock.mock.calls[0][1]).toMatchObject({ imagePath: null })
  })

  test('reemplazar la foto al promocionar la sube y manda el path nuevo', async () => {
    promoteResult()
    uploadImageMock.mockResolvedValue('u-me/nueva.jpg')
    const user = userEvent.setup()
    renderScreen('g-1', prefill, 'm-9')
    await screen.findByTestId('sv-preview')
    await user.click(await screen.findByRole('button', { name: /continuar a las reglas/i }))

    const file = new File(['foto'], 'nueva.jpg', { type: 'image/jpeg' })
    await user.upload(screen.getByLabelText('Cambiar foto del reto'), file)
    await user.click(screen.getByRole('button', { name: /lanzar el reto al grupo/i }))

    await waitFor(() => expect(promoteToChallengeMock).toHaveBeenCalledTimes(1))
    expect(uploadImageMock).toHaveBeenCalledTimes(1)
    expect(promoteToChallengeMock.mock.calls[0][1]).toMatchObject({ imagePath: 'u-me/nueva.jpg' })
  })

  test('en modo promoción un borrador anterior del viaje NO se restaura ni se pisa', async () => {
    const groupId = `g-draft-${crypto.randomUUID()}`
    await saveDraft(`locationChallenge:${groupId}`, {
      point: { lat: 10, lng: 10 },
      deadlineIndex: 0,
      guessIndex: 0,
      timeScoring: false,
      photo: null,
    })

    renderScreen(groupId, prefill, 'm-9')

    await waitFor(() =>
      expect(screen.getByTestId('map-picker')).toHaveAttribute('data-pin', '41.38,2.17'),
    )
    expect(screen.queryByText(/recuperado tu borrador/i)).not.toBeInTheDocument()
    // Y el borrador previo sigue intacto (no se pisa con los datos del recuerdo).
    expect(await loadDraft(`locationChallenge:${groupId}`)).toMatchObject({
      point: { lat: 10, lng: 10 },
    })
  })
})
