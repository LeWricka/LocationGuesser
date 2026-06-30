import { useState } from 'react'
import { CreateChallengeKindPicker } from './CreateChallengeKindPicker'
import { CreateChallengeImmersive } from './CreateChallengeImmersive'
import { CreateNumberChallenge } from './CreateNumberChallenge'
import type { ChallengeForPlay, ChallengeKind } from '../../lib/challenges'

interface Props {
  groupId: string
  groupName?: string | null
  /** Sale del flujo de crear (cancelar / atrás desde el selector). */
  onBack: () => void
  /** Reto creado (de cualquier tipo): el viaje vuelve a la lista y ofrece su enlace. */
  onCreated: (challenge: ChallengeForPlay) => void
}

// Entrada de "crear reto" (#323): primero el selector de TIPO (¿Dónde es? /
// ¿Cuánto?), luego el asistente propio de cada tipo. Mantiene el flujo de lugar
// (CreateChallengeImmersive) intacto; el de número (CreateNumberChallenge) es su
// hermano sin mapa. Atrás desde un asistente vuelve al selector, no sale del todo.
export function CreateChallengeFlow({ groupId, groupName, onBack, onCreated }: Props) {
  const [kind, setKind] = useState<ChallengeKind | null>(null)

  if (kind == null) {
    return <CreateChallengeKindPicker groupName={groupName} onBack={onBack} onPick={setKind} />
  }

  if (kind === 'number') {
    return (
      <CreateNumberChallenge
        groupId={groupId}
        groupName={groupName}
        onBack={() => setKind(null)}
        onCreated={onCreated}
      />
    )
  }

  return (
    <CreateChallengeImmersive
      groupId={groupId}
      groupName={groupName}
      onBack={() => setKind(null)}
      onCreated={onCreated}
    />
  )
}
