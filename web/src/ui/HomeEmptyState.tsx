import { Button } from './Button'
import { HowItWorks } from './HowItWorks'
import { Stack } from './Stack'
import styles from './HomeEmptyState.module.css'

interface Props {
  /** Nombre del usuario para el saludo de bienvenida. */
  name: string
  /** Crear el primer grupo (lo cablea la home). */
  onCreateGroup?: () => void
  className?: string
}

// Estado vacío de la home = hero explicativo del producto (issue #131). Para el
// recién llegado (sin grupos, o que entra por un enlace) es protagonista: dice
// QUÉ es en una frase, CÓMO funciona en 3 pasos y CÓMO empezar (crear). Cuando
// el usuario ya tiene grupos, la home muestra el dashboard y este hero no aparece.
// "Unirme con un código" eliminado (#495): los viajes van por enlace, no por código.
export function HomeEmptyState({ name, onCreateGroup, className }: Props) {
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
            Guarda tu viaje, comparte cada lugar y deja que tu gente lo viva contigo.
          </p>
        </div>

        <HowItWorks compact />

        <Stack gap={2}>
          <Button size="lg" fullWidth onClick={onCreateGroup}>
            Crear viaje
          </Button>
          {/* "Unirme con un código" eliminado: los viajes se comparten por enlace.
              El enlace ya mete al usuario al instante; el código manual sobra (#495). */}
          <p className={styles.hint}>¿Te han pasado un enlace? Ábrelo y entras directo.</p>
        </Stack>
      </Stack>
    </section>
  )
}
