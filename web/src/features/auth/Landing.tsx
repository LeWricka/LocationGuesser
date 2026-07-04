// Landing pública para visitantes SIN sesión (issue #175; portada visual #183;
// patrón globo + hoja #343; flujo email-first #506).
//
// REDISEÑO INMERSIVO (issue #622): la landing es la ESCENA DE PROMESA — regla de
// sistema "escena = inmersivo" (misma gramática que la home logueada #568/#570).
// Fuera el patrón globo + HOJA BLANCA: el héroe (100dvh) es una escena oscura
// continua —el globo de pines-foto ocupa la parte alta, marca + claim + CTA +
// hint de enlace viven DEBAJO, en la propia escena (tokens --scene-*), sin
// costura a papel—. El scroll sigue sobre la MISMA escena oscura (sin salto de
// fondo): "cómo funciona" + el showcase de capturas, en tarjetas de vidrio
// (`.lg-glass`, ver LandingShowcase). El acento en cursiva del claim usa un
// teal ACLARADO (no el `--accent` de sistema, pensado para chrome sobre PAPEL)
// para leer AA sobre el fondo oscuro (ver `.accent` en el CSS module).
//
// La política es passwordless puro: sin contraseñas (cuentas-y-home.md §1.2).
// MODELO EMAIL-FIRST (issue #506): un único CTA lleva a LoginFlow (email → código OTP).
// Nuevo y recurrente usan el mismo flujo: Supabase detecta si existe la cuenta.
//
// Reutiliza:
//  - `ui/HomeGlobe` (el mismo motor que la home logueada) como protagonista del héroe,
//    en vez del shell `GlobeSheet` (ese patrón queda para pantallas CON hoja de papel,
//    p.ej. la bienvenida sin viajes de HomePage).
//  - `LoginFlow` para el flujo de entrada (email → código OTP → sesión).
//  - `LandingShowcase` para enseñar el producto en acción, ahora en vidrio sobre la escena.

import { useEffect, useState } from 'react'
import { Button, HomeGlobe, LogoTabide, Stack, WordmarkTabide, useToast } from '../../ui'
import { takeLegacySessionNotice } from '../../lib/auth'
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
  // Solo `show`: es estable (useCallback en ToastProvider); el objeto del contexto
  // NO lo es (se recrea en cada render del provider) y como dependencia haría
  // re-correr este efecto tras cada toast.
  const { show } = useToast()

  // Aviso de sesión anónima legada (issue #514): AuthProvider cerró una sesión
  // del modelo viejo (pre-#507) porque ya no vale para crear (RLS exige
  // is_anonymous=false). Se muestra UNA vez, al aterrizar aquí tras el cierre.
  useEffect(() => {
    if (takeLegacySessionNotice()) {
      show('Hemos mejorado el acceso: entra de nuevo con tu correo.', { tone: 'neutral' })
    }
  }, [show])

  const joining = Boolean(groupName)

  // LoginFlow: email → código OTP → sesión. Mismo flujo para nuevo y recurrente.
  if (showAuth) {
    return (
      <LoginFlow groupName={groupName} redirectTo={redirectTo} onBack={() => setShowAuth(false)} />
    )
  }

  return (
    <main className={styles.page}>
      {/* ── Héroe (100dvh): escena oscura continua ─────────────────────────────
          Arriba, el globo héroe (protagonista visual); debajo, EN LA MISMA escena
          (sin hoja de papel), la marca, el claim y el CTA. La zona de contenido es
          SIEMPRE fondo plano `--scene-bg` (nunca se superpone al globo): así el
          contraste del titular/CTA/hint es AA garantizado, pase lo que pase con
          el satélite de fondo (issue #622, gotcha de contraste sobre foto). */}
      <section className={styles.hero}>
        {/* NOTA (issue #622): `HomeGlobe` envuelve su credito "ⓘ" en un
            `aria-hidden="true"` que también contiene ese botón real y enfocable —
            defecto preexistente del componente compartido (`ui/HomeGlobe.tsx`, fuera
            del área de este cambio), IDÉNTICO en `home-dashboard-lleno` (nunca lo vio
            axe ahí; sí lo ve aquí por la altura/orden de scan de esta página). Sin
            regresión real de accesibilidad — mismo comportamiento en todo sitio que usa
            el globo—. Tolerado en `gallery-a11y-baseline.json`; el fix correcto (mover
            `aria-hidden` solo al lienzo del mapa, dejando el botón de crédito fuera)
            vive en HomeGlobe y queda para un follow-up. */}
        <div className={styles.heroGlobe}>
          <HomeGlobe
            pins={HOME_DEMO_PINS}
            // Pines DECORATIVOS: vista mundo fija (sin fit) → el globo héroe se ve SIEMPRE
            // esférico, nunca aplanado por un encuadre cercano de pines agrupados.
            framing="world"
            // Tocar un pin demo en la landing = invitar a crear (no hay viaje real).
            onOpenPin={() => setShowAuth(true)}
          />
        </div>

        {/* Marca sobre el globo: mismo velo/tinta de escena que la home logueada. */}
        <div className={styles.heroChrome}>
          <span className={styles.brand}>
            {/* Variante `oscuro`: paleta propia (papel + oro + teal) sobre la escena
                oscura del globo héroe, en vez de aplanarse a un solo tono (#557). */}
            <LogoTabide variant="oscuro" size={22} />
            <WordmarkTabide size={18} />
          </span>
        </div>

        {/* Contenido del héroe: fondo PLANO de escena (no foto) — el titular serif, el
            CTA y el hint del enlace nunca compiten con el satélite de fondo. */}
        <div className={styles.heroContent}>
          {joining ? (
            <>
              <p className={[styles.eyebrow, 't-label'].join(' ')}>Te han invitado</p>
              <h1 className={[styles.headline, 't-hero'].join(' ')}>
                Vive los viajes de <span className={styles.accent}>{groupName}</span>
              </h1>
              <p className={styles.lead}>
                Guarda lo que vivís. Compartid cada momento de una forma diferente.
              </p>
            </>
          ) : (
            <>
              <h1 className={[styles.headline, 't-hero'].join(' ')}>
                Comparte tus momentos <span className={styles.accent}>de una forma diferente</span>
              </h1>
              <p className={styles.lead}>
                Guarda tu viaje, comparte cada lugar y deja que tu gente lo viva contigo.
              </p>
            </>
          )}

          <Stack gap={2} className={styles.actions}>
            {/* CTA único: email-first (nuevo y recurrente, mismo flujo). Variante
                `primary` = teal sólido (token `--color-accent`, ver Button.module.css). */}
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
      </section>

      {/* ── Scroll continuo, MISMA escena oscura (sin salto a papel) ───────────
          Showcase de un VIAJE DE EJEMPLO (diario + reto + marcador): el visitante ve el
          producto en acción de un vistazo, en tarjetas de vidrio sobre la escena. No lo
          mostramos en el flujo de invitación (ya vienen a un viaje concreto): ahí el hero
          + CTA bastan y el showcase distraería del "únete a <grupo>". */}
      {!joining && (
        <section className={styles.below}>
          <LandingShowcase className={styles.how} onStart={() => setShowAuth(true)} />
        </section>
      )}
    </main>
  )
}
