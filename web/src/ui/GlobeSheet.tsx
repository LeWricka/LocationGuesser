import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { HomeGlobe } from './HomeGlobe'
import type { GlobePin } from './HomeGlobe'
import styles from './GlobeSheet.module.css'

interface Props {
  /** Pines-foto del globo héroe (viajes del usuario, o demo en la landing). */
  pins: GlobePin[]
  /** Tocar un pin → abre su destino. */
  onOpenPin?: (targetId: string) => void
  /**
   * Encuadre del globo (se pasa tal cual a HomeGlobe):
   *  - `'pins'` (por defecto): encuadra los pines (home logueada con viajes reales).
   *  - `'world'`: vista mundo fija, sin fit (landing, pines decorativos → globo esférico).
   */
  framing?: 'pins' | 'world'
  /**
   * Overlay mínimo sobre el globo (marca "Tabide" + ajustes/acción). Va con tinta de
   * escena y safe-area; no debe tapar los pines (es una franja fina arriba).
   */
  overlay?: ReactNode
  /** Contenido de la hoja blanca (mensaje + CTA, o feed). Lleva su propio scroll. */
  children: ReactNode
  /** FAB "+" constante, anclado abajo-derecha sobre la hoja (crear viaje). */
  fab?: ReactNode
  /** Etiqueta accesible de la hoja. */
  sheetLabel?: string
}

// Dos posiciones de reposo de la hoja, como fracción del alto del visor que ocupa el
// GLOBO (lo que asoma por encima de la hoja). Recogida deja ver el globo héroe; subida
// lo tapa casi entero para leer el feed largo. El umbral decide a cuál engancha al soltar.
const PEEK = 0.56 // hoja recogida: el globo ocupa ~44% arriba (héroe visible)
const RAISED = 0.12 // hoja subida: el globo queda como una cinta fina arriba

/**
 * Shell del patrón GLOBO + HOJA (referencia Polarsteps): globo héroe a sangre arriba y
 * una HOJA BLANCA que sube debajo con el contenido legible. El globo da el wow; la hoja
 * la legibilidad. Separación de gestos (decisión cerrada): el globo vive en su zona y
 * gestiona paneo/zoom; la hoja es una CAPA DE SCROLL propia con asa — arrastrar el asa
 * la sube/baja y NO mueve el globo. Se mantiene el FAB "+" (sin barra de pestañas).
 *
 * La hoja tiene dos posiciones (recogida/subida) que el asa alterna por toque o arrastre.
 * Con la hoja subida relajamos el render del globo (queda tapado). 100dvh + safe-area.
 */
export function GlobeSheet({
  pins,
  onOpenPin,
  framing = 'pins',
  overlay,
  children,
  fab,
  sheetLabel,
}: Props) {
  // Posición de la hoja como fracción del alto del visor (top de la hoja). Arranca recogida.
  const [topFrac, setTopFrac] = useState(PEEK)
  // Arrastre activo del asa: durante el drag seguimos el dedo; al soltar, enganchamos.
  const dragStart = useRef<{ y: number; frac: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  const raised = topFrac <= (PEEK + RAISED) / 2

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragStart.current = { y: e.clientY, frac: topFrac }
      setDragging(true)
      e.currentTarget.setPointerCapture?.(e.pointerId)
    },
    [topFrac],
  )

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const start = dragStart.current
    if (!start || typeof window === 'undefined') return
    // El asa arrastra la hoja: el delta del dedo (px) se traduce a fracción del visor.
    const deltaFrac = (e.clientY - start.y) / window.innerHeight
    const next = Math.min(PEEK, Math.max(RAISED, start.frac + deltaFrac))
    setTopFrac(next)
  }, [])

  const endDrag = useCallback(() => {
    if (!dragStart.current) return
    dragStart.current = null
    setDragging(false)
    // Engancha a la posición más cercana (recogida o subida).
    setTopFrac((frac) => (frac <= (PEEK + RAISED) / 2 ? RAISED : PEEK))
  }, [])

  // Toque simple en el asa (sin arrastre real): alterna entre recogida y subida.
  const toggle = useCallback(() => {
    setTopFrac((frac) => (frac > (PEEK + RAISED) / 2 ? RAISED : PEEK))
  }, [])

  return (
    <div className={styles.shell}>
      {/* Zona del GLOBO: gestiona sus propios gestos (paneo/zoom). Ocupa el alto hasta
          donde llega la hoja, así sus pines no quedan bajo ella cuando está recogida. */}
      <div className={styles.globeZone} style={{ height: `${topFrac * 100}dvh` }}>
        <HomeGlobe pins={pins} onOpenPin={onOpenPin} framing={framing} relaxed={raised} />
      </div>

      {/* Overlay (marca + ajustes): hermano del shell (NO dentro de la zona del globo)
          para que su z-index compita con la hoja y la marca nunca quede pisada/cortada. */}
      {overlay && <div className={styles.overlay}>{overlay}</div>}

      {/* Costura héroe + hoja (referencia Polarsteps): un velo que FUNDE el borde del
          globo con el blanco de la hoja. Sin él hay un corte seco con una banda del mapa
          en medio. Va anclado JUSTO encima del borde de la hoja (mismo top, desplazado
          hacia arriba) y degrada de transparente (globo) a la superficie de la hoja. */}
      <div
        className={styles.seam}
        style={{ top: `${topFrac * 100}dvh`, transition: dragging ? 'none' : undefined }}
        aria-hidden="true"
      />

      {/* FALDÓN de papel: rectángulo de superficie (SIN esquinas) anclado al mismo `top`
          que la hoja, justo detrás de ella (z-index 1, entre globo y hoja). La hoja tiene
          esquinas superiores redondeadas apoyadas sobre la escena OSCURA del globo: los
          triángulos que quedan FUERA del arco del radio dejaban asomar el negro de la
          escena. Este faldón pone PAPEL en esos triángulos, así el recorte del radio nunca
          muestra la escena, solo la superficie de la hoja. Alto = la banda del radio (poco):
          la costura sigue sellando el fundido globo→hoja por encima. */}
      <div
        className={styles.skirt}
        style={{ top: `${topFrac * 100}dvh`, transition: dragging ? 'none' : undefined }}
        aria-hidden="true"
      />

      {/* HOJA BLANCA: capa de scroll propia con asa. Sube/baja con el asa; su contenido
          scrollea dentro. El transform la coloca según topFrac; sin transición durante
          el arrastre (sigue al dedo) y suave al soltar (engancha). */}
      <section
        className={styles.sheet}
        style={{
          top: `${topFrac * 100}dvh`,
          transition: dragging ? 'none' : undefined,
        }}
        aria-label={sheetLabel}
      >
        <button
          type="button"
          className={styles.grabZone}
          aria-label={raised ? 'Bajar la hoja' : 'Subir la hoja'}
          aria-expanded={raised}
          onClick={toggle}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span className={styles.grab} aria-hidden="true" />
        </button>

        <div className={styles.scroll}>{children}</div>
      </section>

      {fab && <div className={styles.fab}>{fab}</div>}
    </div>
  )
}
