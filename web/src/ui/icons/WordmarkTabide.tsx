import styles from './WordmarkTabide.module.css'

interface Props {
  size?: number
  className?: string
}

// Wordmark "tabide": la serif de marca (Cormorant, vía --font-serif) con el punto de la
// "i" sustituido por un mini-pin teal — el mismo símbolo en miniatura (issue #538).
//
// El glifo "ı" (U+0131, "i" latina sin punto) deja el hueco donde va el pin; el texto
// real y accesible ("tabide") vive aparte en un span visually-hidden para que un lector
// de pantalla oiga la palabra, no la construcción visual (que no es texto real).
export function WordmarkTabide({ size = 24, className }: Props) {
  const classes = [styles.root, className].filter(Boolean).join(' ')

  return (
    <span className={classes} style={{ fontSize: size }}>
      <span className={styles.srOnly}>tabide</span>
      <span className={styles.visual} aria-hidden="true">
        tab
        <span className={styles.iSlot}>
          ı
          <svg className={styles.iDot} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M32 4C19.3 4 9 14.1 9 26.6 9 42 32 60 32 60s23-18 23-33.4C55 14.1 44.7 4 32 4Z"
              fill="#0F766E" // design-lint-allow: teal de marca fijo (issue #538), no token de UI
            />
          </svg>
        </span>
        de
      </span>
    </span>
  )
}
