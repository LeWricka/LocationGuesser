/// <reference types="google.maps" />
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useMapsLibraryGuarded } from '../../lib/mapsGuard'
import type { LatLng } from '../../lib/geo'
import { Spinner } from '../../ui'
import styles from './StreetViewPano.module.css'

// Red de seguridad si `status_changed` no llega (ver el efecto principal):
// no dejamos el panorama oculto para siempre.
const READY_FALLBACK_MS = 2000

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
  // Guarded (issue #988, Sentry LOCATIONGUESSER-1J): si la librería 'streetView'
  // no llega tras cargar el SDK (bloqueador, DNS privado, roaming), esto ya no
  // se queda en spinner eterno — escala al banner "No se pudo cargar el mapa ·
  // Reintentar" del `<GoogleMapsProvider>` ancestro tras un tope de espera.
  const streetViewLib = useMapsLibraryGuarded('streetView')
  const containerRef = useRef<HTMLDivElement>(null)
  const panoRef = useRef<google.maps.StreetViewPanorama | null>(null)
  // Issue #978: al resolver la posición/panoId, Google puede asentar la vista en
  // un heading propio (p.ej. el sentido de la calle) ANTES de aplicar el nuestro,
  // lo que se ve como un giro de más de una vuelta al abrir. Lo evitamos montando
  // el panorama oculto y revelándolo solo cuando confirmamos el heading real
  // (ver el listener `status_changed` más abajo): así nunca se ve el giro.
  const [ready, setReady] = useState(false)
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
    setReady(false)

    // Spoiler-free + explorable: ocultamos lo que delata el sitio
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
      // Oculto hasta confirmar el heading real (ver comentario de `ready` arriba):
      // issue #978, evita el giro de asentamiento visible al abrir.
      visible: false,
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

    // Revela el panorama YA orientado (issue #978): forzamos de nuevo el heading
    // exacto (por si Google lo reajustó al resolver el pano/posición) y solo
    // ENTONCES lo mostramos, cuando `status_changed` confirma la carga. Con
    // `visible:false` de entrada, cualquier giro de asentamiento interno pasa
    // oculto — el jugador nunca lo ve. `revealed` evita re-ejecutar si el status
    // cambia más de una vez (p.ej. reintento tras error).
    let revealed = false
    const reveal = () => {
      if (revealed) return
      revealed = true
      if (pano.getStatus() === 'OK') {
        pano.setPov({ heading: startHeading, pitch: startPitch })
      }
      pano.setVisible(true)
      setReady(true)
    }
    const statusListener = pano.addListener('status_changed', reveal)
    const revealFallback = window.setTimeout(reveal, READY_FALLBACK_MS)

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
      window.clearTimeout(revealFallback)
      statusListener.remove()
      listener.remove()
      // Suelta la cámara/listeners; el div lo desmonta React.
      pano.setVisible(false)
      panoRef.current = null
    }
  }, [streetViewLib, panoId, lat, lng, startHeading, startPitch, lockMove, lockRotate])

  return (
    <div className={styles.pano}>
      <div ref={containerRef} className={styles.canvas} />
      {(!streetViewLib || !ready) && (
        <div className={styles.loading}>
          <Spinner size={32} />
        </div>
      )}
    </div>
  )
})
