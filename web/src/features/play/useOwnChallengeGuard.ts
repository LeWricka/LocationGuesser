import { useCallback, useState } from 'react'
import type { ChallengeForPlay } from '../../lib/challenges'

interface CheckOwnOptions {
  /** Se consulta DESPUÉS del await, para no `setState` tras un unmount/carrera
   * (el mismo patrón que ya usaba cada componente con su `cancelled` local). */
  isCancelled?: () => boolean
}

export interface UseOwnChallengeGuardResult {
  /** Recuento de votos ya emitidos en un reto propio; null hasta resolver o si
   * el reto comprobado no era propio. */
  ownVoteCount: number | null
  /**
   * Comprueba si `challenge` es del usuario `userId`. Si lo es, dispara
   * `fetchVotes` para el recuento (mostrado en el estado "es tuyo") y deja el
   * resultado en `ownVoteCount`. Devuelve `true` cuando el llamador debe cortar
   * el resto de la carga (fase `own`: no seguir mirando votos propios,
   * respuesta, etc.).
   */
  checkOwn: (
    challenge: ChallengeForPlay,
    userId: string | undefined,
    options?: CheckOwnOptions,
  ) => Promise<boolean>
}

/**
 * Guarda defensiva "es tuyo" (#509): el creador de un reto no debe poder
 * jugarlo, ni aunque llegue por un enlace directo. Antes vivía duplicada línea
 * a línea en PlayChallenge y PlayNumberChallenge (#579); aquí se comparte.
 *
 * `fetchVotes` es la consulta propia de cada tipo de reto (getVotes para
 * lugar, getVotesWithNames para número): solo se llama cuando el reto SÍ es
 * propio, así el camino normal (reto ajeno) no paga una consulta de más.
 *
 * Se expone como `checkOwn` (en vez de un efecto interno) para que el
 * llamador pueda `await`arlo DENTRO de su propio `load()` secuencial y cortar
 * antes de seguir con el resto de la carga (p.ej. no llamar a
 * `getExistingVote` en un reto propio) — igual que hacía el código duplicado.
 */
export function useOwnChallengeGuard(
  fetchVotes: (challengeId: string) => Promise<unknown[]>,
): UseOwnChallengeGuardResult {
  const [ownVoteCount, setOwnVoteCount] = useState<number | null>(null)

  const checkOwn = useCallback(
    async (challenge: ChallengeForPlay, userId: string | undefined, options?: CheckOwnOptions) => {
      if (!userId || challenge.created_by !== userId) return false
      try {
        const votes = await fetchVotes(challenge.id)
        if (!options?.isCancelled?.()) setOwnVoteCount(votes.length)
      } catch {
        // Sin recuento: el estado se muestra igual, sin la cifra.
      }
      return true
    },
    [fetchVotes],
  )

  return { ownVoteCount, checkOwn }
}
