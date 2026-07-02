// PantallaEntrar — pantalla 1/5 del camino feliz (mockup).
//
// Entrada de baja fricción: nombre + email → un solo CTA "Entrar".
// ShellUtilitario: hoja limpia sobre --paper, sin backdrop, sin vacío negro.

import { Button, Logo } from '../../ui'
import styles from './PantallaEntrar.module.css'

export function PantallaEntrar() {
  return (
    <div className={styles.root}>
      {/* Hero: logo + claim */}
      <div className={styles.hero}>
        <div className={styles.logoWrap}>
          <Logo size={36} />
        </div>
        <h1 className="t-display" style={{ color: 'var(--color-text)' }}>
          Comparte tus momentos de una forma diferente.
        </h1>
        <p className={['t-body', styles.tagline].join(' ')}>
          Comparte dónde estás y que tu grupo adivine en el mapa. El más cercano gana.
        </p>
      </div>

      {/* Formulario: nombre + email + CTA */}
      <div className={styles.form}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="mock-nombre">
            Tu nombre
          </label>
          <input
            id="mock-nombre"
            className={styles.fieldInput}
            type="text"
            placeholder="Lewis"
            defaultValue=""
            readOnly
          />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="mock-email">
            Tu email
          </label>
          <input
            id="mock-email"
            className={styles.fieldInput}
            type="email"
            placeholder="lewis@tabide.app"
            defaultValue=""
            readOnly
          />
        </div>

        <Button variant="primary" size="lg" fullWidth>
          Entrar
        </Button>

        <p className={['t-label', styles.legalNote].join(' ')}>
          Sin contraseña · Recibirás un enlace mágico
        </p>
      </div>
    </div>
  )
}
