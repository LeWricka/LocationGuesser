/// <reference types="google.maps" />
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
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
  /**
   * Candado de MOVIMIENTO (#187): si true, no se puede ir a panoramas contiguos
   * (sin flechas de enlaces ni clic-para-avanzar). Default false (explorable).
   */
  lockMove?: boolean
  /**
   * Candado de GIRO (#187): si true, no se puede mirar alrededor; la vista queda
   * clavada en el POV inicial del reto. Default false (explorable).
   */
  lockRotate?: boolean
  /** Emite el heading actual (0=N) cada vez que el jugador gira el panorama. */
  onPovChanged?: (heading: number) => void
}

/** API imperativa para recolocar el panorama desde los controles flotantes. */
export interface StreetViewPanoHandle {
  /** Vuelve al pano/posición de inicio Y al POV inicial del reto. */
  resetToStart: () => void
  /** Endereza: deja la vista mirando al norte/horizonte inicial, sin mover de sitio. */
  resetPov: () => void
}

// Panorama de Street View interactivo. vis.gl no expone componente de panorama,
// así que montamos la clase nativa `google.maps.StreetViewPanorama` sobre un ref
// y dejamos que el APIProvider (main.tsx) cargue el SDK vía useMapsLibrary.
//
// Exponemos (a) `onPovChanged` para que la brújula siga el giro, y (b) una API
// imperativa (`resetToStart`/`resetPov`) para los controles "volver al inicio" y
// "enderezar/norte" sin recrear el panorama (recrearlo parpadea y recarga teselas).
export const StreetViewPano = forwardRef<StreetViewPanoHandle, Props>(function StreetViewPano(
  { panoId, position, heading, pitch, lockMove = false, lockRotate = false, onPovChanged },
  ref,
) {
  const streetViewLib = useMapsLibrary('streetView')
  const containerRef = useRef<HTMLDivElement>(null)
  const panoRef = useRef<google.maps.StreetViewPanorama | null>(null)
  // Dependemos de primitivos, no del objeto `position` (que el padre recrea en
  // cada render del timer): así el panorama se monta una vez y no parpadea.
  const { lat, lng } = position
  const startHeading = heading ?? 0
  const startPitch = pitch ?? 0

  // `onPovChanged` puede cambiar de identidad entre renders (el padre lo recrea):
  // lo guardamos en un ref para suscribir el listener UNA vez y no recrear el pano.
  const onPovChangedRef = useRef(onPovChanged)
  onPovChangedRef.current = onPovChanged

  useImperativeHandle(
    ref,
    () => ({
      resetToStart() {
        const pano = panoRef.current
        if (!pano) return
        if (panoId) pano.setPano(panoId)
        else pano.setPosition({ lat, lng })
        pano.setPov({ heading: startHeading, pitch: startPitch })
        pano.setZoom(1)
      },
      resetPov() {
        panoRef.current?.setPov({ heading: startHeading, pitch: startPitch })
      },
    }),
    [panoId, lat, lng, startHeading, startPitch],
  )

  useEffect(() => {
    if (!streetViewLib || !containerRef.current) return

    // Spoiler-free + explorable como GeoGuessr: ocultamos lo que delata el sitio
    // (dirección, nombres de calle, fullscreen, cerrar) y dejamos navegar
    // (clic para avanzar, flechas de enlaces, pan y zoom con scroll).
    //
    // Candados de dificultad (#187):
    //  · MOVIMIENTO bloqueado → clickToGo:false + linksControl:false: ni clic para
    //    avanzar ni flechas de enlaces; el jugador no puede irse a panoramas vecinos.
    //  · GIRO bloqueado → escondemos panControl (el giro se fuerza vía el listener
    //    pov_changed más abajo, que es lo único que el SDK respeta de verdad).
    const options: google.maps.StreetViewPanoramaOptions = {
      pov: { heading: startHeading, pitch: startPitch },
      addressControl: false,
      showRoadLabels: false,
      fullscreenControl: false,
      enableCloseButton: false,
      clickToGo: !lockMove,
      linksControl: !lockMove,
      panControl: !lockRotate,
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

    const pano = new streetViewLib.StreetViewPanorama(containerRef.current, options)
    panoRef.current = pano

    // La brújula sigue el giro: emitimos el heading en cada cambio de POV.
    onPovChangedRef.current?.(startHeading)
    const listener = pano.addListener('pov_changed', () => {
      // GIRO bloqueado (#187): el SDK de Google no tiene flag nativo para impedir
      // el pan, así que reenganchamos el POV al inicial en cada cambio. Comparamos
      // antes de fijar para NO entrar en bucle (setPov dispara pov_changed otra vez):
      // si ya está en el POV inicial, no hacemos nada y el evento muere ahí.
      if (lockRotate) {
        const pov = pano.getPov()
        if (pov.heading !== startHeading || pov.pitch !== startPitch) {
          pano.setPov({ heading: startHeading, pitch: startPitch })
        }
        // Con el giro clavado, la brújula siempre apunta al heading inicial.
        onPovChangedRef.current?.(startHeading)
        return
      }
      onPovChangedRef.current?.(pano.getPov().heading)
    })

    return () => {
      listener.remove()
      // Suelta la cámara/listeners; el div lo desmonta React.
      pano.setVisible(false)
      panoRef.current = null
    }
  }, [streetViewLib, panoId, lat, lng, startHeading, startPitch, lockMove, lockRotate])

  return (
    <div className={styles.pano}>
      <div ref={containerRef} className={styles.canvas} />
      {!streetViewLib && (
        <div className={styles.loading}>
          <Spinner size={32} />
        </div>
      )}
    </div>
  )
})
