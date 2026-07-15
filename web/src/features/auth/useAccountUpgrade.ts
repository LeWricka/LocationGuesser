// Lógica de "Guárdate / entra del todo" (issue #758), sin UI: vincula la sesión
// ANÓNIMA del receptor a una cuenta permanente con email, CONSERVANDO el mismo
// `auth.uid()` (así sus votos y su puesto en el marcador no se mueven de sitio).
// Mismo patrón de dos pasos que `useMagicLink` (email → código), pero llamando
// a `linkAnonymousEmail`/`verifyLinkEmailOtp` (lib/auth.ts) en vez de
// `sendEmailOtp`/`verifyEmailOtp`: esas dos crean o recuperan una cuenta desde
// cero vía `signInWithOtp`; aquí partimos de una sesión YA iniciada y la
// actualizamos (`updateUser({ email })`), que es el flujo que Supabase espera
// para convertir un usuario anónimo en uno permanente sin perder su identidad.
//
// OPCIONAL Y SALTABLE a propósito: el llamante (AccountUpgradeModal) decide qué
// hacer si el usuario no quiere seguir — su sesión anónima y su voto quedan
// intactos, esto nunca bloquea nada.

import { useState } from 'react'
import { linkAnonymousEmail, verifyLinkEmailOtp } from '../../lib/auth'
import { track } from '../../lib/analytics'
import { describeError } from '../../lib/errors'

export type AccountUpgradeStep = 'email' | 'code'

/**
 * Contexto de dónde se ofreció el CTA (issue #751): sin esto `account_upgraded`
 * no se puede cruzar con el resto del funnel (qué superficie convierte más).
 * `groupId`/`challengeId` solo tienen sentido con origin 'play_result' (se
 * jugó un reto concreto); en 'anon_create_gate' (intento de crear un viaje sin
 * cuenta) no hay grupo/reto todavía.
 */
export interface AccountUpgradeContext {
  origin: 'play_result' | 'anon_create_gate'
  groupId?: string
  challengeId?: string
}

export interface AccountUpgrade {
  step: AccountUpgradeStep
  email: string
  setEmail: (value: string) => void
  code: string
  setCode: (value: string) => void
  /** Envío del primer código en curso (bloquea el botón). */
  loading: boolean
  /** Reenvío en curso (bloquea el botón de reenviar). */
  resending: boolean
  /** Verificación del código en curso (bloquea el botón de confirmar). */
  verifying: boolean
  error: string | null
  /** Pide vincular el email (envía el código) y, si va bien, pasa a 'code'. */
  submit: () => Promise<void>
  /** Reenvía el código al mismo correo sin cambiar de paso. */
  resend: () => Promise<void>
  /**
   * Verifica el código; si va bien, la sesión pasa a ser permanente (mismo
   * uid) y devuelve `true` (el llamante puede cerrar el modal/avisar). `false`
   * si el código era inválido/caducado (el error ya queda fijado para la UI).
   */
  verify: () => Promise<boolean>
  /** Vuelve al paso de email (p.ej. para cambiar el correo). */
  reset: () => void
}

function isValidEmail(value: string): boolean {
  return /.+@.+\..+/.test(value.trim())
}

function isValidCode(value: string): boolean {
  return /^\d{6}$/.test(value.trim())
}

export function useAccountUpgrade(context: AccountUpgradeContext): AccountUpgrade {
  const [step, setStep] = useState<AccountUpgradeStep>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(esReenvio: boolean): Promise<boolean> {
    setError(null)
    if (!isValidEmail(email)) {
      setError('Escribe un correo válido.')
      return false
    }
    try {
      await linkAnonymousEmail(email.trim())
      track('login_email_solicitado', { reenvio: esReenvio })
      return true
    } catch (err) {
      setError(`No pudimos enviar el código: ${describeError(err)}`)
      return false
    }
  }

  async function submit(): Promise<void> {
    setLoading(true)
    const ok = await send(false)
    setLoading(false)
    if (ok) {
      setCode('')
      setStep('code')
    }
  }

  async function resend(): Promise<void> {
    setResending(true)
    await send(true)
    setResending(false)
  }

  async function verify(): Promise<boolean> {
    setError(null)
    if (!isValidCode(code)) {
      setError('El código son 6 dígitos.')
      return false
    }
    setVerifying(true)
    try {
      // Al verificar, la sesión pasa de anónima a permanente CON EL MISMO uid:
      // onAuthStateChange dispara y AuthProvider repinta solo (no hay que navegar).
      await verifyLinkEmailOtp(email, code)
      track('account_upgraded', {
        origin: context.origin,
        ...(context.groupId && { group_id: context.groupId }),
        ...(context.challengeId && { challenge_id: context.challengeId }),
      })
      return true
    } catch {
      setError('Código incorrecto o caducado. Revísalo o reenvía uno nuevo.')
      return false
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
