// Flujo de login passwordless email-first (issue #506, modelo unificado).
// Un único flujo sirve para nuevo y recurrente: email → código OTP → sesión.
// Tras la sesión, App detecta si el perfil ya tiene nombre (→ HOME directo) o
// no (→ paso de nombre → HOME). No hay separación signup/login.
//
// Máquina de dos pantallas presentacionales del kit: LoginScreen (pide email) →
// EnterCode (introduce el código de 6 dígitos). La lógica/wiring vive en el hook
// `useMagicLink`; aquí solo conectamos esa lógica a la UI del kit.
//
// El email lleva el código Y un enlace mágico (fallback): si el usuario pulsa el
// enlace en vez de teclear el código, vuelve con sesión y AuthProvider repinta;
// este componente ya no se monta. La vía de código no rompe ese camino.

import { EnterCode, LoginScreen } from '../../ui'
import { useMagicLink } from './useMagicLink'

interface Props {
  /**
   * Nombre del grupo cuando se llega por un link de reto (flujo A): cambia el
   * copy a "Únete para jugar este reto". Sin él, login a secas (flujo B).
   */
  groupName?: string
  /**
   * A dónde debe volver el usuario tras pulsar el enlace del email. El destino
   * deep-link ya se guardó en `lg.next` por el router; este `redirectTo` es la URL
   * absoluta de retorno (origin), por defecto el origin actual.
   */
  redirectTo?: string
  /**
   * Vuelve atrás desde la pantalla de email (p.ej. a la landing). Si no se pasa,
   * el botón de volver no aparece en la primera pantalla.
   */
  onBack?: () => void
}

export function LoginFlow({ groupName, redirectTo, onBack }: Props) {
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

  if (step === 'code') {
    return (
      <EnterCode
        email={email}
        code={code}
        onCodeChange={setCode}
        onSubmit={verify}
        onResend={resend}
        onChangeEmail={reset}
        verifying={verifying}
        resending={resending}
        error={error}
      />
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
      onBack={onBack}
    />
  )
}
