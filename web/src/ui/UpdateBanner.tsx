import { RefreshCw } from 'lucide-react'
import { Icon } from './Icon'
import styles from './UpdateBanner.module.css'

interface Props {
  /** Aplica la actualización pendiente (llama a `updateSW(true)` de main.tsx). */
  onUpdate: () => void
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
// una esquina libre en todas partes, pero el centro nunca choca con ninguna.
// role=status (no alert): informa sin interrumpir; nunca se auto-descarta porque
// la actualización sigue pendiente hasta que el usuario la aplica o se oculta la
// pestaña (ver main.tsx).
export function UpdateBanner({ onUpdate }: Props) {
  return (
    <div className={styles.banner} role="status">
      <Icon icon={RefreshCw} size={18} className={styles.icon} />
      <span className={[styles.text, 't-caption'].join(' ')}>Hay una versión nueva</span>
      <button type="button" className={[styles.action, 'lg-press'].join(' ')} onClick={onUpdate}>
        Actualizar
      </button>
    </div>
  )
}
