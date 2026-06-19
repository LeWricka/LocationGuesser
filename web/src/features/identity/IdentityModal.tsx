import { useState } from 'react'
import { Button, Field, Input, Modal, Stack } from '../../ui'
import { ensurePlayer } from '../../lib/players'
import { getClientId, hashPin, setIdentity } from '../../lib/identity'
import styles from './IdentityModal.module.css'

interface Props {
  open: boolean
  /** Grupo al que nos unimos: el nombre debe ser único dentro de él. */
  groupId: string
  /** Nombre confirmado y fila `players` lista en este grupo. */
  onResolved: (name: string) => void
  /** El usuario cerró sin completar (no hay nombre). */
  onCancel: () => void
}

// Pide nombre + PIN de 4 dígitos para fijar la identidad global del navegador
// y registrar/reclamar el nombre en el grupo. Cubre crear, reclamar (PIN
// correcto) y colisión (nombre de otra persona → otro PIN u otro nombre).
export function IdentityModal({ open, groupId, onResolved, onCancel }: Props) {
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function reset() {
    setName('')
    setPin('')
    setError(null)
    setBusy(false)
  }

  async function submit() {
    const cleanName = name.trim()
    if (!cleanName) {
      setError('Escribe tu nombre.')
      return
    }
    if (!/^\d{4}$/.test(pin)) {
      setError('El PIN son 4 dígitos.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const pinHash = await hashPin(pin)
      const result = await ensurePlayer({
        groupId,
        name: cleanName,
        clientId: getClientId(),
        pinHash,
      })
      if (result.status === 'wrong-pin') {
        // El nombre ya es de otra persona en este grupo (su pin_hash no coincide).
        setError('Ese nombre ya está cogido. Mete su PIN o elige otro.')
        setBusy(false)
        return
      }
      // created o claimed: en ambos guardamos la identidad global del navegador.
      // En `claimed` el pin_hash es el mismo, así que setIdentity es consistente.
      setIdentity(cleanName, pinHash)
      reset()
      onResolved(cleanName)
    } catch (err) {
      setError(`No se pudo continuar: ${err instanceof Error ? err.message : String(err)}`)
      setBusy(false)
    }
  }

  function cancel() {
    reset()
    onCancel()
  }

  return (
    <Modal
      open={open}
      onClose={cancel}
      title="¿Quién juega?"
      footer={
        <Button size="lg" fullWidth loading={busy} onClick={() => void submit()}>
          Entrar
        </Button>
      }
    >
      <Stack gap={3}>
        <p className={styles.intro}>
          Tu nombre te identifica en el viaje. El PIN protege tu nombre para que solo tú lo uses
          (también sirve para recuperarlo en otro móvil).
        </p>
        <Field label="Tu nombre">
          {(fieldProps) => (
            <Input
              {...fieldProps}
              placeholder="Ej. Ana"
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label="PIN de 4 dígitos" error={error}>
          {(fieldProps) => (
            <Input
              {...fieldProps}
              type="text"
              inputMode="numeric"
              pattern="\d*"
              maxLength={4}
              placeholder="••••"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          )}
        </Field>
      </Stack>
    </Modal>
  )
}
