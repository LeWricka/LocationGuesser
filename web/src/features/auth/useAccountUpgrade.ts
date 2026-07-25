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

import { useRef, useState } from 'react'
import {
  completeAccountMerge,
  getUser,
  isEmailAlreadyRegisteredError,
  linkAnonymousEmail,
  requestAccountMerge,
  sendExistingAccountLoginOtp,
  verifyEmailOtp,
  verifyLinkEmailOtp,
} from '../../lib/auth'
import { track } from '../../lib/analytics'
import { describeError } from '../../lib/errors'
import { reportError } from '../../lib/observability'

export type AccountUpgradeStep = 'email' | 'code'

/**
 * Vía por la que se resuelve el upgrade (issue #944):
 *  - 'link': el email está LIBRE → se vincula la sesión anónima a ese email
 *    conservando el mismo uid (flujo de #758, updateUser + OTP email_change).
 *  - 'merge': el email YA pertenece a otra cuenta → se ENTRA en esa cuenta (OTP
 *    de login) y se FUSIONAN en ella los datos de este dispositivo. El paso de
 *    código es el mismo, pero verifica un OTP distinto y luego llama a la RPC de
 *    fusión.
 */
export type AccountUpgradeMode = 'link' | 'merge'

/**
 * Contexto de dónde se ofreció el CTA (issue #751): sin esto `account_upgraded`
 * no se puede cruzar con el resto del funnel (qué superficie convierte más).
 * `groupId`/`challengeId` solo tienen sentido con origin 'play_result' (se
 * jugó un reto concreto); en 'anon_create_gate' (intento de crear un viaje sin
 * cuenta) no hay grupo/reto todavía. `guest_register` (onboarding nuevo, pieza
 * 1/4): el registro post-valor del INVITADO del enlace, tras jugar su primer
 * reto — ver `GuestRegisterPrompt`/`useGuestRegisterPrompt`. `reto_share_register`
 * (onboarding nuevo, pieza 2/4): el registro al final de la secuencia de
 * explicación de quien llegó por un RETO SUELTO — ver `RetoShareExplainSequence`.
 */
export interface AccountUpgradeContext {
  origin: 'play_result' | 'anon_create_gate' | 'guest_register' | 'reto_share_register'
  groupId?: string
  challengeId?: string
}

