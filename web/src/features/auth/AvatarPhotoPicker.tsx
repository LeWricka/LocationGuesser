import type { ChangeEvent } from 'react'
import { Camera, Repeat } from 'lucide-react'
import { Icon, Spinner } from '../../ui'
import styles from './AvatarPhotoPicker.module.css'

interface Props {
  /** URL de la foto actual (object URL o pública) cuando hay foto; null si no. */
  preview: string | null
  /** Subida/recorte en curso: muestra spinner y bloquea los controles. */
  loading?: boolean
  /** Devuelve el fichero elegido (o null si se canceló). */
  onPick: (file: File | null) => void
  /** Quita la foto y vuelve al animal por defecto. */
  onClear: () => void
}

// Control simple de foto de perfil para la pantalla de perfil. Propio de
// features/auth (NO importa el de features/create): aquí la foto es un disco
// circular pequeño, no un tile grande de reto. Sin foto: un disco discreto que
// invita a subir. Con foto: la miniatura circular con un botón de quitar.
export function AvatarPhotoPicker({ preview, loading = false, onPick, onClear }: Props) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    // Permite re-elegir el mismo fichero (de lo contrario onChange no dispara).
    e.target.value = ''
    onPick(file)
  }

  if (preview) {
    return (
      <div className={styles.filled}>
        <img className={styles.thumb} src={preview} alt="Vista previa de tu foto de perfil" />
        {loading && (
          <span className={styles.thumbBusy} aria-hidden>
            <Spinner size={18} />
          </span>
        )}
        <div className={styles.actions}>
          <label className={styles.change}>
            <Icon icon={Repeat} size={16} />
            <span>Cambiar</span>
            <input
              type="file"
              accept="image/*"
              aria-label="Cambiar tu foto de perfil"
              disabled={loading}
              className={styles.input}
              onChange={handleChange}
            />
          </label>
          <button type="button" className={styles.remove} onClick={onClear} disabled={loading}>
            Quitar foto
          </button>
        </div>
      </div>
    )
  }

  return (
    <label className={styles.empty} aria-busy={loading || undefined}>
      <span className={styles.icon} aria-hidden>
        {loading ? <Spinner size={22} /> : <Icon icon={Camera} size={22} />}
        {!loading && <span className={styles.plus}>+</span>}
      </span>
      <span className={styles.emptyLabel}>{loading ? 'Subiendo…' : 'Subir foto'}</span>
      <input
        type="file"
        accept="image/*"
        aria-label="Subir tu foto de perfil"
        disabled={loading}
        className={styles.input}
        onChange={handleChange}
      />
    </label>
  )
}
