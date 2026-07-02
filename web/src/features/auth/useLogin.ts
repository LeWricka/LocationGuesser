// Lógica del login para quien YA TIENE CUENTA (email solamente, sin nombre).
// Sin UI: el hook maneja los estados y delega en lib/auth.signInExistingUser.
//
// Flujo: pide solo el email → llama a signInExistingUser (shouldCreateUser:false)
//   → si la cuenta existe, se manda magic link → estado 'sent' (muestra aviso)
//   → el usuario pulsa el enlace en su correo → sesión → AuthProvider repinta
//   → App lleva a la home SIN pasar por ProfileGate (el perfil ya tiene nombre).
//
// Si el email NO existe → estado 'not-found' → la UI ofrece ir al alta.
// Cualquier error de red se propaga para que la UI lo muestre.

import { useState } from 'react'
import { signInExistingUser } from '../../lib/auth'

// Estados visibles del flujo de login.
export type LoginStep =
  | 'form' // formulario de email
  | 'sent' // magic link enviado → avisa al usuario
  | 'not-found' // el email no tiene cuenta → sugiere alta

interface Options {
  /** URL de retorno tras el enlace del email; por defecto el origin actual. */
  redirectTo?: string
}

export interface Login {
  step: LoginStep
  email: string
  setEmail: (value: string) => void
  loading: boolean
  error: string | null
  /** Envía el magic link (o pasa a 'not-found' si no existe). */
  submit: () => Promise<void>
  /** Vuelve al formulario (para cambiar el correo). */
  reset: () => void
}

function isValidEmail(value: string): boolean {
  return /.+@.+\..+/.test(value.trim())
}

export function useLogin({ redirectTo }: Options = {}): Login {
  const [step, setStep] = useState<LoginStep>('form')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(): Promise<void> {
    setError(null)
    if (!isValidEmail(email)) {
      setError('Escribe un correo válido.')
      return
    }
    setLoading(true)
    try {
      const result = await signInExistingUser(email, redirectTo)
      if (result.kind === 'not-found') {
        setStep('not-found')
      } else {
        setStep('sent')
      }
    } catch {
      setError('No pudimos enviar el correo. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  function reset(): void {
    setStep('form')
    setError(null)
  }

  return { step, email, setEmail, loading, error, submit, reset }
}
