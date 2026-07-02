// Pantalla de ENTRADA de baja fricción (Fase 2 del rediseño, issue #474).
//
// RE-SKIN de la lógica existente (useEnter / enterWithNameAndEmail): la máquina
// de estados NO cambia. Solo la presentación migra al nuevo lenguaje visual:
// ShellUtilitario (hoja limpia sobre --paper), paleta Grafito+teal, tipografía
// serif para el titular, sin colores hardcodeados.
//
// Esta es la versión PANTALLA COMPLETA de la entrada. El popup de landing
// (LoginPopup) sigue vivo para el flujo de invitación dentro de la hoja flotante;
// esta pantalla se usa cuando la entrada ocupa toda la vista (flujos sin landing).
//
// Estados:
//  - 'form'    → formulario nombre + email + CTA "Entrar"
//  - 'recover' → aviso de recuperación (el email ya existía en otra cuenta)

import { AppHeader, Button, Field, Input, Logo, Stack } from '../../ui'
import { ShellUtilitario } from '../../ui/shells'
import { useEnter } from './useEnter'
import styles from './EnterScreen.module.css'

interface Props {
  /**
   * Copy de cabecera cuando se llega por un link de reto (se une a un viaje);
   * sin él, entrada genérica de marca.
   */
  joining?: boolean
  /** URL absoluta de retorno tras el enlace del correo; por defecto el origin. */
  redirectTo?: string
  /** Volver atrás (ej. a la landing). Si no se pasa, no se pinta el botón atrás. */
  onBack?: () => void
}

// Pantalla de entrada acogedora: marca Tabide + frase ancla + subtítulo +
// campos Nombre y Email + CTA en grafito. El acento teal aparece en los
// anillos de foco y en el enlace "Usar otro correo". Nada hardcodeado.
export function EnterScreen({ joining = false, redirectTo, onBack }: Props) {
  const { step, name, setName, email, setEmail, loading, error, submit, reset } = useEnter({
    redirectTo,
  })

  const onForm = step === 'form'

  return (
    <ShellUtilitario
      // La cabecera es opcional: la pintamos solo si hay onBack, para no dejar
      // al usuario sin salida cuando viene de un flujo con histórico.
      header={
        onBack ? (
          <AppHeader variant="plain" lead="back" onLead={onBack} leadLabel="Atrás" />
        ) : undefined
      }
      footer={
        onForm ? (
          // CTA anclado al fondo (ShellUtilitario.footer): fijo, nunca tapa el scroll.
          <Button type="submit" form="enter-form" size="lg" fullWidth loading={loading}>
            {joining ? 'Únete al viaje' : 'Entrar'}
          </Button>
        ) : undefined
      }
    >
      {onForm ? (
        <div className={styles.content}>
          {/* Hero: logo wordmark + frase ancla de marca */}
          <div className={styles.hero}>
            <span className={styles.logoWrap} aria-label="Tabide">
              <Logo variant="wordmark" size={28} />
            </span>
            <h1 className={['t-display', styles.headline].join(' ')}>
              {joining ? 'Entra y vive el viaje' : 'Comparte tus momentos de una forma diferente.'}
            </h1>
            <p className={['t-body', styles.lead].join(' ')}>
              {joining
                ? 'Sin contraseñas. Pon tu nombre y correo y entra al momento.'
                : 'Tu gente adivina dónde estuviste. Sin contraseñas, sin esperas.'}
            </p>
          </div>

          {/* Formulario: los campos se cablean al botón del footer vía form id */}
          <form
            id="enter-form"
            className={styles.form}
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <Stack gap={4}>
              <Field label="Tu nombre">
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    type="text"
                    name="display_name"
                    autoComplete="nickname"
                    placeholder="Lewis"
                    maxLength={40}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={loading}
                    // El primer campo recibe foco automático: reduce la fricción
                    // cuando la pantalla es el punto de entrada (no el popup).
                    autoFocus
                  />
                )}
              </Field>
              <Field label="Tu correo" error={error}>
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    type="email"
                    name="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="tucorreo@ejemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                  />
                )}
              </Field>
            </Stack>
          </form>

          {/* Nota legal: sin contraseña + validación diferida. Tono de ayuda, no obstáculo. */}
          <p className={['t-label', styles.note].join(' ')}>
            Sin contraseña · Recibirás un enlace para validar el correo
          </p>
        </div>
      ) : (
        // Estado 'recover': el email ya era de otra cuenta. Mandamos un enlace
        // de recuperación para no perder la cuenta original (no es callejón sin salida).
        <div className={styles.recover}>
          <div className={styles.hero}>
            <span className={styles.logoWrap} aria-label="Tabide">
              <Logo variant="wordmark" size={28} />
            </span>
            <h1 className={['t-display', styles.headline].join(' ')}>Revisa tu correo</h1>
            <p className={['t-body', styles.lead].join(' ')}>
              Ese correo ya tiene una cuenta. Te hemos mandado un enlace a{' '}
              <strong className={styles.emailHighlight}>{email}</strong> para recuperarla: ábrelo y
              entrarás con tu cuenta de siempre.
            </p>
            <p className={['t-label', styles.note].join(' ')}>
              Llega en segundos. Revisa spam si tarda.
            </p>
          </div>
          <Button variant="secondary" size="lg" fullWidth onClick={reset}>
            Usar otro correo
          </Button>
        </div>
      )}
    </ShellUtilitario>
  )
}
