// Mini-simulación CSS de un gesto del producto (issue #625): sustituye al icono
// estático de las slides por una coreografía sobria del MISMO icono (sin capturas
// ni assets externos, sin CDNs). Cada `kind` es un gesto reconocible que se repite
// en varios tutoriales (ver slides.ts): tocar/capturar, guardar, ubicar en el
// mapa, compartir por enlace, cuenta atrás, o la sorpresa de la bienvenida.
//
// Se monta DENTRO de un "escenario" (tarjeta con marco, patrón de las capturas de
// producto de la landing — aquí sin imagen, solo el icono animado) para que lea
// como una demo del producto y no como un simple icono decorativo.
//
// Toda la animación es de ENTRADA (un ciclo, o como mucho un puñado de pasadas
// acotadas para el eco del pin/timer) — nunca decorativa en bucle. Se apaga entera
// con prefers-reduced-motion (ver el módulo CSS).

import { Icon } from '../../ui'
import type { OnboardingSlide } from './slides'
import styles from './OnboardingVisual.module.css'

interface Props {
  visual: OnboardingSlide['visual']
  icon: OnboardingSlide['icon']
}

export function OnboardingVisual({ visual, icon }: Props) {
  return (
    <div className={[styles.stage, styles[`stage-${visual}`]].join(' ')} aria-hidden="true">
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
