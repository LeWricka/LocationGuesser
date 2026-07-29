import type { ReactNode } from 'react'
import { useDelayedFlag, SKELETON_DELAY_MS } from './useDelayedFlag'
import styles from './DelayedFallback.module.css'

interface Props {
  /** El esqueleto real (p.ej. `<TripRouteSkeleton/>`), pintado solo tras el umbral. */
  children: ReactNode
  /**
   * Fondo del HUECO pre-umbral — NUNCA blanco/papel por defecto del body.
   * 'scene' para familias oscuras a sangre (viaje/jugar/home, tono `--scene-bg`);
   * 'paper' para las utilitarias (crear/perfil/admin, tono `--paper`, fiel a
   * `ShellUtilitario`).
   */
  bg: 'scene' | 'paper'
  /**
   * La home es una escena FIJA a viewport (`.homeScene` en RouteSkeletons.module.css,
   * `position: fixed; inset: 0`), no fluye en el documento como el resto de
   * rutas — el hueco debe cubrir el mismo área para no dejar ver el fondo real
   * por debajo mientras esperamos el umbral.
   */
  fixed?: boolean
  ms?: number
}

/**
 * Envuelve un fallback de carga (skeleton) para que solo se pinte pasados `ms`
 * (250 por defecto, issue #984, contrato nativo AC-3). Mientras el umbral no se
 * cumple, en vez de nada (blanco) pintamos un hueco vacío pero con el fondo de
 * la familia — así una resolución rápida no deja ni un fogonazo de color
 * equivocado antes del contenido real. Al superar el umbral, el esqueleto entra
 * con `lg-content-in` (index.css): un fundido corto de opacidad que ya respeta
 * `prefers-reduced-motion` por su cuenta (media query global) sin que este
 * componente tenga que saberlo.
 */
export function DelayedFallback({ children, bg, fixed = false, ms = SKELETON_DELAY_MS }: Props) {
  const show = useDelayedFlag(ms)

  if (!show) {
    const classes = [styles.gap, styles[`bg-${bg}`], fixed ? styles.fixed : null]
      .filter(Boolean)
      .join(' ')
    // `role="status"` (sin aria-label): un lector de pantalla ya anuncia esta
    // región como "cargando"; el esqueleto real (tras el umbral) trae su propio
    // aria-label más específico y la reemplaza, nunca se solapan los dos.
    return <div className={classes} role="status" aria-label="Cargando…" />
  }

  return <div className="lg-content-in">{children}</div>
}
