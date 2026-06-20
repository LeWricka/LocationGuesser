import { Button } from './Button'
import { Card } from './Card'
import { Stack } from './Stack'
import styles from './HomeEmptyState.module.css'

interface Props {
  /** Nombre del usuario para el saludo de bienvenida. */
  name: string
  /** Crear el primer grupo (lo cablea #3). */
  onCreateGroup?: () => void
  className?: string
}

// Estado vacío de la home para usuario nuevo (§3.3): explica POR QUÉ está
// vacío + UNA acción clara, y recuerda que un enlace recibido también vale.
export function HomeEmptyState({ name, onCreateGroup, className }: Props) {
  return (
    <Card
      as="section"
      padding="lg"
      raised
      className={[styles.empty, className].filter(Boolean).join(' ')}
      aria-label="Bienvenida"
    >
      <Stack gap={4} align="center">
        <span className={styles.wave} aria-hidden="true">
          👋
        </span>
        <h2 className={styles.title}>¡Bienvenido, {name}!</h2>
        <p className={styles.lead}>
          Aún no tienes grupos. Un grupo es donde tú y tus amigos os retáis a adivinar sitios en el
          mapa.
        </p>
        <Button size="lg" onClick={onCreateGroup}>
          + Crear mi primer grupo
        </Button>
        <p className={styles.hint}>
          ¿Te han pasado un enlace? Ábrelo y entrarás al grupo automáticamente.
        </p>
      </Stack>
    </Card>
  )
}
