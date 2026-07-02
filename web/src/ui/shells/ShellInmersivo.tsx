// ShellInmersivo — shell de pantalla con protagonista visual a sangre.
//
// CUÁNDO USARLO: hay protagonista visual real (Street View, mapa, foto).
// "A sangre" solo donde el contenido lo justifica — no como decoración.
//
// REGLAS DURAS (codificadas):
//  1. `backdrop` OBLIGATORIO — sin protagonista el shell no tiene sentido
//     (evita el vacío negro recurrente de pantallas sin SV/foto).
//  2. `caption` XOR `sheetTitle` — nunca ambos. Si coexisten, lanza error
//     en desarrollo; en producción se suprime caption (sheetTitle gana).
//  3. CTA como footer DENTRO de la hoja (no absoluto) — el contenido
//     scrolleable nunca queda tapado, sea cual sea el alto del botón.
//  4. PROHIBIDO backdrop sin protagonista — el componente no acepta
//     `backdrop` vacío (undefined no activa el layer, sin nodo = base negra).

import type { ReactNode } from 'react'
import styles from './ShellInmersivo.module.css'

interface Props {
  /**
   * Protagonista visual a sangre (mapa, Street View, foto).
   * OBLIGATORIO — el shell no tiene sentido sin él (evita vacío negro).
   */
  backdrop: ReactNode
  /**
   * Cabecera flotante sobre el protagonista (AppHeader variant="floating").
   * Opcional: pantallas de juego pueden prescindir de ella.
   */
  header?: ReactNode
  /**
   * Texto editorial sobre el protagonista, justo por encima de la hoja.
   * MUTUAMENTE EXCLUYENTE con `sheetTitle` — regla dura de composición.
   * En producción, si ambos se pasan, sheetTitle gana; en desarrollo lanza error.
   */
  caption?: ReactNode
  /**
   * Título de la hoja (serif, .t-section). MUTUAMENTE EXCLUYENTE con `caption`.
   */
  sheetTitle?: ReactNode
  /**
   * Contenido con scroll dentro de la hoja.
   */
  children?: ReactNode
  /**
   * CTA fijo al fondo (un <Button fullWidth>).
   * Vive como footer en el flujo flex de la hoja — NUNCA como posición absoluta.
   */
  cta?: ReactNode
  /**
   * Desactiva la coreografía de entrada (backdrop/hoja/stagger/CTA).
   * Solo para tests o la galería cuando haga falta determinismo explícito
   * más allá de `prefers-reduced-motion`; en producción siempre `true` (default).
   */
  entrance?: boolean
}

export function ShellInmersivo({
  backdrop,
  header,
  caption,
  sheetTitle,
  children,
  cta,
  entrance = true,
}: Props) {
  // Guardarraíl de composición: caption y sheetTitle nunca deben coexistir.
  // El design-lint no puede verificar esto a nivel de AST (prop-passing en runtime);
  // el error explícito lo caza en dev y en la galería de shells antes de llegar a prod.
  if (import.meta.env.DEV && caption && sheetTitle) {
    throw new Error(
      '[ShellInmersivo] caption y sheetTitle son mutuamente excluyentes. ' +
        'Usa uno u otro; nunca los dos a la vez.',
    )
  }

  // En producción, sheetTitle gana si ambos se pasan (silencio defensivo).
  const showCaption = caption && !sheetTitle

  // Coreografía de entrada (issue #525): backdrop → hoja → contenido en
  // stagger → CTA con muelle. Las clases van SIEMPRE presentes en el árbol
  // (nunca se togglean tras el montaje), así que la animación CSS corre una
  // única vez al montar el shell (una navegación = un montaje = una entrada);
  // un re-render posterior no la reinicia porque React reconcilia el mismo
  // nodo DOM y `animation-name` no cambia. `entrance={false}` (solo
  // tests/galería) la desactiva sin tocar la API pública por defecto.
  const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ')

  return (
    <div className={styles.root}>
      {/* 1. Protagonista visual: ocupa TODA la pantalla como base. */}
      <div className={cx(styles.backdrop, entrance && styles.backdropIn)}>{backdrop}</div>

      {/* 2. Cabecera flotante (chrome sobre la imagen). */}
      {header && <div className={styles.header}>{header}</div>}

      {/* 3. Caption editorial sobre el protagonista (solo si no hay sheetTitle).
           Nota: backdrops con GPU compositing complejo (gradientes + border-radius oval)
           pueden tapar el caption por stacking order. En esos casos usar sheetTitle. */}
      {showCaption && <div className={styles.caption}>{caption}</div>}

      {/* 4. Hoja blanca que asoma desde abajo.
           El CTA vive DENTRO de la hoja como footer en el flujo flex (no absoluto):
           el .sheetInner scrollea; el .cta queda fijo abajo con flex-shrink: 0.
           Resultado: el CTA NUNCA recorta texto, sea cual sea su alto. */}
      <div className={cx(styles.sheet, entrance && styles.sheetIn)}>
        <div className={styles.sheetPull}>
          <span className={styles.sheetPullBar} />
        </div>
        <div className={cx(styles.sheetInner, entrance && styles.sheetStagger)}>
          {/* Título de la hoja en serif (solo si no hay caption). */}
          {sheetTitle && <SheetTitle>{sheetTitle}</SheetTitle>}
          {children}
        </div>
        {cta && <div className={cx(styles.cta, entrance && styles.ctaIn)}>{cta}</div>}
      </div>
    </div>
  )
}

// Título interno de la hoja: serif, tamaño section, espacio inferior.
// Componente interno (no exportado) para mantener la API de props limpia.
function SheetTitle({ children }: { children: ReactNode }) {
  return (
    <h2
      className="t-section"
      style={{
        color: 'var(--color-text)',
        marginBottom: 'var(--space-4)',
        marginTop: 'var(--space-2)',
      }}
    >
      {children}
    </h2>
  )
}
