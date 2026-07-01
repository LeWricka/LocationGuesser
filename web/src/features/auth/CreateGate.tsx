// Gate de "crear viaje" para usuarios con email PENDIENTE de validar (issue #438).
// Ver/jugar/unirse va sin validar; CREAR exige email validado. Un usuario anónimo
// (recién entrado, correo sin confirmar) que intenta crear ve esta pantalla en vez
// del asistente: "valida tu correo" + reenviar el correo + volver. La seguridad
// real la impone la RLS (groups_insert_owner exige is_anonymous=false); esto es la
// cara amable en cliente para no dejar al usuario chocar contra un error de BD.
//
// Cuando el usuario valida (pulsa el enlace del correo), onAuthStateChange repinta
// con la cuenta permanente: App deja de montar este gate y muestra el asistente.

import { useState } from 'react'
import { MailCheck } from 'lucide-react'
import { AuthScreen, BackHomeButton, Button, Icon, Stack, useToast } from '../../ui'
import { resendEmailValidation } from '../../lib/auth'

interface Props {
  /** Correo pendiente de validar (se muestra para que el usuario lo reconozca). */
  email?: string | null
  /** Volver a la home (no dejar la pantalla sin salida). */
  onBack: () => void
}

export function CreateGate({ email, onBack }: Props) {
  const [resending, setResending] = useState(false)
  const toast = useToast()

  async function handleResend() {
    setResending(true)
    try {
      await resendEmailValidation()
      toast.show('Te reenviamos el enlace. Revisa tu correo (y el spam).', { tone: 'success' })
    } catch {
      toast.show('No pudimos reenviar el correo. Inténtalo de nuevo.', { tone: 'danger' })
    } finally {
      setResending(false)
    }
  }

  return (
    <AuthScreen
      header={<BackHomeButton onClick={onBack} />}
      icon={<Icon icon={MailCheck} size={40} />}
      title="Valida tu correo para crear tu viaje"
      subtitle={
        email ? (
          <>
            Te mandamos un enlace a <strong>{email}</strong>. Ábrelo y podrás crear tus viajes. Ver
            y jugar no necesita validación.
          </>
        ) : (
          'Te mandamos un enlace a tu correo. Ábrelo y podrás crear tus viajes. Ver y jugar no necesita validación.'
        )
      }
    >
      <Stack gap={3}>
        <Button size="lg" fullWidth loading={resending} onClick={handleResend}>
          Reenviar correo
        </Button>
        <Button variant="ghost" size="lg" fullWidth onClick={onBack}>
          Volver
        </Button>
      </Stack>
    </AuthScreen>
  )
}
