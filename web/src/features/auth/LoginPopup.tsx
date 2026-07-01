// Hoja de ENTRADA de baja fricción (issue #438): nombre + email → DENTRO al
// instante, sin esperar ni pegar código. Sustituye al flujo email→código como
// entrada principal. La validación del correo es DIFERIDA: entras ya (sesión
// anónima con email pendiente) y validas luego pulsando el enlace del correo (lo
// exige "crear viaje", no ver/jugar/unirse).
//
// La landing es una portada VISUAL: el formulario no está a la vista, aparece aquí
// en un Modal/hoja inferior al pulsar el CTA. Reutiliza el hook `useEnter` (la
// máquina de estados de la entrada). El flujo OTP/magic link (useMagicLink,
// LoginFlow, EnterCode) NO desaparece: es la vía de RECUPERACIÓN, que este mismo
// popup dispara cuando el email ya pertenece a una cuenta (estado 'recover').

import { Button, Field, Input, Modal, Stack } from '../../ui'
import { useEnter } from './useEnter'
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
  const { step, name, setName, email, setEmail, loading, error, submit, reset } = useEnter({
    redirectTo,
  })

  // El título "canta" en serif (lo pone el Modal). Cambia entre el formulario de
  // entrada y el aviso de recuperación (email ya registrado).
  const onForm = step === 'form'
  const title = onForm
    ? joining
      ? 'Entra y vive el viaje'
      : 'Empieza a compartir'
    : 'Revisa tu correo'

  return (
    <Modal open={open} onClose={onClose} title={title}>
      {onForm ? (
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
              Sin contraseñas. Pon tu nombre y tu correo y <strong>entra al momento</strong>. Te
              mandaremos un enlace para validar el correo.
            </p>
            <Field label="Tu nombre">
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  type="text"
                  name="display_name"
                  autoComplete="nickname"
                  placeholder="Lewis"
                  maxLength={40}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                  autoFocus
                />
              )}
            </Field>
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
                />
              )}
            </Field>
            <Button type="submit" size="lg" fullWidth loading={loading}>
              {joining ? 'Únete al viaje' : 'Entrar'}
            </Button>
            <p className={styles.note}>Entras al instante; validas el correo cuando quieras.</p>
          </Stack>
        </form>
      ) : (
        // Estado 'recover': el email ya era de una cuenta. NO lo enlazamos a un anónimo
        // nuevo: mandamos un enlace para recuperar la cuenta original (no se pierde nada).
        <div className={styles.form}>
          <Stack gap={4}>
            <p className={styles.lead}>
              Ese correo ya tiene una cuenta. Te hemos mandado un enlace a{' '}
              <strong className={styles.email}>{email}</strong> para recuperarla: ábrelo y entrarás
              con tu cuenta de siempre.
            </p>
            <p className={styles.note}>Llega en segundos. Revisa spam si tarda.</p>
            <Button type="button" variant="secondary" size="lg" fullWidth onClick={reset}>
              Usar otro correo
            </Button>
          </Stack>
        </div>
      )}
    </Modal>
  )
}
