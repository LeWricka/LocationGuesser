import { useCallback, useRef, useState } from 'react'
import { IdentityModal } from './IdentityModal'
import { ensurePlayer } from '../../lib/players'
import { getIdentity } from '../../lib/identity'

interface PendingRequest {
  groupId: string
  resolve: (name: string | null) => void
}

interface UseIdentity {
  /**
   * Garantiza un nombre válido para jugar/crear en `groupId`:
   * - Con identidad global y nombre libre/propio en el grupo → devuelve el nombre sin UI.
   * - Sin identidad (navegador limpio) → abre el modal (nombre + PIN).
   * - Colisión (tu nombre global lo tiene otra persona en este grupo) → abre el
   *   modal para elegir otro nombre solo para ese grupo.
   * Resuelve a `null` si el usuario cancela.
   */
  ensureIdentity: (groupId: string) => Promise<string | null>
  /** Modal a montar una vez en el árbol del componente que use el hook. */
  modal: React.ReactNode
}

export function useIdentity(): UseIdentity {
  const [request, setRequest] = useState<PendingRequest | null>(null)
  // Guardamos el resolver fuera del render para que onResolved/onCancel del
  // modal completen la promesa que devolvió ensureIdentity.
  const pendingRef = useRef<PendingRequest | null>(null)

  const openModal = useCallback((groupId: string): Promise<string | null> => {
    return new Promise<string | null>((resolve) => {
      const req: PendingRequest = { groupId, resolve }
      pendingRef.current = req
      setRequest(req)
    })
  }, [])

  const ensureIdentity = useCallback(
    async (groupId: string): Promise<string | null> => {
      const identity = getIdentity()
      if (!identity) return openModal(groupId)

      // Camino rápido: ya hay identidad global. Registramos/reclamamos el nombre
      // en este grupo. Si choca con otra persona, caemos al modal.
      const result = await ensurePlayer({
        groupId,
        name: identity.name,
        clientId: identity.clientId,
        pinHash: identity.pinHash,
      })
      if (result.status === 'wrong-pin') return openModal(groupId)
      return identity.name
    },
    [openModal],
  )

  const finish = useCallback((name: string | null) => {
    pendingRef.current?.resolve(name)
    pendingRef.current = null
    setRequest(null)
  }, [])

  const modal = request ? (
    <IdentityModal
      open
      groupId={request.groupId}
      onResolved={(name) => finish(name)}
      onCancel={() => finish(null)}
    />
  ) : null

  return { ensureIdentity, modal }
}
