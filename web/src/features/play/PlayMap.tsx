/// <reference types="google.maps" />
import { useEffect, useState } from 'react'
import { Map, Marker, Polyline, useMap } from '@vis.gl/react-google-maps'
import { MapPin } from 'lucide-react'
import type { LatLng } from '../../lib/geo'
import { avatarPinFromProfile, PIN_ANCHOR, PIN_SIZE } from '../../lib/avatarPin'
import type { MapPreset } from '../../lib/mapPresets'
import { Icon } from '../../ui'
import styles from './PlayMap.module.css'

// Vista inicial: el MUNDO entero. Empezando alejado, el
// jugador va de lejos a cerca directo sin tener que alejar primero.
const WORLD: google.maps.LatLngLiteral = { lat: 25, lng: 0 }
const WORLD_ZOOM = 2

// El pin de la respuesta es el icono `Target` de lucide (mismo set que el resto
// de la app, sin el "tell" de prototipo del emoji). Usamos el Marker clásico (no
// AdvancedMarker) a propósito: NO requiere `mapId`, así no hace falta crear nada
// en Google Cloud. El glifo va como `icon.url` (data-URI SVG), igual que el pin
// del propio jugador (avatarPin): así heredan el mismo enfoque y conservan la
// animación DROP nativa del Marker.
const ANSWER_PIN_SIZE = 34

// Target de lucide como data-URI SVG. El color sale del token `--accent` en
// runtime (Google necesita un literal; no hardcodeamos el color en el repo).
function answerPinUri(color: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ANSWER_PIN_SIZE}" height="${ANSWER_PIN_SIZE}" ` +
    `viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.25" ` +
    'stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/>' +
    '<circle cx="12" cy="12" r="2"/></svg>'
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

const respectsMotion = () =>
  typeof window !== 'undefined' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Acento Pizarra de los tokens (no hardcodear color): Google Maps necesita un
// string literal para el trazo, así que leemos `--accent` del :root en runtime.
function accentColor(): string {
  if (typeof window === 'undefined') return '#34506b'
  const value = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  return value || '#34506b'
}

interface Props {
  /** Pin del jugador; null hasta que toca el mapa. */
  guess: LatLng | null
  /** Ubicación real; solo se pasa tras revelar (entonces se dibuja 🎯 + línea). */
  answer: LatLng | null
  /** Bloquea el clic tras revelar: el voto ya no se puede mover. */
  locked: boolean
  onPick: (p: LatLng) => void
  /** Avatar del jugador (`profiles.avatar_url`) para la burbuja de su pin. */
  meAvatar?: string | null
  /** Id del jugador: ancla el avatar por defecto cuando no hay avatar elegido. */
  meUserId: string
  /**
   * Lienzo del mapa (preset central de `mapPresets`):
   *  - `jugar` (por defecto): callejero ETIQUETADO tipo GeoGuessr (roadmap de Google
   *    con calles y nombres) para colocar el pin navegando — el mapa no es ciego.
   *  - `diario`: satélite con etiquetas (hybrid), por si se quiere la foto aérea.
   */
  preset?: MapPreset
  /**
   * Pin de CENTRO FIJO (estilo GeoGuessr de una mano): en vez de tocar el mapa, el
   * pin se queda clavado en el centro de la pantalla y el jugador MUEVE el mapa
   * bajo él; al asentarse el arrastre, el voto = centro del mapa. Más preciso a una
   * mano en móvil. Opt-in; sin esto, el comportamiento clásico (tocar para marcar).
   */
  fixedCenterPin?: boolean
}

// El preset elige el tipo de mapa de Google: `jugar` → callejero etiquetado
// (roadmap, GeoGuessr); `diario` → satélite con etiquetas (hybrid).
function mapTypeForPreset(preset: MapPreset): string {
  return preset === 'jugar' ? 'roadmap' : 'hybrid'
}

/**
 * Modo PIN DE CENTRO FIJO: el pin no se mueve; el jugador arrastra el mapa y el voto
 * es el centro al asentarse el gesto. Escuchamos `idle` (Google lo dispara cuando el
 * mapa deja de moverse) y reportamos el centro. No-op si está bloqueado (tras revelar).
 */
