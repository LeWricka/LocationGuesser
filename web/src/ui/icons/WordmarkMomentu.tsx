import styles from './WordmarkMomentu.module.css'

interface Props {
  size?: number
  className?: string
}

// Wordmark "momentu" (rebrand Tabide → Momentu, issue #691): la serif de marca
// (Cormorant, vía --font-serif) con el mini-pin teal del símbolo haciendo de PUNTO
// FINAL de la palabra. "momentu" no lleva "i" (a diferencia de "tabide"), así que el
// pin ya no puede vivir sobre una letra: se convierte en el punto de cierre, como un
// "." con cuerpo — mismo SVG en miniatura, tamaño óptico de un punto tipográfico
// grande, con la línea de base ligeramente elevada para que lea como puntuación y no
// como un adorno suelto.
//
// El texto real y accesible ("momentu") vive aparte en un span visually-hidden para que
// un lector de pantalla oiga la palabra, no la construcción visual (que no es texto real).
export function WordmarkMomentu({ size = 24, className }: Props) {
  const classes = [styles.root, className].filter(Boolean).join(' ')

  return (
    <span className={classes} style={{ fontSize: size }}>
      <span className={styles.srOnly}>momentu</span>
      <span className={styles.visual} aria-hidden="true">
        momentu
        <span className={styles.dotSlot}>
          <svg className={styles.pinDot} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M32 4C19.3 4 9 14.1 9 26.6 9 42 32 60 32 60s23-18 23-33.4C55 14.1 44.7 4 32 4Z"
              fill="#0F766E" // design-lint-allow: teal de marca fijo (issue #538), no token de UI
            />
          </svg>
        </span>
      </span>
    </span>
  )
}
