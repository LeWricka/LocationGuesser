// "Guárdate / entra del todo" (issue #758): CTA opcional que ofrecemos al
// receptor ANÓNIMO tras jugar (o en cualquier punto en el que la app le pida
// una capacidad de cuenta permanente, p.ej. crear un viaje). Vincula su sesión
// anónima a un email SIN perder identidad — mismo `auth.uid()`, así que sus
// votos y su puesto en el marcador siguen siendo suyos. Es SIEMPRE saltable:
// cerrar el modal no le hace perder nada de lo que ya vio o jugó.
//
// Dos pasos (email → código), mismo ritmo que LoginFlow/EnterCode, pero en un
// Modal (no a pantalla completa): esto es un empujón contextual, no una puerta
// de entrada. Presentacional + wiring de `useAccountUpgrade`; sin llamadas a
// Supabase aquí.
//
// Copy reencuadrado al BENEFICIO (issue #756): "guarda tu cuenta" suena a
// burocracia; con `groupName`/`points` (el llamante los pasa cuando vienen de
// jugar un reto) el copy pasa a "no pierdas tus puntos de {viaje}", mostrando
// la cifra recién ganada (o acumulada, según decida el llamante). Sin esos
// props (p.ej. origin 'anon_create_gate', sin reto jugado) cae al copy
// genérico de progreso.

import { useEffect, useRef, type FormEvent, type ReactNode } from 'react'
import { Modal, Button, Field, Input, Row, Stack } from '../../ui'
import { track } from '../../lib/analytics'
import { useAccountUpgrade, type AccountUpgradeContext } from './useAccountUpgrade'

interface Props {
  open: boolean
  onClose: () => void
  /**
   * Se llama tras vincular con éxito (código verificado). El propio
   * `onAuthStateChange` ya repinta la sesión como permanente; esto es solo
   * para que el llamante cierre el modal y, si quiere, muestre un toast.
   */
  onUpgraded?: () => void
  /**
   * De dónde se abrió el CTA (issue #751): viaja a `account_upgraded` y a los
   * eventos de impresión/abandono, para poder cruzar el funnel por superficie.
   * Ver `AccountUpgradeContext`.
   */
  origin: AccountUpgradeContext['origin']
  groupId?: string
  challengeId?: string
  /**
   * Nombre del viaje y puntos a enseñar en el copy de beneficio (issue #756):
   * "no pierdas tus puntos de {viaje}" en vez de la burocracia de "guarda tu
   * cuenta". Solo el llamante de 'play_result' los tiene (viene de jugar un
   * reto); en 'anon_create_gate' no hay reto jugado, así que quedan undefined
   * y el copy cae a la versión genérica de progreso.
   */
  groupName?: string
  points?: number
  /**
   * Titular a medida (issue #891). Por defecto se deriva de `groupName`
   * ("Guarda tus puntos de {viaje}") o cae a "Guarda tu cuenta"; el gate del
   * "+" anónimo lo usa para pedir cuenta con su propio encuadre ("Regístrate
   * para crear tus viajes").
   */
  title?: string
  /**
   * Texto introductorio a medida del paso de email (issue #891). Sin él, cae al
   * copy de beneficio de siempre (puntos del viaje o progreso genérico).
   */
  intro?: ReactNode
}

export function AccountUpgradeModal({
  open,
  onClose,
  onUpgraded,
  origin,
  groupId,
  challengeId,
  groupName,
  points,
  title,
  intro,
}: Props) {
  const {
    step,
    email,
    setEmail,
    code,
    setCode,
    loading,
    resending,
    verifying,
    error,
    submit,
    resend,
    verify,
    reset,
  } = useAccountUpgrade({ origin, groupId, challengeId })

  // Impresión del CTA (issue #751): denominador del funnel, hoy solo teníamos
  // el numerador (`account_upgraded`). Una vez por apertura (no en cada
  // repintado mientras sigue abierto).
  const shownRef = useRef(false)
  useEffect(() => {
    if (!open) {
      shownRef.current = false
      return
    }
    if (shownRef.current) return
    shownRef.current = true
    track('upgrade_cta_shown', {
      origin,
      ...(groupId && { group_id: groupId }),
      ...(challengeId && { challenge_id: challengeId }),
    })
  }, [open, origin, groupId, challengeId])

  // Abandono (issue #751): se cierra sin completar (botón "Ahora no", la X del
  // header o Escape — las tres rutas de `Modal.onClose`). NO se llama tras un
  // `onUpgraded` con éxito: el llamante deja de montar el modal (o cambia
  // `open`) en vez de invocar este cierre.
  function handleClose() {
    track('upgrade_abandoned', {
      origin,
      ...(groupId && { group_id: groupId }),
      ...(challengeId && { challenge_id: challengeId }),
    })
    onClose()
  }

  function handleSubmitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submit()
  }

  async function confirmCode() {
    if (await verify()) onUpgraded?.()
  }

  function handleSubmitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void confirmCode()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title ?? (groupName ? `Guarda tus puntos de ${groupName}` : 'Guarda tu cuenta')}
      footer={
        step === 'email' ? (
          <Row gap={2} justify="end">
            <Button variant="ghost" size="sm" onClick={handleClose}>
              Ahora no
            </Button>
            <Button size="sm" loading={loading} onClick={() => void submit()}>
              Mandar código
            </Button>
          </Row>
        ) : (
          <Row gap={2} justify="end">
            <Button variant="ghost" size="sm" onClick={reset} disabled={verifying}>
              Cambiar correo
            </Button>
            <Button size="sm" loading={verifying} onClick={() => void confirmCode()}>
              Confirmar
            </Button>
          </Row>
        )
      }
    >
      {step === 'email' ? (
        <form onSubmit={handleSubmitEmail} noValidate>
          <Stack gap={3}>
            {intro ? (
              <p>{intro}</p>
            ) : groupName && points != null ? (
              <p>
                No pierdas tus <strong>{points} puntos</strong> de {groupName}: con tu correo, tu
                voto y tu puesto siguen siendo tuyos aunque cambies de móvil. Es opcional — si
                prefieres seguir como estás, cierra esto sin más.
              </p>
            ) : (
              <p>
                Guarda tu progreso con tu correo: no pierdes tu voto ni tu puesto, y podrás entrar
                desde cualquier dispositivo. Es opcional — si prefieres seguir como estás ahora,
                cierra esto sin más.
              </p>
            )}
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
                  autoFocus
                />
              )}
            </Field>
          </Stack>
        </form>
      ) : (
        <form onSubmit={handleSubmitCode} noValidate>
          <Stack gap={3}>
            <p>
              Mandamos un código a <strong>{email}</strong>.
            </p>
            <Field label="Código de 6 dígitos" error={error}>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  type="text"
                  name="otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  disabled={verifying}
                  autoFocus
                />
              )}
            </Field>
            <Row gap={2}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void resend()}
                loading={resending}
              >
                Reenviar
              </Button>
            </Row>
          </Stack>
        </form>
      )}
    </Modal>
  )
}
