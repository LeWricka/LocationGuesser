import { Button, Row } from '../../ui'
import styles from './StepHeader.module.css'

interface Props {
  /** Título numerado del paso (p.ej. «1 · El sitio»). */
  title: string
  /** Vuelve al paso anterior (o cancela en el primero). */
  onBack: () => void
}

// Cabecera de cada paso del asistente: sustituye a la barra de pasos. Un título
// numerado lleva el progreso (1 · … / 2 · … / 3 · …) sin ocupar una franja
// aparte. El control de navegación principal vive al pie de cada paso; este
// botón es solo el atajo de la esquina.
export function StepHeader({ title, onBack }: Props) {
  return (
    <Row gap={3} className={styles.header}>
      <Button variant="ghost" size="sm" onClick={onBack}>
        ← Anterior
      </Button>
      <h1 className={styles.title}>{title}</h1>
    </Row>
  )
}