export interface AccountUpgrade {
  step: AccountUpgradeStep
  /**
   * Vía en curso (issue #944). El paso de código cambia su copy según sea 'link'
   * (vincular email libre) o 'merge' (entrar en la cuenta existente y fusionar).
   */
  mode: AccountUpgradeMode
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

function upgradedProps(context: AccountUpgradeContext, merged: boolean) {
  return {
    origin: context.origin,
    ...(context.groupId && { group_id: context.groupId }),
    ...(context.challengeId && { challenge_id: context.challengeId }),
    // Solo marcamos la vía cuando fue fusión (issue #944); el flujo normal deja
    // el evento intacto para no romper el resto del funnel ya instrumentado.
    ...(merged && { merged: true }),
  }
}

export function useAccountUpgrade(context: AccountUpgradeContext): AccountUpgrade {
  const [step, setStep] = useState<AccountUpgradeStep>('email')
  const [mode, setMode] = useState<AccountUpgradeMode>('link')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Datos de la fusión (issue #944): el uid de la sesión anónima ORIGEN y su
  // token, capturados mientras aún somos anónimos. Van en un ref (no state): son
  // datos de control del flujo, no afectan al render, y no deben perderse entre
  // repintados. El token nunca se persiste: vive solo aquí, en memoria.
  const mergeRef = useRef<{ sourceUid: string; token: string } | null>(null)
  // ¿Ya iniciamos sesión en la cuenta destino? (verifyEmailOtp hecho). Si un
  // reintento de la fusión ocurre tras esto, NO hay que re-canjear el OTP (ya
  // está consumido y la sesión ya es la destino): se salta directo a la RPC.
  const targetSessionRef = useRef(false)

  // Arranca el flujo de FUSIÓN cuando el email ya tiene cuenta (issue #944). Se
  // ejecuta AÚN en la sesión anónima: (1) fija el uid origen, (2) pide el token,
  // (3) manda el código de LOGIN a la cuenta existente. Devuelve false (con error
  // fijado) si algo de esto falla.
  async function startMerge(esReenvio: boolean): Promise<boolean> {
    try {
      const user = await getUser()
      if (!user) {
        setError('No pudimos preparar la fusión. Vuelve a intentarlo.')
        return false
      }
      const token = await requestAccountMerge()
      mergeRef.current = { sourceUid: user.id, token }
      await sendExistingAccountLoginOtp(email.trim())
      setMode('merge')
      track('login_email_solicitado', { reenvio: esReenvio })
      return true
    } catch (err) {
      setError(`No pudimos preparar el acceso a tu cuenta: ${describeError(err)}`)
      return false
    }
  }

  async function send(esReenvio: boolean): Promise<boolean> {
    setError(null)
    if (!isValidEmail(email)) {
      setError('Escribe un correo válido.')
      return false
    }
    try {
      await linkAnonymousEmail(email.trim())
      setMode('link')
      track('login_email_solicitado', { reenvio: esReenvio })
      return true
    } catch (err) {
      // El email YA pertenece a otra cuenta: en vez de morir, ofrecemos ENTRAR en
      // ella y fusionar (issue #944). Cualquier otro error → mensaje normal.
      if (isEmailAlreadyRegisteredError(err)) {
        return startMerge(esReenvio)
      }
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
      targetSessionRef.current = false
      setStep('code')
    }
  }

  async function resend(): Promise<void> {
    setResending(true)
    if (mode === 'merge') {
      // Ya estamos en el flujo de fusión: reenviar es re-mandar el código de LOGIN
      // a la cuenta existente (no volver a intentar el updateUser).
      setError(null)
      try {
        await sendExistingAccountLoginOtp(email.trim())
        track('login_email_solicitado', { reenvio: true })
      } catch (err) {
        setError(`No pudimos reenviar el código: ${describeError(err)}`)
      }
    } else {
      await send(true)
    }
    setResending(false)
  }

  async function verifyLink(): Promise<boolean> {
    try {
      // Al verificar, la sesión pasa de anónima a permanente CON EL MISMO uid:
      // onAuthStateChange dispara y AuthProvider repinta solo (no hay que navegar).
      await verifyLinkEmailOtp(email, code)
      track('account_upgraded', upgradedProps(context, false))
      return true
    } catch {
      setError('Código incorrecto o caducado. Revísalo o reenvía uno nuevo.')
      return false
    }
  }

  async function verifyMerge(): Promise<boolean> {
    const merge = mergeRef.current
    if (!merge) {
      setError('Se perdió el contexto de la fusión. Vuelve a empezar.')
      return false
    }
    // Paso 1: entrar en la cuenta EXISTENTE (salvo que ya lo hayamos hecho en un
    // intento anterior — el OTP es de un solo uso, no se re-canjea).
    if (!targetSessionRef.current) {
      try {
        await verifyEmailOtp(email, code)
      } catch {
        setError('Código incorrecto o caducado. Revísalo o reenvía uno nuevo.')
        return false
      }
      targetSessionRef.current = true
    }
    // Paso 2: ya logueados en la cuenta destino, traer los datos del invitado.
    try {
      await completeAccountMerge(merge.sourceUid, merge.token)
    } catch (err) {
      // Estamos DENTRO de la cuenta, pero la fusión falló. No mentimos con éxito:
      // dejamos el paso abierto para reintentar (Confirmar re-llama solo a la RPC,
      // ya no al OTP). El invitado no pierde nada: sus datos siguen ahí.
      //
      // FALLO SILENCIOSO NO (es auth): reportamos a Sentry con el contexto justo
      // para recuperar el huérfano a mano si el reintento tampoco cuaja —
      // source_uid (la sesión anónima con los datos) y target_uid (la cuenta
      // destino, ya la sesión actual). NUNCA el token (secreto de un solo uso).
      const target = await getUser().catch(() => null)
      reportError(err, {
        area: 'account_merge_complete',
        source_uid: merge.sourceUid,
        target_uid: target?.id ?? null,
      })
      setError(
        `Entraste en tu cuenta, pero no pudimos traer del todo lo de este ` +
          `dispositivo (${describeError(err)}). Pulsa Confirmar para reintentar.`,
      )
      return false
    }
    track('account_upgraded', upgradedProps(context, true))
    return true
  }

  async function verify(): Promise<boolean> {
    setError(null)
    if (!isValidCode(code)) {
      setError('El código son 6 dígitos.')
      return false
    }
    setVerifying(true)
    try {
      return mode === 'merge' ? await verifyMerge() : await verifyLink()
    } finally {
      setVerifying(false)
    }
  }

  function reset(): void {
    setStep('email')
    setMode('link')
    setCode('')
    setError(null)
    mergeRef.current = null
    targetSessionRef.current = false
  }

  return {
    step,
    mode,
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
