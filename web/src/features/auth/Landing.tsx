// Landing pública para visitantes SIN sesión (issue #175, copy afinado en #183).
// Antes, un recién llegado solo veía la pantalla de email del magic link; ahora
// ve una landing que explica el producto y le ofrece la entrada passwordless en
// el mismo sitio. La política sigue siendo passwordless puro: sin contraseñas
// (cuentas-y-home.md §1.2 y §2).
//
// Orden (issue #183): hero compacto → entrada (email) → "Cómo funciona". Así un
// visitante nuevo ve cómo entrar sin hacer scroll; el "cómo funciona" queda
// debajo para quien baje. El hero NO duplica los 3 pasos (eso es `HowItWorks`):
// es una frase de valor.
//
// Reutiliza:
//  - `ui/HowItWorks` para los 3 pasos (no se duplica).
//  - el hook `useMagicLink` para toda la lógica/wiring del login passwordless, el
//    mismo que usa LoginFlow (código de 6 dígitos; enlace del email como fallback).
//  - `ui/EnterCode` para el paso "introduce el código" tras enviar el email.
//  - `features/home/navigation.joinByCode` para el atajo "tengo un código de
//    grupo" en la landing genérica (lleva a `#g=<código>`).

import { useState } from 'react'
import { EnterCode, Button, Field, HowItWorks, Input, Stack } from '../../ui'
import { joinByCode } from '../home/navigation'
import { useMagicLink } from './useMagicLink'
import styles from './Landing.module.css'

interface Props {
  /**
   * Nombre del grupo cuando se llega por un link de reto (flujo A): cambia el
   * copy del hero a "Vive los viajes de <grupo>". Sin él, landing genérica (flujo B).
   */
  groupName?: string
  /**
   * URL absoluta de retorno tras el email; por defecto el origin actual. El
   * destino deep-link ya lo guardó el router en `lg.next` (ver App.tsx).
   */
  redirectTo?: string
}

export function Landing({ groupName, redirectTo }: Props) {
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

  // Atajo opcional (solo landing genérica): el visitante que ya tiene un código
  // de GRUPO lo pega aquí y entra directo al flujo de unirse (#g=<código>). Es
  // distinto del código OTP de login: este navega, no autentica.
  const [groupCode, setGroupCode] = useState('')
  const [codeError, setCodeError] = useState<string | undefined>(undefined)

  // Tras enviar el email, el flujo es idéntico al login: "introduce el código",
  // con reenviar y volver. Reutilizamos la pantalla del kit para no divergir.
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

  const joining = Boolean(groupName)

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <section className={styles.hero}>
          <span className={styles.brand} aria-hidden="true">
            📍
          </span>
          {joining ? (
            <>
              <p className={styles.eyebrow}>Te han invitado</p>
              <h1 className={styles.headline}>
                Vive los viajes de <span className={styles.accent}>{groupName}</span>
              </h1>
              <p className={styles.lead}>
                Te comparten dónde estuvieron y tú lo vives con ellos. Y, de paso, adivinas el sitio
                en el mapa.
              </p>
            </>
          ) : (
            <>
              <h1 className={styles.headline}>
                Que los que más quieres <span className={styles.accent}>lo vivan contigo</span>
              </h1>
              <p className={styles.lead}>
                Comparte tus viajes y guarda esos recuerdos con los tuyos. Ellos los viven contigo
                y, de paso, adivinan dónde es.
              </p>
            </>
          )}
        </section>

        <section className={styles.entry} aria-labelledby="landing-entry-title">
          <h2 id="landing-entry-title" className={styles.entryTitle}>
            {joining ? 'Entra y únete al viaje' : 'Comparte tu primer viaje'}
          </h2>
          <p className={styles.entryLead}>
            Sin contraseñas: te mandamos un código para <strong>entrar o crear tu cuenta</strong>.
          </p>
          <form
            className={styles.form}
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <Stack gap={4}>
              <Field label="Tu correo" error={error}>
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    type="email"
                    name="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="tucorreo@ejemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                  />
                )}
              </Field>
              <Button type="submit" size="lg" fullWidth loading={loading}>
                Empieza a compartir
              </Button>
            </Stack>
          </form>

          {/* Atajo para quien llega con un código de grupo a mano: solo en la
              landing genérica (en el flujo deep-link ya viene el grupo). */}
          {!joining && (
            <details className={styles.codeDisclosure}>
              <summary className={styles.codeSummary}>¿Te han pasado un código de viaje?</summary>
              <form
                className={styles.codeForm}
                noValidate
                onSubmit={(event) => {
                  event.preventDefault()
                  if (joinByCode(groupCode)) {
                    setCodeError(undefined)
                  } else {
                    setCodeError('Pega un código o enlace de viaje válido.')
                  }
                }}
              >
                <Stack gap={3}>
                  <Field label="Código o enlace del viaje" error={codeError}>
                    {(fieldProps) => (
                      <Input
                        {...fieldProps}
                        type="text"
                        name="group-code"
                        placeholder="Pega aquí el código o el enlace"
                        value={groupCode}
                        onChange={(e) => setGroupCode(e.target.value)}
                      />
                    )}
                  </Field>
                  <Button type="submit" variant="secondary" fullWidth>
                    Unirme al viaje
                  </Button>
                </Stack>
              </form>
            </details>
          )}
        </section>

        <HowItWorks />
      </div>
    </main>
  )
}
