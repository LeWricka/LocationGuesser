import { Mail } from 'lucide-react'
import { AuthScreen } from './AuthScreen'
import { BackHomeButton } from './BackHomeButton'
import { Button } from './Button'
import { Icon } from './Icon'
import { Row } from './Row'
import { Stack } from './Stack'
import styles from './CheckEmail.module.css'

interface Props {
  /** Email al que se envió el enlace (se muestra para que el usuario confirme). */
  email: string
  /** Reenviar el enlace. */
  onResend?: () => void
  /** Volver a la pantalla de login para cambiar el email. */
  onChangeEmail?: () => void
  /** Reenvío en curso (deshabilita el botón). */
  resending?: boolean
  className?: string
}

// Pantalla "revisa tu correo" tras pedir el enlace mágico (§2.2). Copy claro,
// reenviar y cambiar email visibles. Presentacional.
//
// "Volver" obligatorio: esta pantalla NO puede ser un callejón sin salida. El
// control de cabecera (← Cambiar correo) reutiliza `onChangeEmail` para regresar
// al paso de email, que es el inicio del flujo de login.
export function CheckEmail({
  email,
  onResend,
  onChangeEmail,
  resending = false,
  className,
}: Props) {
  return (
    <AuthScreen
      className={className}
      icon={<Icon icon={Mail} size={40} />}
      title="Mira tu correo"
      header={onChangeEmail && <BackHomeButton onClick={onChangeEmail} label="Cambiar correo" />}
      subtitle={
        <>
          Pulsa el enlace que mandamos a <strong className={styles.email}>{email}</strong> para
          entrar. Revisa también la carpeta de spam.
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
      <p className={styles.note}>El enlace caduca pronto, ábrelo cuanto antes.</p>
    </AuthScreen>
  )
}
