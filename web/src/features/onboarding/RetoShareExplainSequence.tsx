// Tarjetas de explicación del RETO COMPARTIDO (onboarding nuevo, pieza 2/4):
// llegan DESPUÉS de que el usuario YA vio su resultado y los coach-marks que
// lo señalan (ver `RetoShareGuide`, que monta esto tras esos dos pasos). NUNCA
// tapan el resultado por su cuenta: `RetoShareGuide`/PlayChallenge deciden
// cuándo, y solo tras un CTA explícito en el reveal.
//
// Tres tarjetas encadenadas —la sección de retos (el Marcador: clasificación,
// retos pasados y premios), el puente al viaje entero (Diario/Bitácora) y qué
// es Momentu— y un registro opcional al final. El recorrido termina cayendo en
// el MARCADOR (no en el Diario): la navegación real la hace el llamador en
// `onDismiss`/`onCreateAccount` (ver PlayChallenge → `marcadorGuideGroupHash`).
//
// "Saltar" en cualquiera de las tres tarjetas va DIRECTO al registro (última
// oportunidad, nunca se pierde el gancho de guardar cuenta).
//
// Presentacional + máquina de pasos propia (como `OnboardingSlideshow`, pero
// con contenido a medida por paso): quien lo monta decide CUÁNDO y delega el
// registro real (email/código) a `AccountUpgradeModal`/`useAccountUpgrade`.

import { useState } from 'react'
import { ArrowRight, Award, BookOpen, History, MapPin, Timer, Trophy } from 'lucide-react'
import { Button, Icon } from '../../ui'
import { GuestRegisterPrompt } from './GuestRegisterPrompt'
import styles from './RetoShareExplainSequence.module.css'

type Step = 'retos' | 'puente' | 'quees' | 'registro'

export interface Props {
  /** Nombre de quien creó el viaje del reto (protagonista de dos pasos). */
  ownerName?: string
  /** "Crear cuenta" del registro: abre el alta real (AccountUpgradeModal). */
  onCreateAccount: () => void
  /**
   * "Ahora no" del registro: cierra la secuencia. El llamador aprovecha para
   * navegar al Marcador (el recorrido acaba ahí, no en el Diario).
   */
  onDismiss: () => void
  /**
   * Paso inicial. Por defecto 'retos' (el arranque real de las tarjetas);
   * `RetoShareGuide` lo usa para saltar directo a 'registro' cuando el usuario
   * pulsa "Saltar" durante los coach-marks previos, y la galería de diseño/a11y
   * para capturar cada tarjeta por separado (mismo criterio que
   * `initialSection`/`initialEditing` en TripPage/MomentSheet).
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

export function RetoShareExplainSequence({
  ownerName,
  onCreateAccount,
  onDismiss,
  initialStep = 'retos',
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
    step === 'puente'
      ? 'De un reto a un viaje'
      : step === 'quees'
        ? 'El diario de un viaje compartido'
        : 'Aquí se sigue la partida'

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
        {step === 'retos' && (
          <>
            <span className={`t-label ${styles.eyebrow}`}>El Marcador</span>
            <h1 className={`t-display ${styles.title}`}>{title}</h1>
            <p className={`t-body ${styles.lede}`}>
              Todos los retos del viaje viven en el Marcador. Ahí encuentras:
            </p>

            <div className={styles.kindList}>
              <div className={styles.kind}>
                <span className={styles.kindIcon}>
                  <Icon icon={Trophy} size={21} />
                </span>
                <span className={styles.kindText}>
                  <strong>La clasificación</strong>
                  <span>Quién va ganando en el viaje, reto tras reto.</span>
                </span>
              </div>
              <div className={styles.kind}>
                <span className={styles.kindIcon}>
                  <Icon icon={History} size={21} />
                </span>
                <span className={styles.kindText}>
                  <strong>Los retos pasados</strong>
                  <span>Los que ya se jugaron y cómo quedó cada uno.</span>
                </span>
              </div>
              <div className={styles.kind}>
                <span className={styles.kindIcon}>
                  <Icon icon={Award} size={21} />
                </span>
                <span className={styles.kindText}>
                  <strong>Los premios</strong>
                  <span>Los reconocimientos del viaje y quién se los lleva.</span>
                </span>
              </div>
            </div>

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

            <div className={styles.kindList}>
              <div className={styles.kind}>
                <span className={styles.kindIcon}>
                  <Icon icon={MapPin} size={21} />
                </span>
                <span className={styles.kindText}>
                  <strong>El Diario</strong>
                  <span>Cada parada del viaje, en orden.</span>
                </span>
              </div>
              <div className={styles.kind}>
                <span className={styles.kindIcon}>
                  <Icon icon={BookOpen} size={21} />
                </span>
                <span className={styles.kindText}>
                  <strong>La Bitácora</strong>
                  <span>Todo el viaje reunido en un vistazo.</span>
                </span>
              </div>
            </div>

            <div className={styles.foot}>
              <Button fullWidth onClick={() => setStep('quees')}>
                <span className={styles.ctaLabel}>
                  Seguir
                  <Icon icon={ArrowRight} size={18} />
                </span>
              </Button>
            </div>
          </>
        )}

        {step === 'quees' && (
          <>
            <span className={`t-label ${styles.eyebrow}`}>Esto es Momentu</span>
            <h1 className={`t-display ${styles.title}`}>{title}</h1>
            <p className={`t-body ${styles.lede}`}>{quesLede(ownerName)}</p>

            <p className={styles.rule}>
              <Icon icon={Timer} size={18} className={styles.ruleIcon} />
              <span>
                Cada reto tiene <strong>cuenta atrás</strong>. Cuando cierra,{' '}
                <strong>gana quien más se acerca</strong>.
              </span>
            </p>

            <div className={styles.foot}>
              <Button fullWidth onClick={() => setStep('registro')}>
                <span className={styles.ctaLabel}>
                  Seguir
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
