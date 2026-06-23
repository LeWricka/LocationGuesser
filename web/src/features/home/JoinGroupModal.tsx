import { useState } from 'react'
import { Button, Field, Input, Modal } from '../../ui'
import { joinByCode } from './navigation'

interface Props {
  open: boolean
  onClose: () => void
}

// Modal de "Unirme con un código": el usuario pega el enlace del grupo (…#g=…)
// o el código a secas. Navegamos al grupo y el auto-join de App.tsx hace el
// alta de forma idempotente. Vive en la home porque solo la home lo abre.
export function JoinGroupModal({ open, onClose }: Props) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit() {
    const ok = joinByCode(value)
    if (!ok) {
      setError('Pega el enlace del grupo o su código.')
      return
    }
    // Navegado: limpiamos y cerramos para no dejar el código a la vista.
    setValue('')
    setError(null)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Unirme con un código"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!value.trim()}>
            Entrar
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field
          label="Enlace o código del grupo"
          hint="Te lo pasa quien te invita. Vale el enlace entero o solo el código."
          error={error}
        >
          {(props) => (
            <Input
              {...props}
              value={value}
              onChange={(e) => {
                setValue(e.target.value)
                if (error) setError(null)
              }}
              placeholder="https://…#g=ABC123  o  ABC123"
              autoFocus
            />
          )}
        </Field>
      </form>
    </Modal>
  )
}
