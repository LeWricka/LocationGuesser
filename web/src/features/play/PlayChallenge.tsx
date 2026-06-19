interface Props {
  challengeId: string
  groupId?: string
}

// STUB — lo implementa el agente de #6/#7 (jugar + revelar).
// Mantener esta firma de props (App.tsx pasa challengeId y groupId).
export function PlayChallenge({ challengeId }: Props) {
  return (
    <main className="lg-page">
      <p>Cargando reto {challengeId}…</p>
    </main>
  )
}
