// Lógica del login passwordless (magic link), sin UI. Extrae la máquina de
// estados que antes vivía dentro de LoginFlow para poder reutilizarla en dos
// presentaciones: la pantalla de login del kit (LoginFlow) y la landing pública
// (Landing). La política del hito es passwordless puro: sin contraseñas
// (cuentas-y-home.md §1.2 y §2).

import { useState } from 'react'
import { signInWithMagicLink } from '../../lib/auth'

// Dos pasos: pedir el email → "revisa tu correo". Al pulsar el enlace, el
// usuario vuelve con sesión y AuthProvider repinta: este flujo ya no se monta.
export type MagicLinkStep = 'email' | 'sent'

interface Options {
  /** URL absoluta de retorno tras el email; por defecto el origin actual. */
  redirectTo?: string
}

export interface MagicLink {
  step: MagicLinkStep
  email: string
  setEmail: (value: string) => void
  /** Envío del primer enlace en curso (bloquea el botón). */
  loading: boolean
  /** Reenvío en curso (bloquea el botón de reenviar). */
  resending: boolean
  error: string | null
  /** Pide el enlace y, si va bien, pasa al paso "revisa tu correo". */
  submit: () => Promise<void>
  /** Reenvía el enlace al mismo correo sin cambiar de paso. */
  resend: () => Promise<void>
  /** Vuelve al paso de email (p.ej. para cambiar el correo). */
  reset: () => void
}

// Validación mínima en cliente: un email vacío o sin "@" no merece ir a Supabase.
function isValidEmail(value: string): boolean {
  return /.+@.+\..+/.test(value.trim())
}

export function useMagicLink({ redirectTo }: Options = {}): MagicLink {
  const [step, setStep] = useState<MagicLinkStep>('email')
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

  async function submit(): Promise<void> {
    setLoading(true)
    const ok = await send()
    setLoading(false)
    if (ok) setStep('sent')
  }

  async function resend(): Promise<void> {
    setResending(true)
    await send()
    setResending(false)
  }

  function reset(): void {
    setStep('email')
    setError(null)
  }

  return { step, email, setEmail, loading, resending, error, submit, resend, reset }
}
