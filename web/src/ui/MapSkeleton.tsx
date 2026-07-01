import { useEffect } from 'react'
import { Spinner } from './Spinner'
import { useReducedMotion } from './motion'
import styles from './MapSkeleton.module.css'

interface Props {
  /**
   * Con `true` el skeleton está saliendo: aplica el fundido de salida y, al
   * acabar, el padre lo desmonta. Con `false` (por defecto) se ve a plena opacidad.
   */
  hidden?: boolean
  /** Se llama al terminar el fundido de salida, para que el padre lo desmonte. */
  onFadeOutEnd?: () => void
  className?: string
}

/**
 * Placeholder a pantalla completa mientras un mapa carga sus teselas. Antes de
 * este componente, el contenedor del mapa quedaba en un negro casi liso con, a
 * veces, un pin suelto: en el primer render "parecía roto" (4/4 en un test de
 * diseño). Ahora se ve un fondo de escena con una textura sutil y un spinner
 * discreto, coherente con `--scene-*`; en cuanto el mapa está listo (`load`/
 * `idle`/`tilesloaded`) el padre lo marca `hidden` y se funde con `--motion-*`.
 *
 * Compartido por los tres mapas (globo del viaje, plano de fallback y el de
 * jugar) para que el estado de carga sea idéntico en toda la app. No toca la
 * lógica del mapa: es puramente presentacional y `aria-hidden` (el estado de
 * espera lo comunica el propio Spinner con su `role=status`).
 */
export function MapSkeleton({ hidden = false, onFadeOutEnd, className }: Props) {
  const reduced = useReducedMotion()
  const classes = [styles.root, hidden ? styles.hidden : '', className].filter(Boolean).join(' ')

  // Sin movimiento no hay transición de opacity, así que `onTransitionEnd` nunca
  // dispararía y el padre no nos desmontaría (quedaría una capa invisible). Con
  // reduced-motion avisamos en cuanto nos marcan ocultos: desmonte inmediato.
  useEffect(() => {
    if (hidden && reduced) onFadeOutEnd?.()
  }, [hidden, reduced, onFadeOutEnd])

  return (
    <div
      className={classes}
      aria-hidden="true"
      // El fundido de salida es una transición de opacity sobre `.root`; al
      // terminar avisamos al padre para que nos desmonte (evita dejar una capa
      // invisible sobre el mapa). Solo nos importa la transición del propio nodo.
      onTransitionEnd={(e) => {
        if (hidden && e.target === e.currentTarget && e.propertyName === 'opacity') {
          onFadeOutEnd?.()
        }
      }}
    >
      <Spinner size={26} className={styles.spinner} label="Cargando mapa" />
    </div>
  )
}
