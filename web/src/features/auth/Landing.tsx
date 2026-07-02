// Landing pública para visitantes SIN sesión (issue #175; portada visual #183;
// patrón globo + hoja #343; flujo login/registro #495).
//
// Patrón GLOBO + HOJA (referencia Polarsteps): un globo a sangre arriba con pines-foto
// de datos demo curados (el wow y la identidad) y una HOJA BLANCA que sube debajo con el
// mensaje y el CTA (la legibilidad).
//
// La política sigue siendo passwordless puro: sin contraseñas (cuentas-y-home.md §1.2).
// Ahora distinguimos ALTA (EnterScreen: nombre+email → dentro al instante) de LOGIN
// (LoginEmailScreen: solo email → magic link → home directa sin ProfileGate).
//
// Cambios respecto al diseño anterior (#495):
//  - CTA primario: "Crear tu viaje" → EnterScreen (alta).
//  - CTA secundario: "Ya tengo cuenta · Entrar" → LoginEmailScreen (login).
//  - ELIMINADO: "Tengo un código" (los viajes van por enlace, no por código manual).
//  - Conservada: nota "¿Te han pasado un enlace? Ábrelo y entras directo."
//  - Copy del lead: de "Gana quien más se acerca" a guardar/compartir/interactuar.
//
// Reutiliza:
//  - `features/home/GlobeSheet` para el patrón globo + hoja.
//  - `EnterScreen` para el alta (nombre + email → dentro al instante).
//  - `LoginEmailScreen` para el login (email → magic link → home sin ProfileGate).
//  - `LandingShowcase` para enseñar el producto en acción dentro de la hoja.

import { useState } from 'react'
import { Button, GlobeSheet, Logo, Stack } from '../../ui'
import { HOME_DEMO_PINS } from '../home/homeDemoPins'
import { LandingShowcase } from './LandingShowcase'
import { EnterScreen } from './EnterScreen'
import { LoginEmailScreen } from './LoginEmailScreen'
import styles from './Landing.module.css'

// Qué pantalla de auth muestra la landing cuando el usuario pulsa un CTA.
type AuthMode = 'none' | 'signup' | 'login'

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
  // El auth NO está a la vista: al pulsar un CTA se muestra la pantalla correspondiente
  // a PANTALLA COMPLETA (patrón aprobado #474), no un modal.
  const [authMode, setAuthMode] = useState<AuthMode>('none')

  const joining = Boolean(groupName)

  // Alta: EnterScreen (nombre + email → dentro al instante). Mismo flujo en ambos
  // contextos (landing genérica e invitación a viaje).
  if (authMode === 'signup') {
    return (
      <EnterScreen joining={joining} redirectTo={redirectTo} onBack={() => setAuthMode('none')} />
    )
  }

  // Login: LoginEmailScreen (solo email → magic link → home directa sin ProfileGate).
  // Desde el flujo de invitación, "¿Ya tienes cuenta? Entra" abre el login: el auto-join
  // al volver del enlace se encarga del grupo. El redirectTo preserva el destino deep-link
  // guardado por App.tsx en lg.next.
  if (authMode === 'login') {
    return (
      <LoginEmailScreen
        redirectTo={redirectTo}
        onBack={() => setAuthMode('none')}
        onSignUp={() => setAuthMode('signup')}
      />
    )
  }

  return (
    <main className={styles.page}>
      <GlobeSheet
        pins={HOME_DEMO_PINS}
        // Pines DECORATIVOS: vista mundo fija (sin fit) → el globo héroe se ve SIEMPRE
        // esférico, nunca aplanado por un encuadre cercano de pines agrupados.
        framing="world"
        // Tocar un pin demo en la landing = invitar a crear (no hay viaje real).
        onOpenPin={() => setAuthMode('signup')}
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
              <p className={styles.lead}>
                Guarda lo que vivís. Compartid cada momento de una forma diferente.
              </p>
            </>
          ) : (
            <>
              <h1 className={styles.headline}>
                Comparte tus momentos <span className={styles.accent}>de una forma diferente</span>
              </h1>
              <p className={styles.lead}>
                Guarda tu viaje, comparte cada lugar y deja que tu gente interactúe contigo.
              </p>
            </>
          )}

          <Stack gap={2} className={styles.actions}>
            {/* CTA primario: alta → EnterScreen (nombre + email). */}
            <Button
              size="lg"
              fullWidth
              onClick={() => setAuthMode('signup')}
              data-testid="open-auth"
            >
              {joining ? 'Únete al viaje' : 'Crear tu viaje'}
            </Button>
            {/* CTA secundario: login → LoginEmailScreen (solo email). */}
            <Button variant="ghost" size="lg" fullWidth onClick={() => setAuthMode('login')}>
              {joining ? '¿Ya tienes cuenta? Entra' : 'Ya tengo cuenta · Entrar'}
            </Button>
          </Stack>

          {/* Nota de ayuda: los viajes van por enlace, no por código manual. */}
          {!joining && (
            <p className={['t-label', styles.linkHint].join(' ')}>
              ¿Te han pasado un enlace? Ábrelo y entras directo.
            </p>
          )}
        </div>

        {/* Showcase de un VIAJE DE EJEMPLO (diario + reto + marcador): el visitante ve el
            producto en acción de un vistazo, dentro de la hoja (scrolleable). No lo
            mostramos en el flujo de invitación (ya vienen a un viaje concreto): ahí el hero
            + CTA bastan y el showcase distraería del "únete a <grupo>". */}
        {!joining && (
          <LandingShowcase className={styles.how} onStart={() => setAuthMode('signup')} />
        )}
      </GlobeSheet>
    </main>
  )
}
