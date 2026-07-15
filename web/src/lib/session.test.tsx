// Reproducción + regresión del bug "refrescos y redirecciones al salir/entrar"
// (reincidente tras #647/#683/#720). CAUSA RAÍZ: `@supabase/supabase-js`
// (GoTrueClient) dispara `SIGNED_IN` en CADA `visibilitychange` a visible (vía
// `_onVisibilityChanged` → `_recoverAndRefresh`, ver
// node_modules/@supabase/auth-js/dist/module/GoTrueClient.js) aunque la sesión
// sea la MISMA (mismo usuario, sin logout de por medio) — no solo cuando el
// token realmente se refresca. Antes de este fix, `AuthProvider` (session.tsx)
// trataba CUALQUIER evento de `onAuthStateChange` como una transición real: ponía
// `loading=true`, lo que hace que `AppRoutes` (App.tsx) desmonte TODO el árbol
// logueado (`<BootScreen/>`) y lo vuelva a montar de cero al terminar. Cualquier
// estado de UI que no viva en el hash (pestaña activa del viaje, paso de un
// asistente, progreso de una partida…) se perdía — la "REDIRECCIÓN" reportada:
// vuelves a la pestaña y apareces en una pantalla distinta a la que dejaste,
// aunque la URL nunca cambió.
//
// Este test monta un componente con la MISMA forma del patrón real
// (`if (loading) return <Boot/>; return <StatefulChild/>`, igual que
// `AppRoutes`/`TripPage`) y prueba que un evento de auth para el MISMO usuario
// (SIGNED_IN por revalidación en foco, o TOKEN_REFRESHED) no reinicia ese árbol.

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { useState } from 'react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { AuthProvider } from './session'
import { useSession } from './session-context'

// Capturamos el callback que `AuthProvider` registra vía `onAuthStateChange`
// para poder disparar eventos de auth manualmente, como haría supabase-js.
let authCallback: ((event: AuthChangeEvent, session: Session | null) => void) | null = null
const unsubscribeMock = vi.fn()

// Delay real (macrotask, no microtask) para que `getProfile` NO resuelva en el
// mismo tick: en producción es de red (REST a Supabase), así que SIEMPRE hay un
// hueco asíncrono real entre `setLoading(true)` y `setLoading(false)`. Con
// mocks 100% síncronos, React 18 puede COALESCER ambos `setLoading` en un único
// commit final y el flash intermedio nunca se pinta — lo que ocultaría el bug
// en vez de reproducirlo. Con este hueco, el commit `loading:true` (BootScreen)
// SÍ se pinta, igual que en el navegador real.
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

vi.mock('./auth', () => ({
  onAuthStateChange: (cb: (event: AuthChangeEvent, session: Session | null) => void) => {
    authCallback = cb
    return { unsubscribe: unsubscribeMock }
  },
  isVerifiedUser: () => true,
}))

vi.mock('./profile', () => ({
  getProfile: vi.fn(async (userId: string) => {
    await delay(10)
    return {
      id: userId,
      display_name: 'Persona de prueba',
      avatar_key: null,
      avatar_url: null,
    }
  }),
}))

function fakeSession(
  userId: string,
  accessToken: string,
  userOverrides: Record<string, unknown> = {},
): Session {
  return {
    access_token: accessToken,
    refresh_token: `refresh-${accessToken}`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: userId,
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-01-01T00:00:00.000Z',
      ...userOverrides,
    },
  } as unknown as Session
}

let currentSession: Session | null = fakeSession('u1', 'token-a')
vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: currentSession } }),
    },
  },
}))

// Mismo patrón que `AppRoutes` (App.tsx): mientras `loading`, se pinta un
// BootScreen que sustituye al árbol logueado. `StatefulChild` imita cualquier
// pantalla con estado de UI que NO vive en el hash (la pestaña activa de
// TripPage, un paso de asistente, etc.): si el árbol se remonta, este estado
// vuelve a su valor inicial.
function Consumer() {
  const { loading } = useSession()
  if (loading) return <div data-testid="boot">cargando…</div>
  return <StatefulChild />
}

function StatefulChild() {
  const [tab, setTab] = useState('diario')
  return (
    <div>
      <div data-testid="tab">{tab}</div>
      <button onClick={() => setTab('marcador')}>ir a marcador</button>
    </div>
  )
}

beforeEach(() => {
  authCallback = null
  unsubscribeMock.mockClear()
  currentSession = fakeSession('u1', 'token-a')
})

