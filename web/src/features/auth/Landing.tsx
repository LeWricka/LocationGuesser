// Landing pública para visitantes SIN sesión — enfoque "globo/mapa vivo de fondo
// + popup" (issue #175, copy #183).
//
// La entrada evoca la identidad de la app (el globo satélite que el usuario verá
// dentro): un globo vivo de fondo (CSS, ligero — no monta MapLibre para no
// penalizar el arranque) con una frase emotiva en serif y un CTA cálido. El flujo
// passwordless (OTP) no vive en la página, sino en un POPUP fino que abre el CTA:
// "tu mundo te espera, entra". Así el primer pantallazo es puro deseo (la frase +
// el globo) y el formulario aparece solo cuando el visitante decide entrar.
//
// Reutiliza, SIN modificar su lógica:
//  - `useMagicLink` para todo el wiring del login passwordless (código de 6
//    dígitos; enlace del email como fallback) — el mismo que usa LoginFlow.
//  - `ui/Modal` del kit para el popup (overlay + foco + Escape + hoja en móvil).
//  - `ui/EnterCode` para el paso "introduce el código" tras enviar el email.
//  - `features/home/navigation.joinByCode` para el atajo "tengo un código de
//    grupo" en la landing genérica (lleva a `#g=<código>`).

import { useState } from 'react'
import { EnterCode, Button, Field, Input, Modal, Stack } from '../../ui'
import { joinByCode } from '../home/navigation'
import { useMagicLink } from './useMagicLink'
import styles from './Landing.module.css'

interface Props {
  /**
   * Nombre del grupo cuando se llega por un link de reto (flujo A): cambia el
   * copy a "Vive los viajes de <grupo>". Sin él, landing genérica (flujo B).
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

  // El popup de entrada: cerrado hasta que el visitante pulsa el CTA. Al cerrarlo
  // volvemos el flujo a 'email' para que no reabra en mitad del paso del código.
  const [open, setOpen] = useState(false)

  // Atajo opcional (solo landing genérica): el visitante que ya tiene un código
  // de GRUPO lo pega aquí y entra directo al flujo de unirse (#g=<código>). Es
  // distinto del código OTP de login: este navega, no autentica.
  const [groupCode, setGroupCode] = useState('')
  const [codeError, setCodeError] = useState<string | undefined>(undefined)

  const joining = Boolean(groupName)

  function closeModal() {
    setOpen(false)
    reset()
  }

  return (
    <main className={styles.page}>
      {/* Globo satélite vivo de fondo (CSS puro): un disco terráqueo que gira
          lento bajo un velo de tinta, evocando el mapa de la app sin coste de
          arranque. Decorativo: aria-hidden y desactivado con reduced-motion. */}
      <div className={styles.globe} aria-hidden="true">
        <span className={styles.globeSphere} />
        <span className={styles.globeGlow} />
      </div>

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
                Comparte tus viajes y haz que los que más quieres los vivan contigo. Tu mundo te
                espera.
              </p>
            </>
          )}

          <Button size="lg" className={styles.cta} onClick={() => setOpen(true)}>
            {joining ? 'Entrar y unirme al viaje' : 'Empieza a compartir'}
          </Button>

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
      </div>

      {/* Popup fino con el flujo OTP. Mismo paso 'code' que LoginFlow: tras enviar
          el email mostramos EnterCode dentro del mismo popup (reenviar/volver). El
          Modal sin onClose en el paso del código evita cerrarlo por error mientras
          se teclea; siempre hay "Cambiar correo" (reset) para volver. */}
      <Modal
        open={open}
        onClose={step === 'email' ? closeModal : undefined}
        title={
          step === 'email' ? (joining ? 'Entra y únete al viaje' : 'Tu mundo te espera') : null
        }
      >
        {step === 'code' ? (
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
        ) : (
          <div className={styles.modalIntro}>
            <p className={styles.modalLead}>
              Sin contraseñas: te mandamos un código para <strong>entrar o crear tu cuenta</strong>.
              Comparte tus viajes y haz que los que más quieres los vivan contigo.
            </p>
            <form
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
                      autoFocus
                    />
                  )}
                </Field>
                <Button type="submit" size="lg" fullWidth loading={loading}>
                  Enviarme el código
                </Button>
              </Stack>
            </form>
          </div>
        )}
      </Modal>
    </main>
  )
}
