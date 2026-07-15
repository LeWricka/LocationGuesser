import { useEffect, useRef, type FormEvent } from 'react'
import { Button, Field, Input, Modal, Row, Stack } from '../../ui'

interface Props {
  open: boolean
  name: string
  onNameChange: (value: string) => void
  onSubmit: () => void
  saving?: boolean
  error?: string | null
}

/**
 * Un solo campo, "¿con qué nombre juegas?", antes de revelar el resultado de un
 * RECEPTOR sin cuenta (issue #758): su sesión es anónima desde que abrió el
 * enlace, así que su voto YA cuenta (`auth.uid()` real), pero el marcador
 * muestra `profiles.display_name` — sin nombre, aparecería como "—" junto a su
 * puesto. Se pide UNA sola vez (en cuanto lo guarda, `profile.display_name`
 * deja de estar vacío y `PlayChallenge` no vuelve a montar este modal).
 *
 * No es saltable a propósito: sin nombre el resto del grupo no sabría de quién
 * es ese puesto en el marcador. Es el único dato que pedimos ANTES del
 * resultado; el email sigue siendo opcional y llega después (AccountUpgradeModal).
 */
export function NamePromptModal({
  open,
  name,
  onNameChange,
  onSubmit,
  saving = false,
  error,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <Modal
      open={open}
      title="¿Con qué nombre juegas?"
      footer={
        <Row gap={2} justify="end">
          <Button size="sm" loading={saving} onClick={onSubmit}>
            Ver mi resultado
          </Button>
        </Row>
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        <Stack gap={3}>
          <p>Así te reconoce el resto del grupo en el marcador.</p>
          <Field label="Tu nombre" error={error}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                ref={inputRef}
                type="text"
                name="display_name"
                autoComplete="name"
                placeholder="Tu nombre"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                disabled={saving}
              />
            )}
          </Field>
        </Stack>
      </form>
    </Modal>
  )
}
