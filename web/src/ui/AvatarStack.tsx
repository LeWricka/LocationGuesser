import { Avatar } from './Avatar'
import styles from './AvatarStack.module.css'

/** Miembro mínimo para pintar su avatar en la fila (issue #543). */
export interface AvatarStackMember {
  userId: string
  name: string
  avatarUrl?: string | null
}

interface Props {
  members: AvatarStackMember[]
  /** Avatares visibles antes de colapsar el resto en el chip "+N" (por defecto 3). */
  max?: number
  className?: string
}

// Fila de avatares solapados ("aquí está tu grupo", issue #543): hasta `max`
// discos con borde de papel (separa del fondo fotográfico de la tarjeta) + un
// chip "+N" con el resto si hay más. Con 0 o 1 miembro no aporta nada (un viaje
// en solitario no necesita "grupo"), así que no se pinta nada — la decisión vive
// aquí, no en cada pantalla que use el componente.
export function AvatarStack({ members, max = 3, className }: Props) {
  if (members.length < 2) return null

  const visible = members.slice(0, max)
  const extra = members.length - visible.length

  // role="group" + un único aria-label con la lista de nombres: un span sin rol
  // no queda garantizado en el árbol de accesibilidad de todos los lectores. Los
  // avatares individuales van `aria-hidden` para no duplicar cada nombre (ya
  // recogido aquí) en un anuncio aparte por disco.
  return (
    <span
      className={[styles.stack, className].filter(Boolean).join(' ')}
      role="group"
      aria-label={`Viaje de ${members.length} personas: ${members.map((m) => m.name).join(', ')}`}
    >
      {visible.map((m) => (
        <span key={m.userId} className={styles.item} aria-hidden="true">
          <Avatar userId={m.userId} name={m.name} avatarUrl={m.avatarUrl} size="xs" />
        </span>
      ))}
      {extra > 0 && (
        <span className={styles.extra} aria-hidden="true">
          +{extra}
        </span>
      )}
    </span>
  )
}
