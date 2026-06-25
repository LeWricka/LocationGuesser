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
//  - el hook `useMagicLink` para toda la lógica/wiring del enlace mágico, el
//    mismo que usa LoginFlow.
//  - `ui/CheckEmail` para el paso "revisa tu correo" tras enviar el email.
//  - `features/home/navigation.joinByCode` para el atajo "tengo un código de
//    grupo" en la landing genérica (lleva a `#g=<código>`).

import { useState } from 'react'
import { CheckEmail, Button, Field, HowItWorks, Input, Stack } from '../../ui'
import { joinByCode } from '../home/navigation'
import { useMagicLink } from './useMagicLink'
import styles from './Landing.module.css'

interface Props {
  /**
   * Nombre del grupo cuando se llega por un link de reto (flujo A): cambia el
   * copy del hero a "Únete a <grupo> y juega". Sin él, landing genérica (flujo B).
   */
  groupName?: string
  /**
   * URL absoluta de retorno tras el email; por defecto el origin actual. El
   * destino deep-link ya lo guardó el router en `lg.next` (ver App.tsx).
   */
  redirectTo?: string
}

export function Landing({ groupName, redirectTo }: Props) {
  const { step, email, setEmail, loading, resending, error, submit, resend, reset } = useMagicLink({
    redirectTo,
  })

  // Atajo opcional (solo landing genérica): el visitante que ya tiene un código
  // de grupo lo pega aquí y entra directo al flujo de unirse (#g=<código>).
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | undefined>(undefined)

  // Tras enviar el email, el flujo es idéntico al login: "revisa tu correo",
  // con reenviar y volver. Reutilizamos la pantalla del kit para no divergir.
  if (step === 'sent') {
    return (
      <CheckEmail email={email} resending={resending} onResend={resend} onChangeEmail={reset} />
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
              <p className={styles.eyebrow}>Te han retado</p>
              <h1 className={styles.headline}>
                Únete a <span className={styles.accent}>{groupName}</span> y juega
              </h1>
              <p className={styles.lead}>
                Marca en el mapa dónde crees que es. Gana quien más se acerca.
              </p>
            </>
          ) : (
            <>
              <h1 className={styles.headline}>
                Comparte tus momentos <span className={styles.accent}>de una forma diferente</span>
              </h1>
              <p className={styles.lead}>
                Tus amigos adivinan en el mapa dónde estás. Gana quien más se acerca.
              </p>
            </>
          )}
        </section>

        <section className={styles.entry} aria-labelledby="landing-entry-title">
          <h2 id="landing-entry-title" className={styles.entryTitle}>
            {joining ? 'Entra y únete al grupo' : 'Empieza a jugar'}
          </h2>
          <p className={styles.entryLead}>
            Sin contraseñas: te mandamos un enlace para <strong>entrar o crear tu cuenta</strong>.
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
                Enviar enlace mágico
              </Button>
            </Stack>
          </form>

          {/* Atajo para quien llega con un código de grupo a mano: solo en la
              landing genérica (en el flujo deep-link ya viene el grupo). */}
          {!joining && (
            <details className={styles.codeDisclosure}>
              <summary className={styles.codeSummary}>¿Te han pasado un código de grupo?</summary>
              <form
                className={styles.codeForm}
                noValidate
                onSubmit={(event) => {
                  event.preventDefault()
                  if (joinByCode(code)) {
                    setCodeError(undefined)
                  } else {
                    setCodeError('Pega un código o enlace de grupo válido.')
                  }
                }}
              >
                <Stack gap={3}>
                  <Field label="Código o enlace del grupo" error={codeError}>
                    {(fieldProps) => (
                      <Input
                        {...fieldProps}
                        type="text"
                        name="group-code"
                        placeholder="Pega aquí el código o el enlace"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                      />
                    )}
                  </Field>
                  <Button type="submit" variant="secondary" fullWidth>
                    Unirme al grupo
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
