import type { FormEvent } from 'react'
import { Hand } from 'lucide-react'
import { AuthScreen } from './AuthScreen'
import { Button } from './Button'
import { Field } from './Field'
import { Icon } from './Icon'
import { Input } from './Input'
import { Stack } from './Stack'

interface Props {
  /** display_name controlado por el padre (lo persiste #4). */
  displayName: string
  onDisplayNameChange: (value: string) => void
  /** Confirmar el nombre y continuar. */
  onSubmit?: () => void
  loading?: boolean
  error?: string | null
  className?: string
}

// Paso de perfil del primer login (§2.2): el usuario elige el nombre con el que
// juega (display_name global). Presentacional y controlado; el avatar opcional
// es iterable (no bloquea), por eso aquí solo pedimos el nombre.
export function ProfileStep({
  displayName,
  onDisplayNameChange,
  onSubmit,
  loading = false,
  error,
  className,
}: Props) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit?.()
  }

  return (
    <AuthScreen
      className={className}
      icon={<Icon icon={Hand} size={40} />}
      title="¿Con qué nombre juegas?"
      subtitle="Así te verán tus amigos en los rankings. Puedes cambiarlo luego."
    >
      <form onSubmit={handleSubmit} noValidate>
        <Stack gap={4}>
          <Field label="Tu nombre" hideLabel error={error}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                type="text"
                name="display_name"
                autoComplete="nickname"
                placeholder="Lewis"
                value={displayName}
                onChange={(e) => onDisplayNameChange(e.target.value)}
                disabled={loading}
                maxLength={40}
                autoFocus
              />
            )}
          </Field>
          <Button type="submit" size="lg" fullWidth loading={loading}>
            Empezar a jugar
          </Button>
        </Stack>
      </form>
    </AuthScreen>
  )
}
