// Lógica del login passwordless por OTP, sin UI. Extrae la máquina de estados que
// comparten las dos presentaciones: la pantalla de login del kit (LoginFlow) y la
// landing pública (Landing). La política del hito es passwordless puro: sin
// contraseñas (cuentas-y-home.md §1.2 y §2).
//
// UX principal: CÓDIGO de 6 dígitos. email → code → (logueado). El usuario mete su
// email, recibe un email con un código y lo introduce para entrar.
//
// FALLBACK (no romper login): el mismo email lleva además el enlace mágico de
// siempre; si el usuario lo pulsa, vuelve con sesión y AuthProvider repinta (este
// flujo ya no se monta). Por eso el paso 'code' invita también a usar el enlace.

import { useState } from 'react'
import { sendEmailOtp, verifyEmailOtp } from '../../lib/auth'

// Dos pasos visibles: pedir el email → introducir el código. (Al verificar bien,
// onAuthStateChange repinta logueado, así que no hay un tercer paso propio.)
export type MagicLinkStep = 'email' | 'code'

interface Options {
  /** URL absoluta de retorno tras el enlace del email; por defecto el origin actual. */
  redirectTo?: string
}

export interface MagicLink {
  step: MagicLinkStep
  email: string
  setEmail: (value: string) => void
  /** Código OTP de 6 dígitos que teclea el usuario. */
  code: string
  setCode: (value: string) => void
  /** Envío del primer email en curso (bloquea el botón). */
  loading: boolean
  /** Reenvío en curso (bloquea el botón de reenviar). */
  resending: boolean
  /** Verificación del código en curso (bloquea el botón de entrar). */
  verifying: boolean
  error: string | null
  /** Pide el email (código + enlace) y, si va bien, pasa al paso 'code'. */
  submit: () => Promise<void>
  /** Reenvía el email al mismo correo sin cambiar de paso. */
  resend: () => Promise<void>
  /** Verifica el código tecleado; si va bien, la sesión se crea sola. */
  verify: () => Promise<void>
  /** Vuelve al paso de email (p.ej. para cambiar el correo). */
  reset: () => void
}

// Validación mínima en cliente: un email vacío o sin "@" no merece ir a Supabase.
function isValidEmail(value: string): boolean {
  return /.+@.+\..+/.test(value.trim())
}

// El OTP de email de Supabase es de 6 dígitos.
function isValidCode(value: string): boolean {
  return /^\d{6}$/.test(value.trim())
}

export function useMagicLink({ redirectTo }: Options = {}): MagicLink {
  const [step, setStep] = useState<MagicLinkStep>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [verifying, setVerifying] = useState(false)
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
      await sendEmailOtp(email.trim(), undefined, redirectTo)
      return true
    } catch {
      setError('No pudimos enviar el correo. Inténtalo de nuevo.')
      return false
    }
  }

  async function submit(): Promise<void> {
    setLoading(true)
    const ok = await send()
    setLoading(false)
    if (ok) {
      setCode('')
      setStep('code')
    }
  }

  async function resend(): Promise<void> {
    setResending(true)
    await send()
    setResending(false)
  }

  async function verify(): Promise<void> {
    setError(null)
    if (!isValidCode(code)) {
      setError('El código son 6 dígitos.')
      return
    }
    setVerifying(true)
    try {
      // Al verificar, supabase.auth emite el evento de sesión y AuthProvider
      // repinta logueado: este flujo se desmonta solo, no hay que navegar.
      await verifyEmailOtp(email, code)
    } catch {
      setError('Código incorrecto o caducado. Revísalo o reenvía uno nuevo.')
    } finally {
      setVerifying(false)
    }
  }

  function reset(): void {
    setStep('email')
    setCode('')
    setError(null)
  }

  return {
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
  }
}
