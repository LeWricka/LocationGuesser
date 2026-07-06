// Mini-simulación de un gesto del producto (issue #625, imagen real desde #636):
// una coreografía sobria del icono de la slide (tocar/capturar, guardar, ubicar en
// el mapa, compartir por enlace, cuenta atrás, o la sorpresa de la bienvenida) SOBRE
// una imagen real de fondo (captura de producto o foto de viaje, ver slides.ts) —
// antes era un lienzo liso (`--scene-bg`), que en captura se leía "vacío/triste"
// (feedback del dueño). La imagen es la ÚNICA parte del escenario que cambia por
// slide; el gesto animado sigue siendo el mismo vocabulario acotado de siempre.
//
// Se monta DENTRO de un "escenario" (marco de móvil, patrón de las capturas de
// producto de la landing — aquí compacto) para que lea como una demo del producto,
// no como un simple icono decorativo.
//
// Ken Burns MUY sutil (issue #717, "más dinámicos"): la foto de fondo vive en su
// propia capa (`.image`, ver el módulo CSS) para poder animar solo su escala sin
// mover el badge/grid/ring que se posan encima. Un solo ciclo lento por slide
// (reinicia porque el padre remonta con `key={index}`, ver OnboardingSlideshow).
//
// Toda la animación es de ENTRADA (un ciclo, o como mucho un puñado de pasadas
// acotadas para el eco del pin/timer) — nunca decorativa en bucle. Se apaga entera
// con prefers-reduced-motion (ver el módulo CSS).

import type { CSSProperties } from 'react'
import { Icon } from '../../ui'
import type { OnboardingSlide } from './slides'
import styles from './OnboardingVisual.module.css'

interface Props {
  visual: OnboardingSlide['visual']
  icon: OnboardingSlide['icon']
  /** Imagen real de fondo del marco (ver slides.ts: captura de producto o foto de viaje). */
  image: OnboardingSlide['image']
}

// La imagen llega por CSS custom property (no `style.backgroundImage` directo):
// así el módulo CSS sigue siendo la única fuente de verdad del resto de capas
// (escala, posición, velo de contraste, Ken Burns) y el TSX solo aporta el dato
// que varía.
function imageStyle(image: string): CSSProperties {
  return { '--stage-image': `url('${image}')` } as CSSProperties
}

export function OnboardingVisual({ visual, icon, image }: Props) {
  return (
    <div className={[styles.stage, styles[`stage-${visual}`]].join(' ')} aria-hidden="true">
      <span className={styles.image} style={imageStyle(image)} />
      {/* El escenario del pin dibuja una retícula de mapa detrás del icono. */}
      {visual === 'pin' && <span className={styles.grid} />}
      {/* El escenario del timer dibuja el aro de cuenta atrás detrás del icono. */}
      {visual === 'timer' && <span className={styles.ring} />}
      <span className={[styles.badge, styles[`badge-${visual}`]].join(' ')}>
        <Icon icon={icon} size={30} strokeWidth={1.5} />
      </span>
      {/* Eco de contacto: pin (aterriza), tap (se pulsa) y timer (cuenta atrás). */}
      {(visual === 'pin' || visual === 'tap' || visual === 'timer') && (
        <span className={[styles.echo, styles[`echo-${visual}`]].join(' ')} />
      )}
    </div>
  )
}