async function renderAndGoToMarcador() {
  render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>,
  )
  await waitFor(() => expect(screen.queryByTestId('boot')).toBeNull())
  fireEvent.click(screen.getByText('ir a marcador'))
  expect(screen.getByTestId('tab')).toHaveTextContent('marcador')
}

describe('AuthProvider — revalidación de sesión en foco (bug reincidente #647/#683/#720)', () => {
  test('SIGNED_IN para el MISMO usuario no reinicia el árbol logueado (no hay BootScreen ni remount)', async () => {
    await renderAndGoToMarcador()
    expect(authCallback).not.toBeNull()

    // Simula lo que hace GoTrueClient en CADA `visibilitychange` a visible: un
    // SIGNED_IN con la sesión recuperada de localStorage, MISMO usuario.
    const revalidated = fakeSession('u1', 'token-b')
    act(() => authCallback!('SIGNED_IN', revalidated))

    // Con la causa raíz SIN arreglar: esto dispara loading=true → BootScreen →
    // remonta StatefulChild → el tab vuelve a 'diario'. Damos margen (la
    // duración del `delay` mockeado) para que, si el BootScreen fuera a
    // aparecer, lo haga, y comprobamos que NUNCA lo hace.
    await delay(30)
    expect(screen.queryByTestId('boot')).toBeNull()
    expect(screen.getByTestId('tab')).toHaveTextContent('marcador')
  })

  test('TOKEN_REFRESHED para el MISMO usuario no reinicia el árbol logueado', async () => {
    await renderAndGoToMarcador()
    const refreshed = fakeSession('u1', 'token-refreshed')
    act(() => authCallback!('TOKEN_REFRESHED', refreshed))

    await delay(30)
    expect(screen.queryByTestId('boot')).toBeNull()
    expect(screen.getByTestId('tab')).toHaveTextContent('marcador')
  })

  test('SIGNED_OUT real SÍ resetea (el logout de verdad sigue funcionando)', async () => {
    await renderAndGoToMarcador()
    act(() => authCallback!('SIGNED_OUT', null))

    // Un logout real es una transición legítima: SÍ debe pasar por loading
    // (BootScreen visible mientras se resuelve) y remontar a un estado limpio.
    await screen.findByTestId('boot')
    await waitFor(() => expect(screen.queryByTestId('boot')).toBeNull())
    expect(screen.getByTestId('tab')).toHaveTextContent('diario')
  })

  test('SIGNED_IN con un usuario DISTINTO (cambio real de cuenta) sí resetea', async () => {
    await renderAndGoToMarcador()
    const otherUser = fakeSession('u2', 'token-otro-usuario')
    act(() => authCallback!('SIGNED_IN', otherUser))

    await screen.findByTestId('boot')
    await waitFor(() => expect(screen.queryByTestId('boot')).toBeNull())
    expect(screen.getByTestId('tab')).toHaveTextContent('diario')
  })
})

// Sesión anónima del receptor (issue #758): antes (#514) el bootstrap cerraba a
// la fuerza CUALQUIER sesión con `is_anonymous=true` (modelo pre-#507). Ahora es
// una sesión de primera clase — se aplica igual que cualquier otra, sin
// signOut, y el contexto expone `isAnonymous` para que la UI la use.
function AnonConsumer() {
  const { loading, isAnonymous, user } = useSession()
  if (loading) return <div data-testid="boot">cargando…</div>
  return (
    <div>
      <div data-testid="anon">{String(isAnonymous)}</div>
      <div data-testid="uid">{user?.id}</div>
    </div>
  )
}

describe('AuthProvider — sesión anónima del receptor (issue #758)', () => {
  test('el bootstrap NO cierra una sesión anónima: la aplica y expone isAnonymous=true', async () => {
    currentSession = fakeSession('u-anon', 'token-anon', { is_anonymous: true })
    render(
      <AuthProvider>
        <AnonConsumer />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.queryByTestId('boot')).toBeNull())
    expect(screen.getByTestId('anon')).toHaveTextContent('true')
    expect(screen.getByTestId('uid')).toHaveTextContent('u-anon')
  })

  test('una sesión NO anónima expone isAnonymous=false', async () => {
    currentSession = fakeSession('u1', 'token-a', { is_anonymous: false })
    render(
      <AuthProvider>
        <AnonConsumer />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.queryByTestId('boot')).toBeNull())
    expect(screen.getByTestId('anon')).toHaveTextContent('false')
  })
})
