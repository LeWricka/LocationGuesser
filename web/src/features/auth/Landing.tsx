// Landing pública para visitantes SIN sesión (issue #175; portada visual #183).
//
// Antes el visitante veía un formulario de email en una tarjeta nada más entrar.
// Ahora ve una PORTADA con alma: una imagen de marca, una frase emotiva en serif
// y poco texto. El correo no está a la vista: aparece en un POPUP fino (LoginPopup,
// una hoja del kit) al pulsar el CTA. El relato es COMPARTIR tus recuerdos y
// vivirlos con los tuyos; adivinar en el mapa es el guiño, no el qué somos.
//
// La política sigue siendo passwordless puro: sin contraseñas (cuentas-y-home.md
// §1.2 y §2). Login y registro son el MISMO flujo OTP, así que un solo popup sirve
// para ambos ("empieza a compartir" y "ya tengo cuenta" abren la misma hoja).
//
// Reutiliza:
//  - `ui/Modal` (vía LoginPopup) para la hoja de entrada, con transición fina.
//  - `useMagicLink` (dentro de LoginPopup) para todo el wiring OTP, el mismo que
//    usa LoginFlow (código de 6 dígitos; enlace del correo como respaldo).
//  - `ui/HowItWorksImmersive` para la sección "cómo funciona" inmersiva (satélite
//    a sangre + hoja que crece + bucle animado del mapa). La variante compacta
//    `ui/HowItWorks` se sigue usando en el dashboard/estado vacío.
//  - `features/home/navigation.joinByCode` para el atajo "tengo un código de
//    viaje" en la landing genérica (lleva a `#g=<código>`).

import { useState } from 'react'
import { Button, HowItWorksImmersive, Field, Input, Stack } from '../../ui'
import { joinByCode } from '../home/navigation'
import { LoginPopup } from './LoginPopup'
import heroImage from '../../assets/hero.png'
import styles from './Landing.module.css'

interface Props {
  /**
   * Nombre del viaje cuando se llega por un link de reto (flujo A): cambia el
   * copy del hero a "Vive los viajes de <grupo>". Sin él, landing genérica (flujo B).
   */
  groupName?: string
  /**
   * URL absoluta de retorno tras el correo; por defecto el origin actual. El
   * destino deep-link ya lo guardó el router en `lg.next` (ver App.tsx).
   */
  redirectTo?: string
}

export function Landing({ groupName, redirectTo }: Props) {
  // El email no está a la vista: se abre la hoja al pulsar el CTA (o "ya tengo
  // cuenta", que es el mismo flujo OTP — login y registro no se distinguen).
  const [authOpen, setAuthOpen] = useState(false)

  // Atajo opcional (solo landing genérica): el visitante que ya tiene un código
  // de VIAJE lo pega aquí y entra directo al flujo de unirse (#g=<código>). Es
  // distinto del código OTP de login: este navega, no autentica.
  const [groupCode, setGroupCode] = useState('')
  const [codeError, setCodeError] = useState<string | undefined>(undefined)

  const joining = Boolean(groupName)

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <section className={styles.hero}>
          {/* Imagen de marca: las dos hojas (el momento compartido y el que lo
              vive). Decorativa; el mensaje lo lleva el titular. */}
          <img className={styles.heroImage} src={heroImage} alt="" aria-hidden="true" />

          {joining ? (
            <>
              <p className={styles.eyebrow}>Te han invitado</p>
              <h1 className={styles.headline}>
                Vive los viajes de <span className={styles.accent}>{groupName}</span>
              </h1>
              <p className={styles.lead}>Te comparten dónde estuvieron y tú lo vives con ellos.</p>
            </>
          ) : (
            <>
              <h1 className={styles.headline}>
                Comparte tus momentos <span className={styles.accent}>de una forma diferente</span>
              </h1>
              <p className={styles.lead}>Haz que los que más quieres vivan tus viajes contigo.</p>
            </>
          )}

          {/* CTA emotivo: abre la hoja de entrada. El correo aparece allí. */}
          <Button
            className={styles.cta}
            size="lg"
            onClick={() => setAuthOpen(true)}
            data-testid="open-auth"
          >
            {joining ? 'Únete al viaje' : 'Empieza a compartir'}
          </Button>

          {/* Login y registro son el mismo flujo: este enlace abre el mismo popup. */}
          <button type="button" className={styles.signIn} onClick={() => setAuthOpen(true)}>
            ¿Ya tienes cuenta? <span className={styles.signInAccent}>Entra</span>
          </button>
        </section>

        {/* Atajo para quien llega con un código de viaje a mano: solo en la landing
            genérica (en el flujo deep-link ya viene el viaje dado). */}
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

        {/* Sección inmersiva "cómo funciona": el bucle se vive de un vistazo
            debajo de la portada. El CTA abre el mismo popup de entrada. */}
        <HowItWorksImmersive ctaLabel="Empieza un viaje" onCta={() => setAuthOpen(true)} />
      </div>

      <LoginPopup
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        joining={joining}
        redirectTo={redirectTo}
      />
    </main>
  )
}
