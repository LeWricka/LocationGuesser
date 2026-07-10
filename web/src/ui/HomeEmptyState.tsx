import { Button } from './Button'
import { Stack } from './Stack'
import styles from './HomeEmptyState.module.css'

interface Props {
  /** Nombre del usuario para el saludo de bienvenida. */
  name: string
  /** Crear el primer grupo (lo cablea la home). */
  onCreateGroup?: () => void
  /** Reabrir el tutorial ÚNICO de entrada (lo cablea la home). */
  onOpenTutorial?: () => void
  className?: string
}

// Estado vacío de la home = bienvenida + CTA de arranque (issue #131). Para el
// recién llegado (sin grupos) el protagonista es EMPEZAR: dice QUÉ es en una frase
// y ofrece el CTA primario "Crear viaje". Cuando el usuario ya tiene grupos, la
// home muestra el dashboard y este hero no aparece.
//
// Issue #742: fuera el bloque "cómo funciona" (los 3 pasos con `HowItWorks`) — el
// usuario acaba de ver el tutorial de entrada, repetírselo aquí sobra y, peor,
// empujaba el CTA "Crear viaje" fuera de la vista (el bug del CTA que no se veía).
// El "cómo funciona" queda a un toque en "Ver tutorial" (reabre el tutorial único).
// "Unirme con un código" eliminado (#495): los viajes van por enlace, no por código.
export function HomeEmptyState({ name, onCreateGroup, onOpenTutorial, className }: Props) {
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

        <Stack gap={2}>
          {/* CTA primario inequívoco: sin el bloque de pasos por delante, "Crear
              viaje" queda visible sin scroll (issue #742). */}
          <Button size="lg" fullWidth onClick={onCreateGroup}>
            Crear viaje
          </Button>
          {/* "Ver tutorial" SIEMPRE disponible: reabre el tutorial único de entrada
              para quien quiera repasar el bucle completo. */}
          <Button size="lg" variant="secondary" fullWidth onClick={onOpenTutorial}>
            Ver tutorial
          </Button>
          {/* "Unirme con un código" eliminado: los viajes se comparten por enlace.
              El enlace ya mete al usuario al instante; el código manual sobra (#495). */}
          <p className={styles.hint}>¿Te han pasado un enlace? Ábrelo y entras directo.</p>
        </Stack>
      </Stack>
    </section>
  )
}
