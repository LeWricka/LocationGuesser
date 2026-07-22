// Explicación de la entrada por RETO COMPARTIDO (onboarding nuevo, pieza 2/4):
// se muestra DESPUÉS del resultado (nunca antes de jugar, ver RetoShareIntro).
// Tres pantallas encadenadas —qué es Momentu, cómo son los retos, el puente al
// viaje entero— y un registro opcional al final. Copy exacto del prototipo
// (`#reto-quees` → `#reto-retos` → `#reto-diario` → `#reto-registro`).
//
// "Saltar" en cualquiera de las tres primeras va DIRECTO al registro (última
// oportunidad, nunca se pierde el gancho de guardar cuenta). El CTA del
// puente ("Ver el viaje de X") NO pasa por el registro: navega de verdad al
// viaje (un anónimo ya puede verlo) y ahí termina el recorrido — no se
// construye aquí ninguna guía conducida del viaje (eso es pieza 4/4).
//
// Presentacional + máquina de pasos propia (como `OnboardingSlideshow`, pero
// con contenido a medida por paso en vez de un slide genérico): PlayChallenge
// decide CUÁNDO se monta (tras revelar, primera vez) y delega el registro real
// (email/código) a `AccountUpgradeModal`/`useAccountUpgrade`, fuera de aquí.

import { useState } from 'react'
import { ArrowRight, HelpCircle, MapPin, Timer } from 'lucide-react'
import { Button, Icon } from '../../ui'
import { GuestRegisterPrompt } from './GuestRegisterPrompt'
import styles from './RetoShareExplainSequence.module.css'

type Step = 'quees' | 'retos' | 'puente' | 'registro'

export interface Props {
  /** Nombre de quien creó el viaje del reto (protagonista de dos pasos). */
  ownerName?: string
  /** "Ver el viaje de X": navega al viaje real (modo ver) y cierra la secuencia. */
  onViewTrip: () => void
  /** "Crear cuenta" del registro: abre el alta real (AccountUpgradeModal). */
  onCreateAccount: () => void
  /** "Ahora no" del registro: cierra sin crear cuenta. */
  onDismiss: () => void
  /**
   * Paso inicial. Por defecto 'quees' (el arranque real de la secuencia); solo
   * existe para poder capturar/inspeccionar cada paso por separado (galería de
   * diseño/a11y — mismo criterio que `initialSection`/`initialEditing` en
   * TripPage/MomentSheet). PlayChallenge nunca lo pasa.
   */
  initialStep?: Step
}

// "{ownerName} guarda cada parada…" evitando pronombres con género ("la/lo
// sigues") que romperían con un nombre del género contrario al del ejemplo del
// prototipo (Lucía): "sigues su rastro" funciona igual para cualquier nombre.
function quesLede(ownerName?: string): string {
  return ownerName
    ? `${ownerName} guarda cada parada de este viaje; tú sigues su rastro y juegas los retos que comparte. Acabas de jugar uno; hay más.`
    : 'Guardan cada parada de este viaje; tú sigues su rastro y juegas los retos que comparten. Acabas de jugar uno; hay más.'
}

function bridgeBody(ownerName?: string): string {
  return ownerName
    ? `Este reto es parte del viaje de ${ownerName}. Míralo entero: cada parada en el Diario, y todo reunido en la Bitácora.`
    : 'Este reto es parte de un viaje. Míralo entero: cada parada en el Diario, y todo reunido en la Bitácora.'
}

function viewTripLabel(ownerName?: string): string {
  return ownerName ? `Ver el viaje de ${ownerName}` : 'Ver el viaje'
}

export function RetoShareExplainSequence({
  ownerName,
  onViewTrip,
  onCreateAccount,
  onDismiss,
  initialStep = 'quees',
}: Props) {
  const [step, setStep] = useState<Step>(initialStep)

  // El registro reutiliza el componente entero (mismo motor que el registro
  // post-valor del invitado): solo cambia el titular.
  if (step === 'registro') {
    return (
      <GuestRegisterPrompt
        title="No pierdas tus retos"
        onCreateAccount={onCreateAccount}
        onDismiss={onDismiss}
      />
    )
  }

  const title =
    step === 'retos'
      ? 'Se juegan sobre un lugar'
      : step === 'puente'
        ? 'De un reto a un viaje'
        : 'El diario de un viaje compartido'

  return (
    <div className={styles.screen} role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        className={[styles.skip, 'lg-press'].join(' ')}
        onClick={() => setStep('registro')}
      >
        Saltar
      </button>

      <div className={styles.panel}>
        {step === 'quees' && (
          <>
            <span className={`t-label ${styles.eyebrow}`}>Esto es Momentu</span>
            <h1 className={`t-display ${styles.title}`}>{title}</h1>
            <p className={`t-body ${styles.lede}`}>{quesLede(ownerName)}</p>
            <div className={styles.foot}>
              <Button fullWidth onClick={() => setStep('retos')}>
                <span className={styles.ctaLabel}>
                  Seguir
                  <Icon icon={ArrowRight} size={18} />
                </span>
              </Button>
            </div>
          </>
        )}

        {step === 'retos' && (
          <>
            <span className={`t-label ${styles.eyebrow}`}>Los retos</span>
            <h1 className={`t-display ${styles.title}`}>{title}</h1>
            <p className={`t-body ${styles.lede}`}>
              Alguien comparte un lugar y reta a los demás. Hay dos formas:
            </p>

            <div className={styles.kindList}>
              <div className={styles.kind}>
                <span className={styles.kindIcon}>
                  <Icon icon={MapPin} size={21} />
                </span>
                <span className={styles.kindText}>
                  <strong>¿Dónde estamos?</strong>
                  <span>Ves la foto y marcas en el mapa dónde crees que es.</span>
                </span>
              </div>
              <div className={styles.kind}>
                <span className={styles.kindIcon}>
                  <Icon icon={HelpCircle} size={21} />
                </span>
                <span className={styles.kindText}>
                  <strong>¿Adivinas?</strong>
                  <span>Una pregunta sobre el lugar; respondes con un número.</span>
                </span>
              </div>
            </div>

            <p className={styles.rule}>
              <Icon icon={Timer} size={18} className={styles.ruleIcon} />
              <span>
                Cada reto tiene <strong>cuenta atrás</strong>. Cuando cierra,{' '}
                <strong>gana quien más se acerca</strong>.
              </span>
            </p>

            <div className={styles.foot}>
              <Button fullWidth onClick={() => setStep('puente')}>
                <span className={styles.ctaLabel}>
                  Seguir
                  <Icon icon={ArrowRight} size={18} />
                </span>
              </Button>
            </div>
          </>
        )}

        {step === 'puente' && (
          <>
            <span className={`t-label ${styles.eyebrow}`}>El viaje entero</span>
            <h1 className={`t-display ${styles.title}`}>{title}</h1>
            <p className={`t-body ${styles.lede}`}>{bridgeBody(ownerName)}</p>
            <div className={styles.foot}>
              <Button fullWidth onClick={onViewTrip}>
                <span className={styles.ctaLabel}>
                  {viewTripLabel(ownerName)}
                  <Icon icon={ArrowRight} size={18} />
                </span>
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
