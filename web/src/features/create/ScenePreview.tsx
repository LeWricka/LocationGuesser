import { type Difficulty, DIFFICULTY_LABEL, sceneMediumFromMedia } from '../../lib/difficulty'
import { StreetViewPreview } from './StreetViewPreview'
import { Badge, ChallengePhoto, Stack } from '../../ui'
import styles from './ScenePreview.module.css'

interface Props {
  difficulty: Difficulty
  /** Panorama a mostrar (Fácil/Medio). Null si el reto es solo foto. */
  panoId: string | null
  /** POV con el que arrancarán los jugadores. */
  pov: { heading: number; pitch: number }
  /** URL (object URL local) de la foto del reto. Null si el reto es solo SV. */
  photoUrl: string | null
}

// Paso 3 del flujo: previa "así lo verán los participantes". Renderiza la escena
// REAL con la misma prioridad que el play (Street View manda sobre la foto si
// hay ambos) y la etiqueta de dificultad, para que el creador confirme con plena
// información. Reusa la previa de Street View y el marco de foto del UI kit.
export function ScenePreview({ difficulty, panoId, pov, photoUrl }: Props) {
  const medium = sceneMediumFromMedia({
    hasPhoto: photoUrl != null,
    hasStreetView: panoId != null,
  })

  return (
    <Stack gap={3}>
      <div className={styles.headerRow}>
        <strong className={styles.heading}>Así lo verán los participantes</strong>
        <Badge tone="accent">{DIFFICULTY_LABEL[difficulty]}</Badge>
      </div>

      {/* Escena protagonista: la que de verdad verán al jugar. */}
      {medium === 'streetview' && panoId ? (
        <StreetViewPreview panoId={panoId} heading={pov.heading} pitch={pov.pitch} />
      ) : medium === 'photo' && photoUrl ? (
        <ChallengePhoto src={photoUrl} alt="Foto del reto" zoomable={false} />
      ) : (
        <p className={styles.empty}>Nada que mostrar todavía.</p>
      )}

      {/* En Fácil la foto acompaña al panorama (pista visible al jugar). */}
      {medium === 'streetview' && photoUrl && (
        <Stack gap={1}>
          <span className={styles.subLabel}>Además, esta foto como pista:</span>
          <ChallengePhoto src={photoUrl} alt="Foto del reto" size="sm" zoomable={false} />
        </Stack>
      )}
    </Stack>
  )
}
