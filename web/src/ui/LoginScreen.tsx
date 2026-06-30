import type { FormEvent } from 'react'
import { MapPin } from 'lucide-react'
import { AuthScreen } from './AuthScreen'
import { Button } from './Button'
import { Field } from './Field'
import { Icon } from './Icon'
import { Input } from './Input'
import { Stack } from './Stack'
import styles from './LoginScreen.module.css'

interface Props {
  /** Email controlado por el padre (la lógica de auth la cablea #4). */
  email: string
  onEmailChange: (value: string) => void
  /** Enviar el email (código + enlace). Recibe el submit ya con preventDefault hecho. */
  onSubmit?: () => void
  /** Bloquea el botón mientras se envía. */
  loading?: boolean
  /** Mensaje de error de validación/envío. */
  error?: string | null
  /**
   * Contexto de grupo cuando se entra por un link de reto (flujo A §2.2):
   * cambia el copy a "Únete para jugar este reto" y muestra el nombre del grupo.
   */
  groupName?: string
  className?: string
}

// Pantalla de login passwordless (§2): el usuario mete su email y le mandamos un
// código (y un enlace como fallback). Presentacional y controlada: sin llamadas a
// Supabase Auth (eso lo hace el hook). Dos copys según haya o no contexto de grupo.
export function LoginScreen({
  email,
  onEmailChange,
  onSubmit,
  loading = false,
  error,
  groupName,
  className,
}: Props) {
  const joining = Boolean(groupName)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit?.()
  }

  return (
    <AuthScreen
      className={className}
      icon={<Icon icon={MapPin} size={40} />}
      title={joining ? 'Únete para jugar este reto' : 'Entra a Lugares'}
      subtitle={
        joining ? (
          <>
            Te han retado en <strong className={styles.group}>{groupName}</strong>. Te mandamos un
            código a tu correo para entrar. Sin contraseñas.
          </>
        ) : (
          'Te mandamos un código a tu correo para entrar. Sin contraseñas.'
        )
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        <Stack gap={4}>
          <Field label="Tu correo" error={error}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                type="email"
                name="email"
                inputMode="email"
                autoComplete="email"
                placeholder="tucorreo@ejemplo.com"
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                disabled={loading}
              />
            )}
          </Field>
          <Button type="submit" size="lg" fullWidth loading={loading}>
            Empieza a compartir
          </Button>
        </Stack>
      </form>
    </AuthScreen>
  )
}
