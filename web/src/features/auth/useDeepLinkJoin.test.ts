import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// membership.ts importa ./supabase; mockeamos lo que usa el hook (join + isMember).
const joinGroup = vi.fn<(groupId: string, userId: string) => Promise<void>>(async () => {})
const isMember = vi.fn<(groupId: string, userId: string) => Promise<boolean>>(async () => false)
vi.mock('../../lib/membership', () => ({
  joinGroup: (groupId: string, userId: string) => joinGroup(groupId, userId),
  isMember: (groupId: string, userId: string) => isMember(groupId, userId),
}))

// analytics importa mixpanel-browser; mockeamos track para inspeccionar el evento.
const track = vi.fn<(event: string, props?: Record<string, unknown>) => void>()
vi.mock('../../lib/analytics', () => ({
  track: (event: string, props?: Record<string, unknown>) => track(event, props),
}))

// Enlace de co-dueño (issue #707): mockeamos el canje para separar el
// comportamiento del hook (qué hace con éxito/fallo) de la RPC real.
const redeemOwnerInvite = vi.fn<(token: string) => Promise<string>>(async () => 'ABC')
vi.mock('../../lib/ownerInvites', () => ({
  redeemOwnerInvite: (token: string) => redeemOwnerInvite(token),
}))

// useToast exige un <ToastProvider>; el hook solo lo usa para avisar del
// fallback del enlace de co-dueño, así que mockeamos un `show` espiable.
const toastShow = vi.fn()
vi.mock('../../ui', () => ({
  useToast: () => ({ show: toastShow, dismiss: vi.fn() }),
}))

// Observabilidad (issue #760): espiamos reportError/addBreadcrumb para
// comprobar que un viaje borrado (ESPERABLE) deja breadcrumb, NUNCA una
// excepción, mientras que un fallo genérico sí se reporta.
const reportError = vi.fn()
const addBreadcrumb = vi.fn()
vi.mock('../../lib/observability', () => ({
  reportError: (...args: unknown[]) => reportError(...args),
  addBreadcrumb: (...args: unknown[]) => addBreadcrumb(...args),
}))

import { useDeepLinkJoin } from './useDeepLinkJoin'
import { ResourceGoneError } from '../../lib/errors'

beforeEach(() => {
  joinGroup.mockClear()
  joinGroup.mockResolvedValue(undefined)
  isMember.mockClear()
  isMember.mockResolvedValue(false)
  track.mockClear()
  redeemOwnerInvite.mockClear()
  redeemOwnerInvite.mockResolvedValue('ABC')
  toastShow.mockClear()
  reportError.mockClear()
  addBreadcrumb.mockClear()
  window.location.hash = ''
})

