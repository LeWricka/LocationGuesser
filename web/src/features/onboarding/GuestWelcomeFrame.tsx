// Marco de bienvenida del INVITADO (issue onboarding nuevo, pieza 1/4): UNA
// sola pantalla —no slides— que sustituye al slideshow de 3 pasos que veía
// quien llegaba por un enlace de viaje. Copy y jerarquía validados en
// prototipo (`#invitado`): avatares de quién ya está dentro, eyebrow con el
// viaje, titular con quién invita, el "porqué" (Diario/Bitácora/retos) y un
// único CTA. Escena oscura sobre la portada del viaje si el dueño puso una
// (si no, un degradado de escena igual de oscuro: nunca lienzo vacío).
//
// Presentacional puro: `ReceptorWelcomeGate`/`OnboardingGate` deciden CUÁNDO
// se monta (una vez por usuario) y qué pasa al completarlo (`onEnter`).

import { ArrowRight, MapPin } from 'lucide-react'
import { Button, Icon, AvatarStack, type AvatarStackMember } from '../../ui'
import styles from './GuestWelcomeFrame.module.css'

export interface Props {
  /** Nombre del viaje, para el eyebrow ("Te han invitado · {tripName}"). */
  tripName?: string
  /** Nombre de quien creó el viaje, protagonista del titular. */
  ownerName?: string
  /** Miembros ya dentro del viaje (dueño incluido, el propio receptor no). */
  avatarMembers: AvatarStackMember[]
  /** Cuántos de esos miembros NO son el dueño (para "{ownerName} y N más"). */
  othersCount: number
  /** Portada del viaje ya firmada, o null para el degradado de fondo. */
  coverImageUrl: string | null
  /** Hay un reto EN JUEGO ahora mismo: muestra el aviso "te toca jugar". */
  hasActiveChallenge: boolean
  /** CTA "Ver el viaje": completa la intro y ARRANCA el recorrido guiado del
   * viaje (Diario → Bitácora → retos). No dice "jugar": la identidad es
   * compartir el viaje, la mecánica de adivinar baja al recorrido. */
  onEnter: () => void
}

// "{ownerName} y N más ya están dentro" — grámatica correcta en singular/plural
// y sin nombre (receptor sin dueño resuelto: copy genérico, nunca "de undefined").
function avatarLine(ownerName: string | undefined, othersCount: number): string {
  const name = ownerName?.trim()
  if (!name) {
    return othersCount > 0 ? `Ya sois ${othersCount + 1} en el viaje` : 'Tu gente ya está dentro'
  }
  if (othersCount <= 0) return `${name} ya está dentro`
  if (othersCount === 1) return `${name} y 1 más ya están dentro`
  return `${name} y ${othersCount} más ya están dentro`
}

export function GuestWelcomeFrame({
  tripName,
  ownerName,
  avatarMembers,
  othersCount,
  coverImageUrl,
  hasActiveChallenge,
  onEnter,
}: Props) {
  const eyebrow = tripName ? `Te han invitado · ${tripName}` : 'Te han invitado'
  const title = ownerName ? `Estás dentro del viaje de ${ownerName}` : 'Estás dentro de este viaje'

  return (
    <div className={styles.screen} role="dialog" aria-modal="true" aria-label={title}>
      <div className={styles.backdrop}>
        {coverImageUrl ? (
          <img src={coverImageUrl} alt="" className={styles.photo} decoding="async" />
        ) : (
          <div className={styles.photoFallback} />
        )}
        <div className={styles.scrim} />
      </div>

      <div className={styles.frame}>
        <div className={styles.avatarline}>
          <AvatarStack members={avatarMembers} max={2} />
          <span className={`t-body ${styles.avatarText}`}>
            {avatarLine(ownerName, othersCount)}
          </span>
        </div>

        <span className={`t-label ${styles.eyebrow}`}>{eyebrow}</span>
        <h1 className={`t-display ${styles.title}`}>{title}</h1>
        <p className={`t-body ${styles.body}`}>
          Momentu es la forma de guardar tus viajes y compartirlos con quien más quieres. Sigue este
          viaje por el Diario y la Bitácora —y eres parte con los retos que os lanzáis.
        </p>

        {hasActiveChallenge && (
          <div className={styles.turnRow}>
            <Icon icon={MapPin} size={18} className={styles.turnIcon} />
            <p className={`t-body ${styles.turnText}`}>
              <strong>Ahora te toca un reto.</strong> Marca dónde crees que es antes de que se acabe
              el tiempo. Gana quien más se acerca.
            </p>
          </div>
        )}

        <Button fullWidth onClick={onEnter} className={styles.cta}>
          <span className={styles.ctaLabel}>
            Ver el viaje
            <Icon icon={ArrowRight} size={18} />
          </span>
        </Button>

        <p className={`t-body ${styles.remate}`}>Comparte tus momentos de una forma diferente.</p>
      </div>
    </div>
  )
}
