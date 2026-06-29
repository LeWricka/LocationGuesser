import type { ChangeEvent, FormEvent } from 'react'
import { AuthScreen } from './AuthScreen'
import { BackHomeButton } from './BackHomeButton'
import { Button } from './Button'
import { Field } from './Field'
import { Input } from './Input'
import { Row } from './Row'
import { Stack } from './Stack'
import styles from './EnterCode.module.css'

interface Props {
  /** Email al que se envió el código (se muestra para que el usuario confirme). */
  email: string
  /** Código de 6 dígitos, controlado por el padre. */
  code: string
  onCodeChange: (value: string) => void
  /** Verificar el código. Recibe el submit ya con preventDefault hecho. */
  onSubmit?: () => void
  /** Reenviar el email (código + enlace). */
  onResend?: () => void
  /** Volver a la pantalla de email para cambiar el correo. */
  onChangeEmail?: () => void
  /** Verificación en curso (bloquea el botón de entrar). */
  verifying?: boolean
  /** Reenvío en curso (deshabilita el botón de reenviar). */
  resending?: boolean
  /** Mensaje de error de validación/verificación. */
  error?: string | null
  className?: string
}

// Pantalla "introduce el código" tras pedir el email (§2.2). El email lleva un
// código de 6 dígitos Y un enlace mágico: aquí ofrecemos el código como vía
// principal y recordamos que el enlace del email también entra (fallback, por si
// la plantilla aún no incluye el código). Presentacional y controlada.
//
// "Volver" obligatorio: no puede ser un callejón sin salida. El control de
// cabecera (← Cambiar correo) reutiliza `onChangeEmail` para regresar al email.
export function EnterCode({
  email,
  code,
  onCodeChange,
  onSubmit,
  onResend,
  onChangeEmail,
  verifying = false,
  resending = false,
  error,
  className,
}: Props) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    // Solo dígitos y como mucho 6: evita pegar espacios/guiones del email.
    onCodeChange(event.target.value.replace(/\D/g, '').slice(0, 6))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit?.()
  }

  return (
    <AuthScreen
      className={className}
      icon="📬"
      title="Mira tu correo"
      header={onChangeEmail && <BackHomeButton onClick={onChangeEmail} label="Cambiar correo" />}
      subtitle={
        <>
          Mandamos un correo a <strong className={styles.email}>{email}</strong>. Escribe el código
          o pulsa el enlace del correo para entrar.
        </>
      }
      footer={
        <Stack gap={2} align="center">
          <span>¿No te llega?</span>
          <Row gap={2} justify="center" wrap>
            <Button variant="secondary" size="sm" onClick={onResend} loading={resending}>
              Reenviar
            </Button>
            <Button variant="ghost" size="sm" onClick={onChangeEmail}>
              Cambiar email
            </Button>
          </Row>
        </Stack>
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        <Stack gap={4}>
          <Field label="Código de 6 dígitos" error={error}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                type="text"
                name="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                placeholder="123456"
                className={styles.code}
                value={code}
                onChange={handleChange}
                disabled={verifying}
                // Foco directo al aterrizar: el usuario llega aquí para teclear.
                autoFocus
              />
            )}
          </Field>
          <Button type="submit" size="lg" fullWidth loading={verifying}>
            Entrar
          </Button>
          <p className={styles.note}>El código caduca pronto; úsalo cuanto antes.</p>
        </Stack>
      </form>
    </AuthScreen>
  )
}
