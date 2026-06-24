// Flujo de login con magic link, sin sesión (cuentas-y-home.md §2.2, flujos A y B).
// Máquina de estados de dos pantallas presentacionales del kit: LoginScreen
// (pide email) → CheckEmail (revisa tu correo). La lógica/wiring vive en el hook
// `useMagicLink` (compartido con la landing pública); aquí solo conectamos esa
// lógica a la UI del kit. Al pulsar el enlace del email el usuario vuelve con
// sesión y AuthProvider repinta: este componente ya no se monta.

import { CheckEmail, LoginScreen } from '../../ui'
import { useMagicLink } from './useMagicLink'

interface Props {
  /**
   * Nombre del grupo cuando se llega por un link de reto (flujo A): cambia el
   * copy a "Únete para jugar este reto". Sin él, login a secas (flujo B).
   */
  groupName?: string
  /**
   * A dónde debe volver el usuario tras el email. El destino deep-link ya se ha
   * guardado en `lg.next` por el router; este `redirectTo` es la URL absoluta de
   * retorno (origin), por defecto el origin actual.
   */
  redirectTo?: string
}

export function LoginFlow({ groupName, redirectTo }: Props) {
  const { step, email, setEmail, loading, resending, error, submit, resend, reset } = useMagicLink({
    redirectTo,
  })

  if (step === 'sent') {
    return (
      <CheckEmail email={email} resending={resending} onResend={resend} onChangeEmail={reset} />
    )
  }

  return (
    <LoginScreen
      email={email}
      onEmailChange={setEmail}
      onSubmit={submit}
      loading={loading}
      error={error}
      groupName={groupName}
    />
  )
}
