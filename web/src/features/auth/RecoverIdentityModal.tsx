// "¿Eres tú?" (issue #756): cuando un receptor anónimo elige un nombre que ya
// juega en este viaje, puede ser la misma persona volviendo desde otro
// navegador/móvil (identidad perdida por localStorage). En vez de duplicarlo en
// el marcador, le ofrecemos entrar con su correo: el login OTP normal
// (`useMagicLink`, mismo que `LoginFlow`) la reconoce como cuenta EXISTENTE y le
// devuelve SU sesión (su uid de siempre) — sus puntos y su puesto vuelven con
// ella. Distinto de `AccountUpgradeModal` (que VINCULA la sesión anónima actual
// a un email nuevo, conservando el uid anónimo): aquí el uid actual se
// abandona a propósito, se recupera el de la cuenta ya existente.
//
// El cliente no puede confirmar de antemano si el homónimo tiene email (no se
// expone `is_anonymous` ajeno): no lo intentamos. Si el código no cuadra con esa
// cuenta, el error de `useMagicLink` ya lo explica ("código incorrecto o
// caducado"); quien vuelve simplemente no puede entrar y puede cerrar y elegir
// otro nombre.

import { useEffect, useRef, type FormEvent } from 'react'
import { Modal, Button, Field, Input, Row, Stack } from '../../ui'
import { useMagicLink } from './useMagicLink'

interface Props {
  open: boolean
  /** Nombre del miembro del viaje con el que hubo colisión, para el copy. */
  matchedName: string
  /** Cerrar sin recuperar (X, Escape o "Ahora no"): vuelve al paso de nombre. */
  onClose: () => void
  /** Código verificado con éxito: la sesión ya es la de la cuenta existente. */
  onRecovered: () => void
}

export function RecoverIdentityModal({ open, matchedName, onClose, onRecovered }: Props) {
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
  } = useMagicLink()

  // Reiniciar al cerrar: si se vuelve a abrir (otra colisión), no arrastra el
  // correo/código de un intento anterior.
  const wasOpen = useRef(open)
  useEffect(() => {
    if (!open && wasOpen.current) reset()
    wasOpen.current = open
  }, [open, reset])

  function handleSubmitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submit()
  }

  async function confirmCode() {
    if (await verify()) onRecovered()
  }

  function handleSubmitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void confirmCode()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="¿Eres tú?"
      footer={
        step === 'email' ? (
          <Row gap={2} justify="end">
            <Button variant="ghost" size="sm" onClick={onClose}>
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
            <p>
              Ya hay un <strong>{matchedName}</strong> en este viaje. Si eres tú, entra con tu
              correo y recuperamos tus puntos y tu puesto de siempre.
            </p>
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
