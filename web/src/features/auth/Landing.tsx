// Landing pública para visitantes SIN sesión (issue #175; portada visual #183;
// patrón globo + hoja #343).
//
// Patrón GLOBO + HOJA (referencia Polarsteps): un globo a sangre arriba con pines-foto
// de datos demo curados (el wow y la identidad) y una HOJA BLANCA que sube debajo con el
// mensaje y el CTA (la legibilidad). Sustituye a la portada con imagen estática: ahora el
// héroe es el globo real, interactivo, y el relato vive en la hoja. El correo NO está a la
// vista: aparece en un popup fino (LoginPopup) al pulsar "Empieza".
//
// La política sigue siendo passwordless puro: sin contraseñas (cuentas-y-home.md §1.2 y
// §2). Login y registro son el MISMO flujo OTP, así que un solo popup sirve para ambos.
//
// Reutiliza:
//  - `features/home/GlobeSheet` (+ HomeGlobe) para el patrón globo + hoja, con el preset
//    de mapa `diario` (satélite + etiquetas) y los pines-foto del mapa de viaje.
//  - `ui/Modal` (vía LoginPopup) para la hoja de entrada, con todo el wiring OTP.
//  - `ui/HowItWorksImmersive` para la sección "cómo funciona" dentro de la hoja.
//  - `features/home/navigation.joinByCode` para el atajo "tengo un código de viaje".

import { useState } from 'react'
import { Button, GlobeSheet, HowItWorksImmersive, Field, Input, Logo, Stack } from '../../ui'
import { HOME_DEMO_PINS } from '../home/homeDemoPins'
import { joinByCode } from '../home/navigation'
import { LoginPopup } from './LoginPopup'
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
  // El email no está a la vista: se abre la hoja al pulsar el CTA (o "ya tengo cuenta",
  // que es el mismo flujo OTP — login y registro no se distinguen).
  const [authOpen, setAuthOpen] = useState(false)

  // Atajo opcional (solo landing genérica): el visitante que ya tiene un código de VIAJE
  // lo pega aquí y entra directo al flujo de unirse (#g=<código>). Se despliega bajo el
  // botón ghost. Es distinto del código OTP de login: este navega, no autentica.
  const [codeOpen, setCodeOpen] = useState(false)
  const [groupCode, setGroupCode] = useState('')
  const [codeError, setCodeError] = useState<string | undefined>(undefined)

  const joining = Boolean(groupName)

  return (
    <main className={styles.page}>
      <GlobeSheet
        pins={HOME_DEMO_PINS}
        // Pines DECORATIVOS: vista mundo fija (sin fit) → el globo héroe se ve SIEMPRE
        // esférico, nunca aplanado por un encuadre cercano de pines agrupados.
        framing="world"
        // Tocar un pin demo en la landing = invitar a empezar (no hay viaje real).
        onOpenPin={() => setAuthOpen(true)}
        sheetLabel="Empieza a compartir"
        overlay={
          <span className={styles.brand}>
            <Logo variant="wordmark" size={20} monochrome />
          </span>
        }
      >
        <div className={styles.hero}>
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
              <p className={styles.lead}>
                Tu gente adivina dónde estuviste. Gana quien más se acerca.
              </p>
            </>
          )}

          <Stack gap={2} className={styles.actions}>
            {/* CTA primario: abre la hoja de entrada (el correo vive allí). */}
            <Button size="lg" fullWidth onClick={() => setAuthOpen(true)} data-testid="open-auth">
              {joining ? 'Únete al viaje' : 'Empieza'}
            </Button>
            {joining ? (
              // Login y registro son el mismo flujo: este enlace abre el mismo popup.
              <Button variant="ghost" size="lg" fullWidth onClick={() => setAuthOpen(true)}>
                ¿Ya tienes cuenta? Entra
              </Button>
            ) : (
              // Atajo de código de viaje: despliega el campo bajo el botón.
              <Button variant="ghost" size="lg" fullWidth onClick={() => setCodeOpen((v) => !v)}>
                Tengo un código
              </Button>
            )}
          </Stack>

          {!joining && codeOpen && (
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
          )}
        </div>

        {/* Sección inmersiva "cómo funciona": el bucle se vive de un vistazo, dentro de la
            hoja (scrolleable). El CTA abre el mismo popup de entrada. */}
        <HowItWorksImmersive
          className={styles.how}
          ctaLabel="Empieza un viaje"
          onCta={() => setAuthOpen(true)}
        />
      </GlobeSheet>

      <LoginPopup
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        joining={joining}
        redirectTo={redirectTo}
      />
    </main>
  )
}
