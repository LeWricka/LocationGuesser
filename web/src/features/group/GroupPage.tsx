interface Props {
  groupId: string
}

// STUB — lo implementa el agente de #9/#11/#12 (histórico + ranking + página de grupo).
// Mantener esta firma de props (App.tsx pasa groupId).
export function GroupPage({ groupId }: Props) {
  return (
    <main className="lg-page">
      <p>Histórico del grupo {groupId}…</p>
    </main>
  )
}
