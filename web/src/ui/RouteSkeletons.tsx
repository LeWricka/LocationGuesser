import { Skeleton } from './Skeleton'
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

// ── Viaje (TripPage): cabecera + mapa/globo + tira de recuerdos ──────────────
export function TripRouteSkeleton() {
  return (
    <main className={styles.page} role="status" aria-label="Cargando…">
      <div className={styles.header}>
        <Skeleton width={40} height={40} radius="full" />
        <Skeleton className={styles.headerTitle} width={140} height={18} />
        <div className={styles.headerSpacer} aria-hidden="true" />
      </div>

      {/* Bloque de mapa/globo: tono de escena oscuro, sin shimmer (igual que el
          fondo estático de MapSkeleton) — el mapa real siempre parte de oscuro. */}
      <div className={styles.scene} aria-hidden="true" />

      <div className={styles.strip}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className={styles.stripCard} height={72} radius="lg" />
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
