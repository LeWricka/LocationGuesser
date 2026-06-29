// Popup de entrada passwordless (login/registro = el mismo flujo OTP).
//
// La landing es ahora una portada VISUAL con alma: el campo de email no está a la
// vista. Aparece aquí, en un Modal/hoja inferior elegante, al pulsar el CTA. El
// objetivo es que la entrada se sienta fina y cálida, no un formulario frío de
// primeras.
//
// Reutiliza el hook `useMagicLink` (la misma máquina de estados que LoginFlow y la
// que usaba la landing antes): no se cambia la lógica de auth. Política del hito:
// passwordless puro (cuentas-y-home.md §1.2 y §2) — código de 6 dígitos como vía
// principal, con el enlace del correo como respaldo.
//
// Por qué NO el `EnterCode` del kit aquí: `EnterCode` monta una pantalla completa
// (AuthScreen a 100svh, tarjeta centrada). Dentro del cuerpo de un Modal quedaría
// descolocado. Así que el paso "código" se renderiza compacto, en la propia hoja,
// con el mismo wiring (verify/resend/reset). El `EnterCode` de pantalla completa
// sigue vivo para el flujo de login con sesión (LoginFlow).

import { Button, Field, Input, Modal, Stack } from '../../ui'
import { useMagicLink } from './useMagicLink'
import styles from './LoginPopup.module.css'

interface Props {
  open: boolean
  onClose: () => void
  /**
   * Copy de cabecera distinto cuando se llega por un link de reto (te unes a un
   * viaje) frente a la landing genérica (creas el tuyo). Solo afecta al texto.
   */
  joining?: boolean
  /** URL absoluta de retorno tras el enlace del correo; por defecto el origin. */
  redirectTo?: string
}

export function LoginPopup({ open, onClose, joining = false, redirectTo }: Props) {
  const {
    step,
    email,
    setEmail,
    code,
    setCode,
    loading,
    resending,
    verifying,
    error,
    submit,
    resend,
    verify,
    reset,
  } = useMagicLink({ redirectTo })

  // El título de la hoja "canta" en serif (lo pone el Modal). El cuerpo cambia
  // entre pedir el correo y meter el código, sin cerrar la hoja: la transición es
  // dentro del mismo popup, más suave que saltar de pantalla.
  const onEmail = step === 'email'

  const title = onEmail
    ? joining
      ? 'Entra y vive el viaje'
      : 'Empieza a compartir'
    : 'Mira tu correo'

  return (
    <Modal open={open} onClose={onClose} title={title}>
      {onEmail ? (
        <form
          className={styles.form}
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <Stack gap={4}>
            <p className={styles.lead}>
              Sin contraseñas. Te mandamos un código al correo para{' '}
              <strong>entrar o crear tu cuenta</strong>; es el mismo paso para ambos.
            </p>
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
                  // El usuario abrió la hoja para teclear su correo: foco directo.
                  autoFocus
                />
              )}
            </Field>
            <Button type="submit" size="lg" fullWidth loading={loading}>
              Enviarme el código
            </Button>
            <p className={styles.note}>Llega en segundos. Revisa spam si tarda.</p>
          </Stack>
        </form>
      ) : (
        <form
          className={styles.form}
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void verify()
          }}
        >
          <Stack gap={4}>
            <p className={styles.lead}>
              Mandamos un correo a <strong className={styles.email}>{email}</strong>. Escribe el
              código o pulsa el enlace del correo para entrar.
            </p>
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
                  // Solo dígitos y como mucho 6: evita pegar espacios/guiones.
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  disabled={verifying}
                  autoFocus
                />
              )}
            </Field>
            <Button type="submit" size="lg" fullWidth loading={verifying}>
              Entrar
            </Button>
            <div className={styles.codeFooter}>
              <span className={styles.note}>¿No te llega?</span>
              <div className={styles.codeActions}>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void resend()}
                  loading={resending}
                >
                  Reenviar
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={reset}>
                  Cambiar correo
                </Button>
              </div>
            </div>
          </Stack>
        </form>
      )}
    </Modal>
  )
}
