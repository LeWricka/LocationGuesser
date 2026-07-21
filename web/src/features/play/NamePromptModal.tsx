import { useEffect, useRef, type FormEvent } from 'react'
import { Button, Field, Input, Modal, Row, Stack } from '../../ui'

interface Props {
  open: boolean
  name: string
  onNameChange: (value: string) => void
  onSubmit: () => void
  saving?: boolean
  error?: string | null
  /**
   * Colisión de nombre (issue #756): nombre de un miembro YA existente del
   * viaje que coincide (sin mayúsculas ni espacios) con el que se acaba de
   * intentar guardar. Con valor no-null, el modal deja de pedir el nombre y
   * pasa a la puerta "¿Eres tú?" (dos salidas, ver `onDismissConflict` /
   * `onConfirmIsMe`). null = sin conflicto, paso normal de pedir nombre.
   */
  conflictName?: string | null
  /** "No soy yo": vuelve al paso de nombre para elegir otro. */
  onDismissConflict?: () => void
  /** "Soy yo": abre el login con correo para recuperar la cuenta existente. */
  onConfirmIsMe?: () => void
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
 *
 * Nombre repetido = puerta de recuperación, no duplicado (issue #756): si el
 * nombre coincide con el de otro miembro del viaje, `PlayChallenge.submitName`
 * NO lo guarda sin más — aparca la decisión aquí ("¿Eres tú?") en vez de dejar
 * que el marcador acabe con dos entradas del mismo humano. Es lo mismo o menos
 * texto que antes, solo cambia la pregunta que se hace.
 */
export function NamePromptModal({
  open,
  name,
  onNameChange,
  onSubmit,
  saving = false,
  error,
  conflictName = null,
  onDismissConflict,
  onConfirmIsMe,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open && !conflictName) inputRef.current?.focus()
  }, [open, conflictName])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  if (conflictName) {
    return (
      <Modal
        open={open}
        title="¿Eres tú?"
        footer={
          <Row gap={2} justify="end">
            <Button variant="secondary" size="sm" onClick={onDismissConflict}>
              No soy yo
            </Button>
            <Button size="sm" onClick={onConfirmIsMe}>
              Soy yo, entrar con mi correo
            </Button>
          </Row>
        }
      >
        <Stack gap={3}>
          <p>
            Ya hay un <strong>{conflictName}</strong> en este viaje. Si eres tú volviendo desde otro
            móvil, entra con tu correo y recuperas tus puntos y tu puesto. Si no, elige otro nombre
            para no confundiros en el marcador.
          </p>
        </Stack>
      </Modal>
    )
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
          <p>Así te reconoce tu gente en el marcador.</p>
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
