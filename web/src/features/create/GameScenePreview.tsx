import { useRef, useState } from 'react'
import { GameScene, type GameSceneData } from '../../features/play/GameScene'
import type { StreetViewPanoHandle } from '../../features/play/StreetViewPano'
import type { LatLng } from '../../lib/geo'

interface Props {
  /** Título del reto (borrador). */
  title: string
  /** Panorama encajado (borrador); null si el reto es solo foto. */
  panoId: string | null
  /** POV inicial del panorama. */
  pov: { heading: number; pitch: number }
  /** Candados de exploración (lock = !allow). Solo aplican con panorama. */
  lockMove: boolean
  lockRotate: boolean
  /** Respuesta del reto (el punto del mapa): aquí solo alimenta el fallback del pano. */
  point: LatLng
  /** Foto del reto (object URL local). Con SV va como pista; sin SV ES la escena. */
  photoUrl: string | null
  /** Segundos por jugada (borrador); null = sin límite. Pinta el anillo de cuenta atrás. */
  guessSeconds: number | null
  /** Salir de la previa (vuelve al paso anterior del asistente). */
  onBack: () => void
}

// PREVIA = pantalla de juego REAL (issue #234). Monta la MISMA `GameScene` que usa
// PlayChallenge al jugar, con los datos del BORRADOR (sin guardar). Es una previa:
// NO emite voto, NO llama a submit_vote, NO carga un reto por id. El botón de
// confirmar va deshabilitado (`confirmDisabled`) y NO se monta el overlay "Empezar"
// (la escena se ve directamente, como ya empezada): así el creador ve EXACTAMENTE
// lo que verán los jugadores sin tocar el flujo real de votar.
export function GameScenePreview({
  title,
  panoId,
  pov,
  lockMove,
  lockRotate,
  point,
  photoUrl,
  guessSeconds,
  onBack,
}: Props) {
  // Estado local de la previa: el pin de adivinar, la hoja del mapa y el visor de
  // foto. Es interacción "de mentira" (no se vota), pero deja probar el mapa y la
  // foto igual que al jugar.
  const [guess, setGuess] = useState<LatLng | null>(null)
  const [mapOpen, setMapOpen] = useState(false)
  const [photoExpanded, setPhotoExpanded] = useState(false)
  const panoRef = useRef<StreetViewPanoHandle>(null)

  const hasStreetView = panoId != null
  const scene: GameSceneData = hasStreetView
    ? {
        kind: 'streetview',
        panoId,
        position: point,
        heading: pov.heading,
        pitch: pov.pitch,
        lockMove,
        lockRotate,
        hintPhotoUrl: photoUrl,
      }
    : { kind: 'photo', photoUrl }

  return (
    <GameScene
      title={title || 'Tu reto'}
      scene={scene}
      // La escena se ve directamente (previa = ya jugando), sin overlay "Empezar".
      sceneReady
      // Reloj informativo: enseña el anillo con el tiempo elegido (estático), pero
      // no corre ni revela (es una previa).
      remaining={guessSeconds}
      guessSeconds={guessSeconds}
      backLabel="← Editar"
      onBack={onBack}
      guess={guess}
      onGuess={setGuess}
      mapOpen={mapOpen}
      onOpenMap={() => setMapOpen(true)}
      onCloseMap={() => setMapOpen(false)}
      // Sin identidad en la previa: el pin propio usa el avatar por defecto.
      meAvatar={null}
      meUserId=""
      // PREVIA: confirmar deshabilitado (no se vota); cerrar la hoja vuelve a la escena.
      onConfirm={() => setMapOpen(false)}
      confirmDisabled
      photoExpanded={photoExpanded}
      onExpandPhoto={() => setPhotoExpanded(true)}
      onClosePhoto={() => setPhotoExpanded(false)}
      panoRef={panoRef}
    />
  )
}