describe('useDeepLinkJoin', () => {
  test('destino de grupo: hace join y restaura el hash', async () => {
    const { result } = renderHook(() => useDeepLinkJoin('u1'))
    await result.current('#g=ABC&c=uuid-1')
    expect(joinGroup).toHaveBeenCalledWith('ABC', 'u1')
    expect(window.location.hash).toBe('#g=ABC&c=uuid-1')
  })

  test('destino de grupo sin reto: join y hash solo con grupo', async () => {
    const { result } = renderHook(() => useDeepLinkJoin('u1'))
    await result.current('#g=ABC')
    expect(joinGroup).toHaveBeenCalledWith('ABC', 'u1')
    expect(window.location.hash).toBe('#g=ABC')
  })

  test('destino no-grupo: no hace join y va a la home (hash vacío)', async () => {
    window.location.hash = '#perfil'
    const { result } = renderHook(() => useDeepLinkJoin('u1'))
    await result.current('#perfil')
    expect(joinGroup).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('')
  })

  test('sin userId: no hace join aunque el destino sea de grupo', async () => {
    const { result } = renderHook(() => useDeepLinkJoin(undefined))
    await result.current('#g=ABC')
    expect(joinGroup).not.toHaveBeenCalled()
  })

  test('alta real (no era miembro): trackea group_joined', async () => {
    isMember.mockResolvedValue(false)
    const { result } = renderHook(() => useDeepLinkJoin('u1'))
    await result.current('#g=ABC')
    expect(track).toHaveBeenCalledWith('group_joined', { group_id: 'ABC', is_anonymous: false })
  })

  // Issue #751: receptor sin cuenta (#758) que se une por enlace — sin esta
  // prop no se distingue su alta de la de un usuario con cuenta permanente.
  test('alta real de un receptor ANÓNIMO: group_joined lleva is_anonymous:true', async () => {
    isMember.mockResolvedValue(false)
    const { result } = renderHook(() => useDeepLinkJoin('u1', true))
    await result.current('#g=ABC')
    expect(track).toHaveBeenCalledWith('group_joined', { group_id: 'ABC', is_anonymous: true })
  })

  test('reentrada (ya era miembro): no trackea group_joined', async () => {
    isMember.mockResolvedValue(true)
    const { result } = renderHook(() => useDeepLinkJoin('u1'))
    await result.current('#g=ABC')
    expect(joinGroup).toHaveBeenCalledWith('ABC', 'u1')
    expect(track).not.toHaveBeenCalled()
  })

  // Regresión #556: App.tsx llama joinIfGroup(window.location.hash) en cada
  // remontaje/recarga mientras haya `route.group && user?.id` (Flujo C). Si el
  // hash actual trae `add=reto` (o `add=recuerdo`, `v=marcador`, `from=…`), un F5,
  // la recarga del Service Worker o volver de segundo plano NO debe perder esos
  // parámetros: antes se reescribía a `#g=…(&c=…)` a secas y el router te sacaba
  // del formulario a medio rellenar.
  test('regresión #556: hash con add=reto sobrevive a un remontaje/joinIfGroup', async () => {
    window.location.hash = '#g=ABC&add=reto'
    const { result } = renderHook(() => useDeepLinkJoin('u1'))
    await result.current(window.location.hash)
    expect(joinGroup).toHaveBeenCalledWith('ABC', 'u1')
    expect(window.location.hash).toBe('#g=ABC&add=reto')
  })

  test('regresión #556: hash con add=recuerdo y v=marcador también sobrevive', async () => {
    window.location.hash = '#g=ABC&v=marcador'
    const { result } = renderHook(() => useDeepLinkJoin('u1'))
    await result.current(window.location.hash)
    expect(window.location.hash).toBe('#g=ABC&v=marcador')
  })

  test('regresión #556: reto nacido de un recuerdo (from) sobrevive al remontaje', async () => {
    window.location.hash = '#g=ABC&add=reto&from=momento-1'
    const { result } = renderHook(() => useDeepLinkJoin('u1'))
    await result.current(window.location.hash)
    expect(window.location.hash).toBe('#g=ABC&add=reto&from=momento-1')
  })

  test('restaurar destino guardado (Flujo A/B) con add=reto: se aplica el hash completo', async () => {
    // window.location.hash arranca distinto (p.ej. la home tras volver del email);
    // el destino guardado por setNextDestination SÍ debe aplicarse tal cual.
    window.location.hash = ''
    const { result } = renderHook(() => useDeepLinkJoin('u1'))
    await result.current('#g=ABC&add=reto&from=momento-1')
    expect(joinGroup).toHaveBeenCalledWith('ABC', 'u1')
    expect(window.location.hash).toBe('#g=ABC&add=reto&from=momento-1')
  })

  // Enlace de co-dueño (issue #707): `#g=…&adm=<token>` canjea en vez de dar de
  // alta como miembro normal.
  describe('enlace de co-dueño (adm)', () => {
    test('éxito: canjea el token, NO llama a joinGroup y trackea owner_invite_redeemed', async () => {
      const { result } = renderHook(() => useDeepLinkJoin('u1'))
      await result.current('#g=ABC&adm=tok-1')
      expect(redeemOwnerInvite).toHaveBeenCalledWith('tok-1')
      expect(joinGroup).not.toHaveBeenCalled()
      expect(track).toHaveBeenCalledWith('owner_invite_redeemed', { group_id: 'ABC' })
    })

    test('éxito: el token se CONSUME (no queda `adm` en el hash restaurado)', async () => {
      const { result } = renderHook(() => useDeepLinkJoin('u1'))
      await result.current('#g=ABC&adm=tok-1&add=reto')
      expect(window.location.hash).toBe('#g=ABC&add=reto')
    })

    test('fallo (caducado/usado/inválido): avisa con un toast y cae al alta normal de miembro', async () => {
      redeemOwnerInvite.mockRejectedValue(new Error('Este enlace de co-dueño ya se ha usado'))
      const { result } = renderHook(() => useDeepLinkJoin('u1'))
      await result.current('#g=ABC&adm=tok-1')
      expect(redeemOwnerInvite).toHaveBeenCalledWith('tok-1')
      // Fallback: el camino normal de miembro se ejecuta igual que sin `adm`.
      expect(joinGroup).toHaveBeenCalledWith('ABC', 'u1')
      expect(toastShow).toHaveBeenCalledWith(
        expect.stringContaining('ya se ha usado'),
        expect.objectContaining({ tone: 'danger' }),
      )
      // El token consumido tampoco sobrevive en el hash tras el fallback.
      expect(window.location.hash).toBe('#g=ABC')
    })
  })

  // Issue #760 (LOCATIONGUESSER-5, caso real: 4 usuarios/22 eventos): el viaje
  // se borró entre que se compartió el enlace y que se abrió — el upsert de
  // `joinGroup` viola la FK hacia `groups` y ANTES viajaba como unhandled
  // rejection (no había catch alrededor de esta lógica). Ahora se captura,
  // lleva a la home y NO se reporta como excepción (esperable).
  describe('viaje borrado (issue #760)', () => {
    test('joinGroup rechaza con ResourceGoneError: toast amable + home, sin excepción a Sentry', async () => {
      joinGroup.mockRejectedValue(new ResourceGoneError('Este viaje ya no existe'))
      window.location.hash = '#g=BORRADO'
      const { result } = renderHook(() => useDeepLinkJoin('u1'))
      await result.current('#g=BORRADO')

      expect(window.location.hash).toBe('')
      expect(toastShow).toHaveBeenCalledWith(
        'Este viaje ya no existe',
        expect.objectContaining({ tone: 'neutral' }),
      )
      expect(reportError).not.toHaveBeenCalled()
      expect(addBreadcrumb).toHaveBeenCalledWith(
        'group_gone_on_join',
        expect.objectContaining({ groupId: 'BORRADO' }),
      )
    })

    test('un fallo genérico (no ResourceGoneError) también lleva a home, pero SÍ se reporta', async () => {
      joinGroup.mockRejectedValue(new Error('network down'))
      window.location.hash = '#g=ABC'
      const { result } = renderHook(() => useDeepLinkJoin('u1'))
      await result.current('#g=ABC')

      expect(window.location.hash).toBe('')
      expect(toastShow).toHaveBeenCalledWith(
        expect.stringContaining('No se pudo unir'),
        expect.objectContaining({ tone: 'danger' }),
      )
      expect(reportError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ area: 'deep_link_join', groupId: 'ABC' }),
      )
      expect(addBreadcrumb).not.toHaveBeenCalled()
    })

    test('nunca deja un rechazo sin capturar (la promesa de joinIfGroup siempre resuelve)', async () => {
      joinGroup.mockRejectedValue(new ResourceGoneError('Este viaje ya no existe'))
      const { result } = renderHook(() => useDeepLinkJoin('u1'))
      await expect(result.current('#g=BORRADO')).resolves.toBeUndefined()
    })
  })
})
