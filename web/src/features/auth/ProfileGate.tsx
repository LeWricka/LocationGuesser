// Paso de perfil del primer login (cuentas-y-home.md §2.2): tras volver del email,
// si el usuario aún no tiene un display_name elegido, le pedimos con qué nombre
// juega antes de soltarlo en la home/reto. Wiring sobre `lib/profile`; UI del kit.
//
// El trigger `handle_new_user` crea un perfil provisional, así que `profile`
// puede existir; lo que detecta el "primer login" es la ausencia de un
// display_name escogido (lo decide App vía `needsProfileStep`). Aquí solo
// persistimos el nombre y avisamos al terminar.

import { useState } from 'react'
import { ProfileStep } from '../../ui'
import { upsertProfile } from '../../lib/profile'

interface Props {
  userId: string
  /** Nombre provisional a precargar (el del trigger), si lo hubiera. */
  initialName?: string
  /** Se llama tras guardar el nombre: App refresca el perfil y resuelve destino. */
  onDone: () => void
}

export function ProfileGate({ userId, initialName = '', onDone }: Props) {
  const [displayName, setDisplayName] = useState(initialName)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setError(null)
    const name = displayName.trim()
    if (name.length < 2) {
      setError('Pon al menos 2 caracteres.')
      return
    }
    setLoading(true)
    try {
      await upsertProfile({ id: userId, displayName: name })
      onDone()
    } catch {
      setError('No pudimos guardar tu nombre. Inténtalo de nuevo.')
      setLoading(false)
    }
  }

  return (
    <ProfileStep
      displayName={displayName}
      onDisplayNameChange={setDisplayName}
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
    />
  )
}
