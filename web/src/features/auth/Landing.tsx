// Landing pública para visitantes SIN sesión (issue #175; rediseño "foto hero a
// sangre + popup").
//
// ENFOQUE: la entrada es una FOTO de viaje a pantalla completa (escena a sangre
// con degradado para legibilidad) + una frase emotiva en serif y un único CTA.
// El email NO está a la vista: al pulsar el CTA se abre un POPUP fino con el
// flujo de email. Mínimo texto, máxima emoción. Inspiración: apps de viaje y
// streaming con hero a sangre y entrada en modal.
//
// Reutiliza (sin tocar su lógica):
//  - el hook `useMagicLink` para todo el wiring del login passwordless por OTP
//    (mismo que LoginFlow): email → code → (sesión). Login y registro son el
//    mismo flujo OTP.
//  - `ui/EnterCode` para el paso "introduce el código" tras enviar el email; se
//    presenta como su propia pantalla (su lienzo nativo), igual que en login.
//  - `ui/Modal` del kit para el popup del email.
//  - `features/home/navigation.joinByCode` para el atajo "tengo un código de
//    viaje" en la landing genérica (lleva a `#g=<código>`).
//
// La política sigue siendo passwordless puro: sin contraseñas (cuentas-y-home.md
// §1.2 y §2).

import { useState } from 'react'
import { EnterCode, Button, Field, Input, Modal, Stack } from '../../ui'
import { joinByCode } from '../home/navigation'
import { useMagicLink } from './useMagicLink'
import styles from './Landing.module.css'

interface Props {
  /**
   * Nombre del grupo cuando se llega por un link de reto (flujo A): cambia el
   * copy del hero a "Vive los viajes de <grupo>". Sin él, landing genérica (flujo B).
   */
  groupName?: string
  /**
   * URL absoluta de retorno tras el email; por defecto el origin actual. El
   * destino deep-link ya lo guardó el router en `lg.next` (ver App.tsx).
   */
  redirectTo?: string
}

export function Landing({ groupName, redirectTo }: Props) {
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
  } = useMagicLink({ redirectTo })

  // El popup del email arranca cerrado: primero la foto + la frase + el CTA.
  const [entryOpen, setEntryOpen] = useState(false)

  // Atajo opcional (solo landing genérica): el visitante que ya tiene un código
  // de VIAJE lo pega aquí y entra directo al flujo de unirse (#g=<código>). Es
  // distinto del código OTP de login: este navega, no autentica.
  const [groupCode, setGroupCode] = useState('')
  const [codeError, setCodeError] = useState<string | undefined>(undefined)
  const [joinOpen, setJoinOpen] = useState(false)

  const joining = Boolean(groupName)

  // Tras enviar el email, el flujo es idéntico al login: "introduce el código",
  // con reenviar y volver. Reutilizamos la pantalla del kit (su lienzo nativo, a
  // pantalla completa) para no divergir del login.
  if (step === 'code') {
    return (
      <EnterCode
        email={email}
        code={code}
        onCodeChange={setCode}
        onSubmit={verify}
        onResend={resend}
        onChangeEmail={() => {
          // Volver al email reabre el popup sobre la foto, no deja al usuario
          // mirando la foto sin saber qué hacer.
          reset()
          setEntryOpen(true)
        }}
        verifying={verifying}
        resending={resending}
        error={error}
      />
    )
  }

  return (
    <main className={`${styles.page} ${styles.scene}`} aria-label="Bienvenida a LocationGuesser">
      {/* Degradado a sangre sobre la foto para que el texto blanco siempre lea. */}
      <div className={styles.scrim} aria-hidden="true" />

      <div className={styles.content}>
        <span className={styles.brand} aria-hidden="true">
          📍
        </span>

        <div className={styles.hero}>
          {joining ? (
            <>
              <p className={styles.eyebrow}>Te han invitado</p>
              <h1 className={styles.headline}>
                Vive los viajes de <span className={styles.accent}>{groupName}</span>
              </h1>
              <p className={styles.lead}>Te comparten dónde estuvieron y tú lo vives con ellos.</p>
            </>
          ) : (
            <h1 className={styles.headline}>
              Que los que más quieres <span className={styles.accent}>lo vivan contigo</span>
            </h1>
          )}
        </div>

        <div className={styles.actions}>
          <Button size="lg" fullWidth onClick={() => setEntryOpen(true)}>
            {joining ? 'Entrar y unirme al viaje' : 'Empieza a compartir'}
          </Button>
          {!joining && (
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => {
                setCodeError(undefined)
                setJoinOpen(true)
              }}
            >
              ¿Te han pasado un código de viaje?
            </button>
          )}
        </div>
      </div>

      {/* POPUP del email: fino, descartable, con el flujo passwordless. */}
      <Modal
        open={entryOpen}
        onClose={loading ? undefined : () => setEntryOpen(false)}
        title={joining ? 'Entra y únete al viaje' : 'Comparte tus viajes'}
      >
        <p className={styles.modalLead}>
          Sin contraseñas: te mandamos un código para <strong>entrar o crear tu cuenta</strong>. Haz
          que los que más quieres vivan tus viajes contigo.
        </p>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <Stack gap={4}>
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
            <Button type="submit" size="lg" fullWidth loading={loading}>
              Enviarme el código
            </Button>
          </Stack>
        </form>
      </Modal>

      {/* POPUP del atajo "tengo un código de viaje": solo en la landing genérica
          (en el deep-link el viaje ya viene dado). */}
      {!joining && (
        <Modal open={joinOpen} onClose={() => setJoinOpen(false)} title="Únete a un viaje">
          <p className={styles.modalLead}>Pega el código o el enlace que te han compartido.</p>
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              if (joinByCode(groupCode)) {
                setCodeError(undefined)
              } else {
                setCodeError('Pega un código o enlace de viaje válido.')
              }
            }}
          >
            <Stack gap={4}>
              <Field label="Código o enlace del viaje" error={codeError}>
                {(fieldProps) => (
                  <Input
                    {...fieldProps}
                    type="text"
                    name="group-code"
                    placeholder="Pega aquí el código o el enlace"
                    value={groupCode}
                    onChange={(e) => setGroupCode(e.target.value)}
                    autoFocus
                  />
                )}
              </Field>
              <Button type="submit" size="lg" fullWidth>
                Unirme al viaje
              </Button>
            </Stack>
          </form>
        </Modal>
      )}
    </main>
  )
}
