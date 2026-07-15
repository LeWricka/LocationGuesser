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

import type { FormEvent } from 'react'
import { Modal, Button, Field, Input, Row, Stack } from '../../ui'
import { useAccountUpgrade } from './useAccountUpgrade'

interface Props {
  open: boolean
  onClose: () => void
  /**
   * Se llama tras vincular con éxito (código verificado). El propio
   * `onAuthStateChange` ya repinta la sesión como permanente; esto es solo
   * para que el llamante cierre el modal y, si quiere, muestre un toast.
   */
  onUpgraded?: () => void
}

export function AccountUpgradeModal({ open, onClose, onUpgraded }: Props) {
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
  } = useAccountUpgrade()

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
      onClose={onClose}
      title="Guarda tu cuenta"
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
              Guarda tu progreso con tu correo: no pierdes tu voto ni tu puesto, y podrás entrar
              desde cualquier dispositivo. Es opcional — si prefieres seguir como estás ahora,
              cierra esto sin más.
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
