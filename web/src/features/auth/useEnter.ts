// Lógica de la ENTRADA de baja fricción (issue #438), sin UI. Nombre + email →
// dentro al instante, sin esperar código. La política del hito de cuentas sigue
// siendo passwordless (cuentas-y-home.md §1.2 y §2); esto reduce la fricción de la
// PRIMERA entrada: no obliga a salir al correo antes de ver nada.
//
// Bajo el capó (ver lib/auth.enterWithNameAndEmail): sesión anónima → nombre →
// enlazar email (dispara validación, NO bloquea). CASO BORDE: si el email ya es de
// otra cuenta, se manda un magic link de RECUPERACIÓN y pasamos al estado 'recover'
// ("te mandamos un enlace para recuperar tu cuenta"). Así entrar desde otro móvil o
// tras perder la sesión recupera la MISMA cuenta, sin dejar a nadie fuera.

import { useState } from 'react'
import { enterWithNameAndEmail } from '../../lib/auth'

// Estados visibles: el formulario (nombre+email) o el aviso de recuperación
// enviada. El caso normal ('entered') NO tiene pantalla propia: al entrar, la
// sesión cambia y AuthProvider repinta la app dentro (este flujo se desmonta).
export type EnterStep = 'form' | 'recover'

interface Options {
  /** URL absoluta de retorno tras el enlace del correo; por defecto el origin actual. */
  redirectTo?: string
}

export interface Enter {
  step: EnterStep
  name: string
  setName: (value: string) => void
  email: string
  setEmail: (value: string) => void
  /** Envío en curso (bloquea el botón de entrar). */
  loading: boolean
  error: string | null
  /** Entra con nombre + email. Si el email ya existe, pasa a 'recover'. */
  submit: () => Promise<void>
  /** Vuelve al formulario (p.ej. tras el aviso de recuperación, para cambiar el correo). */
  reset: () => void
}

// Validación mínima en cliente: nombre con algo de sustancia y email con forma de email.
function isValidName(value: string): boolean {
  return value.trim().length >= 2
}

function isValidEmail(value: string): boolean {
  return /.+@.+\..+/.test(value.trim())
}

export function useEnter({ redirectTo }: Options = {}): Enter {
  const [step, setStep] = useState<EnterStep>('form')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(): Promise<void> {
    setError(null)
    if (!isValidName(name)) {
      setError('Escribe tu nombre (mínimo 2 caracteres).')
      return
    }
    if (!isValidEmail(email)) {
      setError('Escribe un correo válido.')
      return
    }
    setLoading(true)
    try {
      const result = await enterWithNameAndEmail(name, email, redirectTo)
      if (result.kind === 'email-exists') {
        // El email ya es de otra cuenta: mandamos magic link de recuperación.
        setStep('recover')
      }
      // 'entered': la sesión anónima con email pendiente ya está viva;
      // onAuthStateChange repinta la app dentro. No navegamos aquí.
    } catch {
      setError('No pudimos entrar. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  function reset(): void {
    setStep('form')
    setError(null)
  }

  return { step, name, setName, email, setEmail, loading, error, submit, reset }
}
