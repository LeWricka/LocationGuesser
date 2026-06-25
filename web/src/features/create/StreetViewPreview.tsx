import { useEffect, useRef } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import styles from './StreetViewPreview.module.css'

interface Props {
  /** Panorama exacto a mostrar (robusto frente a cambios de cobertura). */
  panoId: string
  /** Rumbo inicial en grados. */
  heading: number
  /** Inclinación inicial en grados. */
  pitch: number
  /**
   * Callback con el POV actual cuando el creador gira la previa, para capturar
   * el encuadre con el que arrancarán los jugadores.
   */
  onPovChange?: (pov: { heading: number; pitch: number }) => void
}

// Previa interactiva de Street View para que el creador confirme el panorama
// encajado. Monta la clase nativa StreetViewPanorama sobre un ref (vis.gl no
// expone componente propio) y oculta los controles que revelarían la respuesta.
export function StreetViewPreview({ panoId, heading, pitch, onPovChange }: Props) {
  const streetViewLib = useMapsLibrary('streetView')
  const ref = useRef<HTMLDivElement>(null)
  // Guardamos el callback en un ref para no recrear el panorama en cada render.
  const onPovChangeRef = useRef(onPovChange)
  useEffect(() => {
    onPovChangeRef.current = onPovChange
  }, [onPovChange])

  useEffect(() => {
    if (!streetViewLib || !ref.current) return
    const panorama = new streetViewLib.StreetViewPanorama(ref.current, {
      pano: panoId,
      pov: { heading, pitch },
      // Ocultar todo lo que delata la ubicación (= spoiler).
      addressControl: false,
      showRoadLabels: false,
      fullscreenControl: false,
      zoomControl: false,
      panControl: false,
      linksControl: false,
      enableCloseButton: false,
      motionTracking: false,
      motionTrackingControl: false,
    })

    // Capturamos el POV cuando el creador gira la previa.
    const listener = panorama.addListener('pov_changed', () => {
      const pov = panorama.getPov()
      onPovChangeRef.current?.({ heading: pov.heading, pitch: pov.pitch })
    })

    return () => listener.remove()
    // panoId es la identidad del panorama; heading/pitch solo siembran el POV
    // inicial, así que no re-montamos al capturarlos de vuelta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streetViewLib, panoId])

  return <div ref={ref} className={styles.preview} aria-label="Vista previa de Street View" />
}
