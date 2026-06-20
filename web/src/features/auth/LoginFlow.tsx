// Flujo de login con magic link, sin sesión (cuentas-y-home.md §2.2, flujos A y B).
// Máquina de estados de dos pantallas presentacionales del kit: LoginScreen
// (pide email) → CheckEmail (revisa tu correo). Aquí va la lógica/wiring sobre
// `lib/auth`; la UI viene del kit. Al pulsar el enlace del email el usuario
// vuelve con sesión y AuthProvider repinta: este componente ya no se monta.

import { useState } from 'react'
import { CheckEmail, LoginScreen } from '../../ui'
import { signInWithMagicLink } from '../../lib/auth'

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

type Step = 'email' | 'sent'

// Validación mínima en cliente: un email vacío o sin "@" no merece ir a Supabase.
function isValidEmail(value: string): boolean {
  return /.+@.+\..+/.test(value.trim())
}

export function LoginFlow({ groupName, redirectTo }: Props) {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(): Promise<boolean> {
    setError(null)
    if (!isValidEmail(email)) {
      setError('Escribe un correo válido.')
      return false
    }
    try {
      // No mandamos display_name aquí: el nombre se elige en el paso de perfil al
      // volver (ProfileStep). El trigger crea un perfil provisional.
      await signInWithMagicLink(email.trim(), undefined, redirectTo)
      return true
    } catch {
      setError('No pudimos enviar el enlace. Inténtalo de nuevo.')
      return false
    }
  }

  async function handleSubmit() {
    setLoading(true)
    const ok = await send()
    setLoading(false)
    if (ok) setStep('sent')
  }

  async function handleResend() {
    setResending(true)
    await send()
    setResending(false)
  }

  if (step === 'sent') {
    return (
      <CheckEmail
        email={email}
        resending={resending}
        onResend={handleResend}
        onChangeEmail={() => {
          setStep('email')
          setError(null)
        }}
      />
    )
  }

  return (
    <LoginScreen
      email={email}
      onEmailChange={setEmail}
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
      groupName={groupName}
    />
  )
}
