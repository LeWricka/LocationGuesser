import type { LucideIcon, LucideProps } from 'lucide-react'

interface Props extends Omit<LucideProps, 'ref'> {
  /** Glifo de Lucide a pintar (p.ej. `ArrowLeft`). */
  icon: LucideIcon
  /** Lado en px del cuadro del icono. Por defecto 20 (control móvil cómodo). */
  size?: number
}

// Envoltorio único para los iconos de control (Lucide). Centraliza los defaults
// para que TODOS los iconos compartan grosor y color: así no se cuela un set con
// stroke distinto (el "tell" de prototipo que estamos eliminando). El color sale
// de `currentColor`, de modo que el icono hereda el color del botón/token padre
// sin hardcodear nada. Tamaño por defecto 20 px (ajustable por prop puntual).
//
// Convención de accesibilidad: un icono de control SIEMPRE va dentro de un
// <button> con su propio `aria-label`; aquí lo marcamos `aria-hidden` para que el
// lector anuncie la etiqueta del botón, no el nombre del glifo (evita doble voz).
export function Icon({ icon: Glyph, size = 20, strokeWidth = 2, ...rest }: Props) {
  return <Glyph size={size} strokeWidth={strokeWidth} aria-hidden="true" {...rest} />
}
