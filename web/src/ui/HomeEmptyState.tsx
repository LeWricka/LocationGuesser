import { Button } from './Button'
import { HowItWorks } from './HowItWorks'
import { Stack } from './Stack'
import styles from './HomeEmptyState.module.css'

interface Props {
  /** Nombre del usuario para el saludo de bienvenida. */
  name: string
  /** Crear el primer grupo (lo cablea la home). */
  onCreateGroup?: () => void
  /** Unirse a un grupo con un código/enlace (lo cablea la home). */
  onJoinGroup?: () => void
  className?: string
}

// Estado vacío de la home = hero explicativo del producto (issue #131). Para el
// recién llegado (sin grupos, o que entra por un enlace) es protagonista: dice
// QUÉ es en una frase, CÓMO funciona en 3 pasos y CÓMO empezar (crear o
// unirse). Cuando el usuario ya tiene grupos, la home muestra el dashboard y
// este hero no aparece.
export function HomeEmptyState({ name, onCreateGroup, onJoinGroup, className }: Props) {
  return (
    <section
      className={[styles.empty, className].filter(Boolean).join(' ')}
      aria-label="Bienvenida"
    >
      <Stack gap={5}>
        <div className={styles.hero}>
          <p className={styles.eyebrow}>Hola, {name}</p>
          <h1 className={styles.headline}>
            Comparte tus momentos <span className={styles.accent}>de una forma diferente</span>
          </h1>
          <p className={styles.lead}>
            Tus amigos adivinan en el mapa dónde estás; gana quien más se acerca.
          </p>
        </div>

        <HowItWorks compact />

        <Stack gap={2}>
          <Button size="lg" fullWidth onClick={onCreateGroup}>
            Crear grupo
          </Button>
          <Button variant="secondary" size="lg" fullWidth onClick={onJoinGroup}>
            Unirme con un código
          </Button>
          <p className={styles.hint}>
            ¿Te han pasado un enlace? Ábrelo y entrarás al grupo automáticamente.
          </p>
        </Stack>
      </Stack>
    </section>
  )
}
