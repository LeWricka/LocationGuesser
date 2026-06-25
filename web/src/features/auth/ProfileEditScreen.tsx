// Pantalla de perfil (`#perfil`, cuentas-y-home.md §3.1/§3.5): editar el
// display_name, elegir avatar (animal del set) y cerrar sesión. Wiring sobre
// `lib/profile` y `lib/auth`; UI del kit.

import { useState } from 'react'
import { AuthScreen, Avatar, BackHomeButton, Button, Field, Input, Stack, useToast } from '../../ui'
import { upsertProfile } from '../../lib/profile'
import { signOut } from '../../lib/auth'
import { PushNotificationsControl } from './PushNotificationsControl'
import { ANIMAL_EMOJIS, avatarToken, parseAvatar } from '../../lib/avatar'
import { track } from '../../lib/analytics'
import type { Profile } from '../../lib/database.types'
import styles from './ProfileEditScreen.module.css'

interface Props {
  userId: string
  profile: Profile | null
  /** Vuelve a leer el perfil de BD tras guardar (del SessionContext). */
  onSaved: () => Promise<void> | void
  /** Volver a la home. */
  onBack: () => void
}

export function ProfileEditScreen({ userId, profile, onSaved, onBack }: Props) {
  const toast = useToast()
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  // Avatar elegido (token `emoji:<char>` o el del perfil). Estado local para
  // que el selector y la previsualización respondan al instante.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Emoji actualmente seleccionado (para marcarlo en el grid). Si el perfil aún
  // no tiene animal explícito, se resalta el animal por defecto del id.
  const current = parseAvatar(avatarUrl, userId)
  const selectedEmoji = current.kind === 'emoji' ? current.emoji : null

  function chooseEmoji(emoji: string) {
    setAvatarUrl(avatarToken(emoji))
    setSaved(false)
  }

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
      await upsertProfile({ id: userId, displayName: name, avatarUrl })
      track('avatar_changed', { has_emoji: avatarUrl?.startsWith('emoji:') ?? false })
      await onSaved()
      setSaved(true)
      toast.show('Perfil guardado', { tone: 'success' })
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
      icon={<Avatar userId={userId} name={displayName} avatarUrl={avatarUrl} size="lg" />}
      title="Tu perfil"
      subtitle="Cambia tu nombre, elige tu animal o cierra sesión."
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

          <fieldset className={styles.picker}>
            <legend className={styles.pickerLegend}>Tu animal</legend>
            <div className={styles.grid} role="radiogroup" aria-label="Elige tu animal">
              {ANIMAL_EMOJIS.map((emoji) => {
                const isSelected = emoji === selectedEmoji
                return (
                  <button
                    key={emoji}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={`Animal ${emoji}`}
                    className={`${styles.option} ${isSelected ? styles.selected : ''}`}
                    onClick={() => chooseEmoji(emoji)}
                    disabled={loading}
                  >
                    <Avatar userId={userId} avatarUrl={avatarToken(emoji)} size="md" />
                  </button>
                )
              })}
            </div>
          </fieldset>

          <Button type="submit" size="lg" fullWidth loading={loading}>
            {saved ? 'Guardado ✓' : 'Guardar'}
          </Button>

          {/* Avisos del grupo (PWA): control aparte del guardado del perfil. Solo
              se renderiza si el navegador soporta push y hay VAPID configurada. */}
          <PushNotificationsControl userId={userId} />
        </Stack>
      </form>
    </AuthScreen>
  )
}
