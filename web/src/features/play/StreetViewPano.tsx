/// <reference types="google.maps" />
import { useEffect, useRef } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import type { LatLng } from '../../lib/geo'
import { Spinner } from '../../ui'
import styles from './StreetViewPano.module.css'

interface Props {
  /** Panorama exacto guardado en creación; preferido si existe (robusto frente a cambios de cobertura). */
  panoId: string | null
  /** Posición real del reto; fallback si no hay panoId. */
  position: LatLng
  /** POV inicial: todos arrancan mirando lo mismo. */
  heading: number | null
  pitch: number | null
}

// Panorama de Street View interactivo. vis.gl no expone componente de panorama,
// así que montamos la clase nativa `google.maps.StreetViewPanorama` sobre un ref
// y dejamos que el APIProvider (main.tsx) cargue el SDK vía useMapsLibrary.
export function StreetViewPano({ panoId, position, heading, pitch }: Props) {
  const streetViewLib = useMapsLibrary('streetView')
  const ref = useRef<HTMLDivElement>(null)
  // Dependemos de primitivos, no del objeto `position` (que el padre recrea en
  // cada render del timer): así el panorama se monta una vez y no parpadea.
  const { lat, lng } = position

  useEffect(() => {
    if (!streetViewLib || !ref.current) return

    // Spoiler-free + explorable como GeoGuessr: ocultamos lo que delata el sitio
    // (dirección, nombres de calle, fullscreen, cerrar) y dejamos navegar
    // (clic para avanzar, flechas de enlaces, pan y zoom con scroll).
    const options: google.maps.StreetViewPanoramaOptions = {
      pov: { heading: heading ?? 0, pitch: pitch ?? 0 },
      addressControl: false,
      showRoadLabels: false,
      fullscreenControl: false,
      enableCloseButton: false,
      clickToGo: true,
      linksControl: true,
      panControl: true,
      zoomControl: true,
      scrollwheel: true,
      motionTracking: false,
      motionTrackingControl: false,
    }
    if (panoId) {
      options.pano = panoId
    } else {
      options.position = { lat, lng }
    }

    const pano = new streetViewLib.StreetViewPanorama(ref.current, options)
    return () => {
      // Suelta la cámara/listeners; el div lo desmonta React.
      pano.setVisible(false)
    }
  }, [streetViewLib, panoId, lat, lng, heading, pitch])

  return (
    <div className={styles.pano}>
      <div ref={ref} className={styles.canvas} />
      {!streetViewLib && (
        <div className={styles.loading}>
          <Spinner size={32} />
        </div>
      )}
    </div>
  )
}
