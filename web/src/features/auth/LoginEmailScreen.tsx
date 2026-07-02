// Pantalla de LOGIN para quien ya tiene cuenta (email solamente, sin nombre).
//
// Flujo: formulario email → submit → magic link enviado (estado 'sent') o email
// no encontrado (estado 'not-found'). La lógica vive en useLogin; aquí solo UI.
//
// Diferencia respecto a EnterScreen (alta + baja fricción):
//   - Solo pide EMAIL (no el nombre): quien ya tiene cuenta no tiene que reescribir
//     su nombre.
//   - Usa shouldCreateUser:false en Supabase → no crea usuario si el email no existe.
//   - Al volver del enlace: perfil existe con display_name → ProfileGate NO aparece.
//
// Se comparte el mismo ShellUtilitario y los tokens del sistema. Sin colores propios.

import { AppHeader, Button, Field, Input, Logo, Stack } from '../../ui'
import { ShellUtilitario } from '../../ui/shells'
import { useLogin } from './useLogin'
import styles from './EnterScreen.module.css'

interface Props {
  /** URL de retorno tras el enlace del email; por defecto el origin actual. */
  redirectTo?: string
  /** Volver atrás (a la landing). */
  onBack?: () => void
  /** Ir al flujo de alta (EnterScreen) — cuando el email no tiene cuenta. */
  onSignUp?: () => void
}

export function LoginEmailScreen({ redirectTo, onBack, onSignUp }: Props) {
  const { step, email, setEmail, loading, error, submit, reset } = useLogin({ redirectTo })

  const onForm = step === 'form'

  return (
    <ShellUtilitario
      header={
        onBack ? (
          <AppHeader variant="plain" lead="back" onLead={onBack} leadLabel="Atrás" />
        ) : undefined
      }
      footer={
        onForm ? (
          <Button type="submit" form="login-form" size="lg" fullWidth loading={loading}>
            Enviarme el enlace
          </Button>
        ) : undefined
      }
    >
      {onForm && (
        <div className={styles.content}>
          <div className={styles.hero}>
            <span className={styles.logoWrap} aria-label="Tabide">
              <Logo variant="wordmark" size={28} />
            </span>
            <h1 className={['t-display', styles.headline].join(' ')}>Bienvenido de vuelta</h1>
            <p className={['t-body', styles.lead].join(' ')}>
              Escribe tu correo y te mandamos un enlace para entrar. Sin contraseña.
            </p>
          </div>

          <form
            id="login-form"
            className={styles.form}
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
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
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  autoFocus
                />
              )}
            </Field>
          </form>

          <p className={['t-label', styles.note].join(' ')}>
            Sin contraseña · Llega en segundos · Revisa spam si tarda
          </p>
        </div>
      )}

      {step === 'sent' && (
        <div className={styles.recover}>
          <div className={styles.hero}>
            <span className={styles.logoWrap} aria-label="Tabide">
              <Logo variant="wordmark" size={28} />
            </span>
            <h1 className={['t-display', styles.headline].join(' ')}>Revisa tu correo</h1>
            <p className={['t-body', styles.lead].join(' ')}>
              Te hemos mandado un enlace a{' '}
              <strong className={styles.emailHighlight}>{email}</strong>. Ábrelo y entras
              directamente, sin contraseña.
            </p>
            <p className={['t-label', styles.note].join(' ')}>
              Llega en segundos. Revisa spam si tarda.
            </p>
          </div>
          <Button variant="secondary" size="lg" fullWidth onClick={reset}>
            Usar otro correo
          </Button>
        </div>
      )}

      {step === 'not-found' && (
        <div className={styles.recover}>
          <div className={styles.hero}>
            <span className={styles.logoWrap} aria-label="Tabide">
              <Logo variant="wordmark" size={28} />
            </span>
            <h1 className={['t-display', styles.headline].join(' ')}>No encontramos esa cuenta</h1>
            <p className={['t-body', styles.lead].join(' ')}>
              No hay ninguna cuenta con <strong className={styles.emailHighlight}>{email}</strong>.
              ¿Quieres crear una?
            </p>
          </div>
          <Stack gap={3}>
            {onSignUp && (
              <Button size="lg" fullWidth onClick={onSignUp}>
                Crear cuenta
              </Button>
            )}
            <Button variant="secondary" size="lg" fullWidth onClick={reset}>
              Probar con otro correo
            </Button>
          </Stack>
        </div>
      )}
    </ShellUtilitario>
  )
}
