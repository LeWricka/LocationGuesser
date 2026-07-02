// ShellInmersivo — shell de pantalla con protagonista visual a sangre.
//
// Reglas duras codificadas:
//  1. `backdrop` es OBLIGATORIO: debe pasarse siempre un nodo protagonista.
//  2. `caption` y `sheetTitle` son mutuamente excluyentes: si se pasan los dos,
//     el componente lanza un error en desarrollo (lint de composición).
//  3. Sin color/espaciado hardcodeado: todo via tokens (design-lint lo verifica).

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
   * MUTUAMENTE EXCLUYENTE con `sheetTitle` (regla dura de composición).
   */
  caption?: ReactNode
  /**
   * Título de la hoja (serif). MUTUAMENTE EXCLUYENTE con `caption`.
   */
  sheetTitle?: ReactNode
  /**
   * Contenido con scroll dentro de la hoja.
   */
  children?: ReactNode
  /**
   * CTA fijo al fondo (un <Button fullWidth>).
   */
  cta?: ReactNode
}

export function ShellInmersivo({ backdrop, header, caption, sheetTitle, children, cta }: Props) {
  // Guardarraíl de composición: caption y sheetTitle nunca deben coexistir.
  // Se evalúa en runtime (útil en dev + galería); el design-lint no puede
  // verificar esto a nivel de AST, de ahí que sea un error explícito.
  if (caption && sheetTitle) {
    throw new Error(
      '[ShellInmersivo] caption y sheetTitle son mutuamente excluyentes. ' +
        'Usa uno u otro; nunca los dos a la vez.',
    )
  }

  return (
    <div className={styles.root}>
      {/* 1. Protagonista visual: ocupa TODA la pantalla como base. */}
      <div className={styles.backdrop}>{backdrop}</div>

      {/* 2. Cabecera flotante (chrome sobre la imagen). */}
      {header && <div className={styles.header}>{header}</div>}

      {/* 3. Caption editorial sobre el protagonista (solo si no hay sheetTitle).
           Nota: backdrops con gradientes complejos o compositing GPU pueden tapar
           el caption. En ese caso, usar sheetTitle en su lugar. */}
      {caption && <div className={styles.caption}>{caption}</div>}

      {/* 4. Hoja blanca que asoma desde abajo. */}
      <div className={styles.sheet}>
        <div className={styles.sheetPull}>
          <span className={styles.sheetPullBar} />
        </div>
        <div className={styles.sheetInner}>
          {/* Título de la hoja en serif (solo si no hay caption). */}
          {sheetTitle && <SheetTitle>{sheetTitle}</SheetTitle>}
          {children}
        </div>
      </div>

      {/* 5. CTA fijo al fondo, por encima de la hoja. */}
      {cta && <div className={styles.cta}>{cta}</div>}
    </div>
  )
}

// Título interno de la hoja: serif, tamaño section, espacio inferior.
// Separado del contenido con un poco de margen.
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
