// Landing pública para visitantes SIN sesión (issue #175; portada visual #183;
// patrón globo + hoja #343; flujo email-first #506).
//
// REDISEÑO INMERSIVO (issue #622): la landing es la ESCENA DE PROMESA — regla de
// sistema "escena = inmersivo" (misma gramática que la home logueada #568/#570).
// Fuera el patrón globo + HOJA BLANCA: el héroe (100dvh) es una escena oscura
// continua —el globo de pines-foto ocupa la parte alta, marca + claim + CTA +
// hint de enlace viven DEBAJO, en la propia escena (tokens --scene-*), sin
// costura a papel—. El scroll sigue sobre la MISMA escena oscura (sin salto de
// fondo): la NARRATIVA en dos partes (issue #731) + el cierre con CTA, en
// tarjetas de vidrio (`.lg-glass`, ver LandingShowcase). El acento en cursiva
// del claim usa un teal ACLARADO (no el `--accent` de sistema, pensado para
// chrome sobre PAPEL) para leer AA sobre el fondo oscuro (ver `.accent` en el
// CSS module).
//
// NARRATIVA EN DOS PARTES (issue #731): tras el héroe, la portada cuenta el
// producto en el orden de la identidad de producto — Parte 1 "Guarda el viaje"
// (la esencia, primero) y Parte 2 "Y luego, jugad" (el gancho social, después).
// Sustituye al carrusel plano de 4 capturas + lista de pasos anterior (#652/#695).
// Ver `LandingShowcase`/`landingShowcaseData.ts` para el contenido de cada parte.
//
// La política es passwordless puro: sin contraseñas (cuentas-y-home.md §1.2).
// MODELO EMAIL-FIRST (issue #506): el CTA primario lleva a LoginFlow (email →
// código OTP). Nuevo y recurrente usan el mismo flujo: Supabase detecta si existe
// la cuenta.
//
// ENGANCHE DEL VISITANTE NUEVO (issue #916): el héroe deja claro QUÉ es Momentu y
// PARA QUIÉN (grupos de viaje/amigos) y sube el gancho del juego (adivinar en el
// mapa dónde es cada foto) al subtítulo, sin tocar la frase ancla de marca. Junto
// al CTA primario, un CTA secundario "Ver un ejemplo" mete al visitante en el viaje
// de EJEMPLO con recorrido guiado SIN registrarse (lo enruta App vía el hash
// `#g=ejemplo&tour=1&from=landing`, ver `ExampleTripPublic`); al terminar el
// recorrido, el cierre invita a registrarse.
//
// Reutiliza:
//  - `ui/HomeGlobe` (el mismo motor que la home logueada) como protagonista del héroe,
//    en vez del shell `GlobeSheet` (ese patrón queda para pantallas CON hoja de papel,
//    p.ej. la bienvenida sin viajes de HomePage).
//  - `LoginFlow` para el flujo de entrada (email → código OTP → sesión).
//  - `LandingShowcase` para la narrativa en dos partes, en vidrio sobre la escena.

import { useState } from 'react'
import { Button, HomeGlobe, LogoMomentu, Stack, WordmarkMomentu } from '../../ui'
import { HOME_DEMO_PINS } from '../home/homeDemoPins'
import { LandingShowcase } from './LandingShowcase'
import { LANDING_MAP_CREDIT } from './landingShowcaseData'
import { LoginFlow } from './LoginFlow'
import { exampleTripHash } from '../../lib/route'
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

  // "Ver un ejemplo" (issue #916): navega al viaje de EJEMPLO con la guía conducida
  // marcada como origen "landing". App lo intercepta (`ExampleTripPublic`) y lo sirve
  // SIN sesión; el cierre de la guía invita a registrarse. No hace falta `showAuth`:
  // el cambio de hash lo enruta App, no este componente.
  const goToExample = () => {
    window.location.hash = exampleTripHash(true, false, true)
  }

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
            <LogoMomentu size={22} />
            <WordmarkMomentu size={18} />
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
              {/* Para-quién arriba del todo (issue #916): que en el primer vistazo
                  quede claro que Momentu es para un GRUPO (de viaje, de amigos), no
                  una app en solitario. */}
              <p className={[styles.eyebrow, 't-label'].join(' ')}>Para tu grupo de viaje</p>
              {/* Frase ancla de marca (CLAUDE.md): "viajes" (no "momentos") — decisión
                  de producto para que se entienda de un vistazo que es una app de
                  VIAJES; el gancho es "compartir distinto", la mecánica de adivinar
                  baja al subtítulo. */}
              <h1 className={[styles.headline, 't-hero'].join(' ')}>
                Comparte tus viajes <span className={styles.accent}>de una forma diferente</span>
              </h1>
              {/* Valor + gancho del juego SUBIDO al héroe (issue #916): qué es (un
                  diario de viaje) y el gancho (adivinar en el mapa dónde es cada
                  foto), sin esperar al cierre de la narrativa. */}
              <p className={styles.lead}>
                Un diario de viaje que guardáis juntos en el mapa. Subid vuestras fotos y jugad a
                adivinar dónde es cada una: gana quien más se acerca.
              </p>
            </>
          )}

          <Stack gap={2} className={styles.actions}>
            {/* CTA primario: email-first (nuevo y recurrente, mismo flujo). Variante
                `primary` = teal sólido (token `--color-accent`, ver Button.module.css). */}
            <Button size="lg" fullWidth onClick={() => setShowAuth(true)} data-testid="open-auth">
              {joining ? 'Únete al viaje' : 'Empieza a compartir'}
            </Button>
            {/* CTA secundario (issue #916): mete al visitante en el viaje de EJEMPLO
                (`#g=ejemplo&tour=1&from=landing`) SIN registrarse — recorrido guiado,
                solo lectura, 100% en cliente (ver App `ExampleTripPublic`). Solo en la
                landing genérica: en el flujo de invitación ya vienen a un viaje real. */}
            {!joining && (
              <Button
                variant="secondary"
                size="lg"
                fullWidth
                onClick={goToExample}
                data-testid="see-example"
              >
                Ver un ejemplo
              </Button>
            )}
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
          Narrativa en dos partes (issue #731): Parte 1 "Guarda el viaje" (la esencia)
          y Parte 2 "Y que tu gente sea parte" (compartir, jugar es solo UNA forma —
          reorientación #733), cada una con su captura real en tarjetas de vidrio
          sobre la escena. No la mostramos en el flujo de invitación (ya vienen a un
          viaje concreto): ahí el hero + CTA bastan y la narrativa distraería del
          "únete a <grupo>". */}
      {!joining && (
        <section className={styles.below}>
          <LandingShowcase className={styles.how} onStart={() => setShowAuth(true)} />

          {/* Pie de página discreto (issue #733): el crédito de los tiles Esri de la
              captura de la bitácora (Parte 1) YA NO va dentro de esa tarjeta (ensuciaba
              la captura) — vive aquí, una vez, al fondo de toda la landing. No se puede
              quitar (licencia Esri) pero sí apagar visualmente: tinta suave, texto
              pequeño, sigue siendo texto real y legible (axe lo comprueba). */}
          <footer className={styles.footer}>
            <p className={styles.footerCredit}>{LANDING_MAP_CREDIT}</p>
          </footer>
        </section>
      )}
    </main>
  )
}
