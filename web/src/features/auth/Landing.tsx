// Landing pública para visitantes SIN sesión (issue #175; portada visual #183;
// patrón globo + hoja #343; flujo email-first #506).
//
// Patrón GLOBO + HOJA (referencia Polarsteps): un globo a sangre arriba con pines-foto
// de datos demo curados (el wow y la identidad) y una HOJA BLANCA que sube debajo con el
// mensaje y el CTA (la legibilidad).
//
// La política es passwordless puro: sin contraseñas (cuentas-y-home.md §1.2).
// MODELO EMAIL-FIRST (issue #506): un único CTA lleva a LoginFlow (email → código OTP).
// Nuevo y recurrente usan el mismo flujo: Supabase detecta si existe la cuenta.
//
// Cambios respecto al diseño anterior (#495):
//  - CTA único: "Empieza a compartir" → LoginFlow (email-first con código OTP).
//  - ELIMINADO: separación signup/login (ya no hay "Crear tu viaje" vs "Ya tengo cuenta").
//  - ELIMINADO: "Tengo un código" (los viajes van por enlace, no por código manual).
//  - Conservada: nota "¿Te han pasado un enlace? Ábrelo y entras directo."
//  - Conservado: showcase del producto en acción dentro de la hoja.
//
// Reutiliza:
//  - `features/home/GlobeSheet` para el patrón globo + hoja.
//  - `LoginFlow` para el flujo de entrada (email → código OTP → sesión).
//  - `LandingShowcase` para enseñar el producto en acción dentro de la hoja.

import { useState } from 'react'
import { Button, GlobeSheet, Logo, Stack } from '../../ui'
import { HOME_DEMO_PINS } from '../home/homeDemoPins'
import { LandingShowcase } from './LandingShowcase'
import { LoginFlow } from './LoginFlow'
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
  // Cuando el usuario pulsa el CTA se muestra el flujo de entrada a pantalla completa.
  const [showAuth, setShowAuth] = useState(false)

  const joining = Boolean(groupName)

  // LoginFlow: email → código OTP → sesión. Mismo flujo para nuevo y recurrente.
  if (showAuth) {
    return (
      <LoginFlow groupName={groupName} redirectTo={redirectTo} onBack={() => setShowAuth(false)} />
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
        onOpenPin={() => setShowAuth(true)}
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
            {/* CTA único: email-first (nuevo y recurrente, mismo flujo). */}
            <Button size="lg" fullWidth onClick={() => setShowAuth(true)} data-testid="open-auth">
              {joining ? 'Únete al viaje' : 'Empieza a compartir'}
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
        {!joining && <LandingShowcase className={styles.how} onStart={() => setShowAuth(true)} />}
      </GlobeSheet>
    </main>
  )
}
