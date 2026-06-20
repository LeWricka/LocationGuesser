// Pantalla de perfil (`#perfil`, cuentas-y-home.md §3.1/§3.5): editar el
// display_name y cerrar sesión. Avatar opcional iterable (de momento solo
// inicial). Wiring sobre `lib/profile` y `lib/auth`; UI del kit.

import { useState } from 'react'
import { AuthScreen, Avatar, BackHomeButton, Button, Field, Input, Stack } from '../../ui'
import { upsertProfile } from '../../lib/profile'
import { signOut } from '../../lib/auth'
import type { Profile } from '../../lib/database.types'

interface Props {
  userId: string
  profile: Profile | null
  /** Vuelve a leer el perfil de BD tras guardar (del SessionContext). */
  onSaved: () => Promise<void> | void
  /** Volver a la home. */
  onBack: () => void
}

export function ProfileEditScreen({ userId, profile, onSaved, onBack }: Props) {
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setError(null)
    setSaved(false)
    const name = displayName.trim()
    if (name.length < 2) {
      setError('Pon al menos 2 caracteres.')
      return
    }
    setLoading(true)
    try {
      await upsertProfile({ id: userId, displayName: name })
      await onSaved()
      setSaved(true)
    } catch {
      setError('No pudimos guardar los cambios.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSignOut() {
    // signOut dispara onAuthStateChange → AuthProvider limpia la sesión y el
    // router cae al login. No navegamos a mano.
    await signOut()
  }

  return (
    <AuthScreen
      icon={<Avatar name={displayName || '?'} src={profile?.avatar_url} size="lg" />}
      title="Tu perfil"
      subtitle="Cambia tu nombre o cierra sesión."
      footer={
        <Stack gap={3} align="center">
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            Cerrar sesión
          </Button>
          <BackHomeButton onClick={onBack} />
        </Stack>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void handleSave()
        }}
        noValidate
      >
        <Stack gap={4}>
          <Field label="Tu nombre" error={error}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                type="text"
                name="display_name"
                autoComplete="nickname"
                placeholder="Lewis"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value)
                  setSaved(false)
                }}
                disabled={loading}
                maxLength={40}
              />
            )}
          </Field>
          <Button type="submit" size="lg" fullWidth loading={loading}>
            {saved ? 'Guardado ✓' : 'Guardar'}
          </Button>
        </Stack>
      </form>
    </AuthScreen>
  )
}
