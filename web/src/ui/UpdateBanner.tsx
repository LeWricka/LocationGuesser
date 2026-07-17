import { RefreshCw, X } from 'lucide-react'
import { Icon } from './Icon'
import styles from './UpdateBanner.module.css'

interface Props {
  /** Aplica la actualización pendiente (llama a `updateSW(true)` de main.tsx). */
  onUpdate: () => void
  /**
   * Descarta ESTA versión pendiente (issue #810): oculta el banner sin aplicar
   * la actualización. Sigue pendiente — se aplicará sola al ocultar la pestaña
   * (comportamiento intacto) — y si el sondeo detecta OTRA versión más nueva,
   * el banner puede volver a aparecer (main.tsx resetea el descarte en cada
   * `onNeedRefresh`).
   */
  onDismiss: () => void
}

// Aviso de "hay versión nueva" tras un deploy (#549). Se monta en su PROPIO root
// de React (ver main.tsx), fuera del árbol de `<App/>`: main.tsx decide cuándo
// aparece según `virtual:pwa-register`, antes de que exista ningún componente de
// producto al que engancharlo, y así no depende de tocar `App.tsx`/`ToastProvider`
// (que no soporta un aviso persistente con acción, solo mensajes efímeros).
//
// Pill flotante centrada abajo, igual que el patrón ya establecido por el propio
// `Toast` (mismo `--z-toast`, mismo ancho acotado): es "el lenguaje de la app" para
// un aviso flotante. Centrado en vez de anclado a una esquina porque las esquinas
// ya están ocupadas por FABs distintos según la pantalla (crear viaje, compartir
// clasificación, "＋" del viaje viven en esquinas opuestas según la vista) — no hay
// una esquina libre en todas partes, pero el centro nunca choca con ninguna
// HORIZONTALMENTE. El choque real (caso Nerea, #810) era VERTICAL: el banner
// vivía a la MISMA altura que esos FAB (mismo `bottom: var(--space-4) +
// safe-area`), tapando botones de jugar — el CSS lo levanta ahora por encima de
// esa fila (ver UpdateBanner.module.css).
//
// role=status (no alert): informa sin interrumpir. Ya no es un aviso "atrapa-
// usuario": el botón ✕ lo descarta (main.tsx marca la versión como vista; si
// llega OTRA versión nueva puede volver a salir) y, aparte del cierre manual,
// la actualización pendiente se sigue aplicando sola al ocultar la pestaña.
// Además (#810) main.tsx ya no lo muestra en absoluto mientras hay un reto
// abierto (`route.challenge`): reaparece al salir del reto si sigue pendiente.
export function UpdateBanner({ onUpdate, onDismiss }: Props) {
  return (
    <div className={styles.banner} role="status">
      <Icon icon={RefreshCw} size={18} className={styles.icon} />
      <span className={[styles.text, 't-caption'].join(' ')}>Hay una versión nueva</span>
      <button type="button" className={[styles.action, 'lg-press'].join(' ')} onClick={onUpdate}>
        Actualizar
      </button>
      <button
        type="button"
        className={[styles.close, 'lg-press'].join(' ')}
        onClick={onDismiss}
        aria-label="Descartar aviso de actualización"
      >
        <Icon icon={X} size={16} />
      </button>
    </div>
  )
}
