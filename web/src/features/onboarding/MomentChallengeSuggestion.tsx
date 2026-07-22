// Sugerencia contextual del onboarding del CREADOR (pieza 3/4): pegada al
// PRIMER momento que acaba de guardar, invita a convertirlo en un reto. Copy y
// jerarquía del prototipo (`#cdiario .suggest`): la miniatura del propio
// momento + el titular + un único CTA que reutiliza el flujo REAL de crear
// reto (TripPage navega con `promoteChallengeHash`, el mismo camino que
// "Convertir en reto" de MomentSheet — esto no reimplementa nada, solo apunta
// al mismo sitio). Cerrable con × en cualquier momento: nunca bloquea el
// Diario, y solo se muestra la PRIMERA vez (lo decide `useCreadorOnboarding`,
// no este componente).

import { X } from 'lucide-react'
import { Button, Icon } from '../../ui'
import styles from './MomentChallengeSuggestion.module.css'

export interface Props {
  /** Foto del momento recién guardado (propio del creador: sin anti-spoiler). */
  photoUrl?: string | null
  /** "Crear un reto": promueve el momento (flujo real, no duplicado aquí). */
  onCreateChallenge: () => void
  onDismiss: () => void
}

export function MomentChallengeSuggestion({ photoUrl, onCreateChallenge, onDismiss }: Props) {
  return (
    <div className={styles.card} role="note" aria-label="¿Y si les lanzas un reto de este momento?">
      <button
        type="button"
        className={styles.close}
        onClick={onDismiss}
        aria-label="Cerrar sugerencia"
      >
        <Icon icon={X} size={16} />
      </button>

      <div className={styles.with}>
        {photoUrl ? (
          <img src={photoUrl} alt="" className={styles.thumb} decoding="async" />
        ) : (
          <span className={styles.thumbFallback} />
        )}
        <h3 className={`t-title ${styles.title}`}>¿Y si les lanzas un reto de este momento?</h3>
      </div>

      <p className={`t-body ${styles.body}`}>
        Tu gente adivina dónde es. Gana quien más se acerca.
      </p>

      <Button fullWidth onClick={onCreateChallenge}>
        Crear un reto
      </Button>
    </div>
  )
}
