import { Skeleton } from './Skeleton'
import { Stack } from './Stack'
import { Row } from './Row'
import styles from './RouteSkeletons.module.css'

// Skeletons de fallback de <Suspense> POR FAMILIA de ruta (issue #526). Antes,
// las 6 rutas lazy de App.tsx (viaje, jugar, crear/perfil/admin…) compartían un
// único spinner centrado (BootScreen): cada navegación "reseteaba" la sensación
// de fluidez, sin pista del layout que está a punto de llegar. La home ya tenía
// su propio HomeSkeleton (features/home/HomePage.tsx) — este fichero generaliza
// ese patrón a las demás familias, con las primitivas existentes (`Skeleton`,
// shimmer + prefers-reduced-motion ya resueltos ahí) y los tokens de escena.
//
// Todos son puramente presentacionales, sin datos ni estado: solo imitan el
// hueco que va a ocupar la pantalla real. `role="status"` + `aria-label` los
// anuncia como región de carga; los bloques individuales son `aria-hidden`
// (los pone <Skeleton/>), así un lector de pantalla no lee "cargando" N veces.
//
// Issue "entrada al viaje sin flashazo": Viaje/Jugar/Home son ESCENAS OSCURAS a
// sangre (mapa/globo/foto, tokens `--scene-*`) — sus esqueletos deben arrancar
// YA en ese tono (`tone="scene"` de `<Skeleton/>`, fondo `--scene-bg`), nunca en
// el papel claro por defecto. Solo el utilitario (formularios: crear/perfil/
// admin) sigue siendo papel — es fiel a `ShellUtilitario`, que es papel de verdad.

// ── Viaje (TripPage): cabecera + mapa/globo + tira de recuerdos ──────────────
// También sirve como esqueleto de DATOS de TripPage (mientras `useTripData`
// resuelve, ver TripPage.tsx): antes tenía su propio esqueleto inline, en tonos
// de papel — dos esqueletos distintos (y de dos colores distintos) para la
// MISMA espera. Reusar este componente en los dos momentos (chunk cargando +
// datos cargando) los hace coherentes por construcción.
export function TripRouteSkeleton({ ariaLabel = 'Cargando…' }: { ariaLabel?: string } = {}) {
  return (
    <main className={`${styles.page} ${styles.pageDark}`} role="status" aria-label={ariaLabel}>
      <div className={styles.header}>
        <Skeleton tone="scene" width={40} height={40} radius="full" />
        <Skeleton tone="scene" className={styles.headerTitle} width={140} height={18} />
        <div className={styles.headerSpacer} aria-hidden="true" />
      </div>

      {/* Bloque de mapa/globo: tono de escena oscuro, sin shimmer (igual que el
          fondo estático de MapSkeleton) — el mapa real siempre parte de oscuro. */}
      <div className={styles.scene} aria-hidden="true" />

      <div className={styles.strip}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} tone="scene" className={styles.stripCard} height={72} radius="lg" />
        ))}
      </div>
    </main>
  )
}

// ── Jugar (PlayChallenge): escena a sangre + hoja inferior con la respuesta ──
export function PlayRouteSkeleton() {
  return (
    <main className={styles.page} role="status" aria-label="Cargando…">
      <div className={styles.playScene} aria-hidden="true" />
      <div className={styles.sheet}>
        <Skeleton width="55%" height={18} />
        <Skeleton width="100%" height={44} radius="md" />
      </div>
    </main>
  )
}

// ── Utilitario (crear viaje/recuerdo/reto, perfil, admin): cabecera + campos ─
export function UtilityRouteSkeleton() {
  return (
    <main className={styles.page} role="status" aria-label="Cargando…">
      <div className={styles.header}>
        <Skeleton width={40} height={40} radius="full" />
        <Skeleton className={styles.headerTitle} width={160} height={18} />
        <div className={styles.headerSpacer} aria-hidden="true" />
      </div>

      <div className={styles.fields}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={styles.field}>
            <Skeleton width={90} height={12} />
            <Skeleton width="100%" height={44} radius="sm" />
          </div>
        ))}
      </div>
    </main>
  )
}

// ── Home (HomeDashboard): escena de globo a sangre + dock de viajes ─────────
//
// Issue "perf(cargas): entrada sin saltos": la home logueada es la ÚNICA ruta
// lazy de App.tsx sin familia de skeleton propia — antes caía al
// `UtilityRouteSkeleton` genérico (cabecera + 4 campos, forma de FORMULARIO)
// mientras se descargaba el chunk de `HomePage`, y en cuanto montaba pintaba
// SU PROPIO esqueleto mientras `useHomeData` resolvía. Sacamos el esqueleto de
// la home a esta familia compartida para que el fallback de `<Suspense>`
// (mientras llega el chunk) y el esqueleto por datos (mientras `useHomeData`/
// `useSession` resuelven, ver `HomePage.tsx`) sean el MISMO layout.
//
// Issue "entrada al viaje sin flashazo": la forma de arriba (globo claro +
// banner + feed de tarjetas blancas) quedó desfasada del rediseño #568 ("sin
// hoja blanca": la home pasó a ser una escena INMERSIVA a sangre — globo +
// TODO el chrome flotando encima, ver `HomeDashboard.module.css`). El esqueleto
// seguía pintando tarjetas de tono 'surface' (claro) sobre `.lg-page` (que
// hereda el papel del body) y "brillaba" en blanco un instante contra el fondo
// oscuro real. Ahora anticipa la MISMA escena a sangre: fondo `--scene-bg`,
// marca+avatar arriba (`.homeOverlay`, espejo de `HomeDashboard` `.overlay`) y
// el dock inferior (etiqueta + carrusel de viajes) en placeholders
// `tone="scene"`.
export function HomeRouteSkeleton() {
  return (
    <div className={styles.homeScene} role="status" aria-label="Cargando tu inicio">
      <Row className={styles.homeOverlay} justify="between" gap={3}>
        <Skeleton tone="scene" width={112} height={22} radius="sm" />
        <Skeleton tone="scene" width={36} height={36} radius="full" />
      </Row>

      {/* Globo a sangre: mismo bloque estático (sin shimmer) que `.scene` del
          viaje — el globo real siempre parte de oscuro. */}
      <div className={styles.homeSpacer} aria-hidden="true" />

      <Stack gap={2} className={styles.homeDock}>
        <Skeleton tone="scene" width={140} height={14} />
        <Row gap={3} align="stretch">
          {[0, 1].map((i) => (
            <Skeleton key={i} tone="scene" className={styles.homeCard} height={200} radius="lg" />
          ))}
        </Row>
      </Stack>
    </div>
  )
}