function CenterPinTracker({ locked, onPick }: { locked: boolean; onPick: (p: LatLng) => void }) {
  const map = useMap()
  useEffect(() => {
    if (!map || locked) return
    const listener = map.addListener('idle', () => {
      const c = map.getCenter()
      if (c) onPick({ lat: c.lat(), lng: c.lng() })
    })
    return () => listener.remove()
  }, [map, locked, onPick])
  return null
}

// Icono del pin de la RESPUESTA (lucide Target): centrado en la coordenada exacta
// del objetivo. El color sale de `--accent` en runtime.
function answerIcon(): google.maps.Icon {
  return {
    url: answerPinUri(accentColor()),
    scaledSize: new google.maps.Size(ANSWER_PIN_SIZE, ANSWER_PIN_SIZE),
    anchor: new google.maps.Point(ANSWER_PIN_SIZE / 2, ANSWER_PIN_SIZE / 2),
  }
}

// Icono del pin del PROPIO jugador: la burbuja de su avatar (teardrop con su
// emoji sobre su fondo) servida como data-URI SVG en `icon.url`. Anclado por la
// punta a la coordenada exacta, igual que el resto de marcadores clásicos.
function guessIcon(avatar: string | null | undefined, userId: string): google.maps.Icon {
  return {
    url: avatarPinFromProfile(avatar ?? null, userId),
    scaledSize: new google.maps.Size(PIN_SIZE.width, PIN_SIZE.height),
    anchor: new google.maps.Point(PIN_ANCHOR.x, PIN_ANCHOR.y),
  }
}

// Al revelar, encuadra ambos puntos (tu pin + 🎯) con margen para que se vean
// los dos con el zoom adecuado. fitBounds es el equivalente directo del
// FitToReveal/fitBounds de Leaflet. El bloque de resultado entra con animación
// (transform): si encuadramos mientras anima, Google mide mal el contenedor y un
// pin queda fuera. Encuadramos tras un frame y otra vez al asentarse el layout,
// para que SIEMPRE entren ambos puntos sin cortarse.
function FitToReveal({ guess, answer }: { guess: LatLng; answer: LatLng }) {
  const map = useMap()
  useEffect(() => {
    if (!map) return
    const fit = () => {
      const bounds = new google.maps.LatLngBounds()
      bounds.extend(guess)
      bounds.extend(answer)
      // Padding generoso (px por lado) para que el glifo del pin nunca quede
      // pegado al borde y se corte. maxZoom evita acercar de más si los dos
      // puntos están casi encima (quedaría un zoom absurdo de calle).
      map.fitBounds(bounds, { top: 56, right: 56, bottom: 56, left: 56 })
      if ((map.getZoom() ?? 0) > 12) map.setZoom(12)
    }
    const raf = requestAnimationFrame(fit)
    const settle = setTimeout(fit, 520)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(settle)
    }
  }, [map, guess, answer])
  return null
}

// Línea pin → 🎯 que se "dibuja" al revelar. Google Polyline no expone el path
// SVG como Leaflet, así que recreamos la animación interpolando el extremo final
// del trazo de `guess` hacia `answer` con la Web Animations timing (rAF): el path
// crece de un punto a la recta completa. Bajo reduced-motion aparece ya completa.
function DrawnLine({ guess, answer }: { guess: LatLng; answer: LatLng }) {
  const animate = respectsMotion()
  // Reduced-motion: la recta completa de entrada (sin animar). Animando: arranca
  // como un punto en `guess` y el efecto la hace crecer hacia `answer`.
  const [path, setPath] = useState<google.maps.LatLngLiteral[]>(() =>
    animate ? [guess] : [guess, answer],
  )

  useEffect(() => {
    if (!animate) return
    const duration = 600
    const delay = 120
    const start = performance.now() + delay
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration))
      // Mismo easing que la animación Leaflet anterior (cubic-bezier suave-out).
      const eased = 1 - Math.pow(1 - t, 3)
      const end: google.maps.LatLngLiteral = {
        lat: guess.lat + (answer.lat - guess.lat) * eased,
        lng: guess.lng + (answer.lng - guess.lng) * eased,
      }
      setPath([guess, end])
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [animate, guess, answer])

  return (
    <Polyline
      path={path}
      strokeColor={accentColor()}
      strokeWeight={3}
      strokeOpacity={1}
      clickable={false}
    />
  )
}

