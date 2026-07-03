import { useEffect, useRef } from 'react'
import { Button, Modal, Row } from '../../ui'

interface Props {
  open: boolean
  /** Reto con límite de tiempo: el reloj sigue corriendo aunque salgas. */
  timed: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Confirmación de "salir mientras juegas" (issue #663): sustituye el
 * `window.confirm` nativo, que rompía el lenguaje visual (grafito+teal,
 * tipografía propia) y no respetaba reduced-motion. Compartido entre
 * PlayChallenge (reto de lugar) y PlayNumberChallenge (reto numérico): mismo
 * mensaje, mismo patrón en las dos pantallas de juego.
 */
export function ExitConfirmModal({ open, timed, onConfirm, onCancel }: Props) {
  const stayWrapRef = useRef<HTMLDivElement>(null)

  // Foco inicial en "Seguir jugando" (evita que un Enter reflejo abandone la
  // partida por accidente). El efecto propio de <Modal> ya movió el foco al
  // panel al abrir; este efecto —del padre, así que corre DESPUÉS por el orden
  // hijo→padre de los efectos de React— lo redirige al botón seguro.
  useEffect(() => {
    if (open) stayWrapRef.current?.querySelector('button')?.focus()
  }, [open])

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Salir del reto"
      footer={
        <Row gap={2} justify="end">
          <div ref={stayWrapRef}>
            <Button variant="secondary" onClick={onCancel}>
              Seguir jugando
            </Button>
          </div>
          <Button variant="danger" onClick={onConfirm}>
            Abandonar
          </Button>
        </Row>
      }
    >
      <p>
        {timed
          ? 'El tiempo sigue corriendo aunque salgas. Al volver seguirás donde lo dejaste, no se reinicia. ¿Salir?'
          : 'Al volver seguirás en este reto, no se reinicia. ¿Salir?'}
      </p>
    </Modal>
  )
}