// Pin de la respuesta (🎯) que "cae" con muelle al revelar, equivalente al
// lg-pin-drop de antes. Usamos la animación DROP nativa del Marker clásico, que
// no requiere mapId. Se aplica solo en el primer montaje (y si el sistema no
// pide reduce-motion); después se quita para que recolocar no rebote de nuevo.
function AnswerMarker({ answer }: { answer: LatLng }) {
  const [animation, setAnimation] = useState<google.maps.Animation | null>(
    respectsMotion() ? google.maps.Animation.DROP : null,
  )
  useEffect(() => {
    if (!animation) return
    const t = setTimeout(() => setAnimation(null), 800)
    return () => clearTimeout(t)
  }, [animation])
  return <Marker position={answer} icon={answerIcon()} clickable={false} animation={animation} />
}

export function PlayMap({
  guess,
  answer,
  locked,
  onPick,
  meAvatar,
  meUserId,
  preset = 'jugar',
  fixedCenterPin = false,
}: Props) {
  // En modo pin de centro fijo no se ve el pin-avatar (lo sustituye el pin clavado
  // al centro de la pantalla); tampoco se marca tocando, sino moviendo el mapa.
  const centerPinMode = fixedCenterPin && !answer
  return (
    <div className={styles.wrap}>
      <Map
        className="lg-map"
        defaultCenter={WORLD}
        defaultZoom={WORLD_ZOOM}
        minZoom={2}
        // Un dedo mueve el mapa en móvil (sin el banner "usa dos dedos"), igual que
        // el worldCopyJump/arrastre fluido de antes.
        gestureHandling="greedy"
        // Tipo de mapa según el PRESET (mapPresets): `jugar` → callejero etiquetado
        // tipo GeoGuessr (roadmap, calles y nombres para colocar el pin navegando);
        // `diario` → satélite con etiquetas (hybrid). Sin mapId: Marker clásico, no
        // AdvancedMarker. Forzamos esquema claro (no seguir el modo oscuro del SO).
        mapTypeId={mapTypeForPreset(preset)}
        colorScheme="LIGHT"
        disableDefaultUI
        zoomControl
        clickableIcons={false}
        // Colocar/mover el pin tocando el mapa, salvo en modo centro fijo (donde el
        // voto es el centro del mapa) o tras bloquear (revelado).
        onClick={(e) => {
          if (locked || centerPinMode) return
          const latLng = e.detail.latLng
          if (latLng) onPick({ lat: latLng.lat, lng: latLng.lng })
        }}
      >
        {/* En modo clásico, el pin-avatar clavado donde tocaste. En modo centro fijo
            no se dibuja (lo sustituye el pin estático del overlay). */}
        {guess && !centerPinMode && (
          <Marker position={guess} icon={guessIcon(meAvatar, meUserId)} clickable={false} />
        )}
        {answer && <AnswerMarker answer={answer} />}
        {guess && answer && <DrawnLine guess={guess} answer={answer} />}
        {guess && answer && <FitToReveal guess={guess} answer={answer} />}
        {centerPinMode && <CenterPinTracker locked={locked} onPick={onPick} />}
      </Map>

      {/* Pin de CENTRO FIJO: clavado en el centro de la pantalla mientras el jugador
          mueve el mapa debajo. Decorativo (pointer-events:none) para no robar el
          arrastre al mapa; el voto lo calcula `CenterPinTracker` con el centro. */}
      {centerPinMode && (
        <div className={styles.centerPin} aria-hidden="true">
          <Icon icon={MapPin} size={36} />
        </div>
      )}
    </div>
  )
}
