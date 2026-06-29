/// <reference types="google.maps" />
import { useEffect, useState } from 'react'
import { Map, Marker, Polyline, useMap } from '@vis.gl/react-google-maps'
import type { LatLng } from '../../lib/geo'
import { avatarPinFromProfile, PIN_ANCHOR, PIN_SIZE } from '../../lib/avatarPin'

// Vista inicial: el MUNDO entero. Empezando alejado, el
// jugador va de lejos a cerca directo sin tener que alejar primero.
const WORLD: google.maps.LatLngLiteral = { lat: 25, lng: 0 }
const WORLD_ZOOM = 2

// Los pines son emoji renderizados como `label` del Marker clásico. Usamos el
// Marker clásico (no AdvancedMarker) a propósito: NO requiere `mapId`, así no
// hace falta crear nada en Google Cloud. El icono es un PNG transparente de 1px
// (data URI) para que el glifo por defecto no se vea; el emoji va en el label.
const TRANSPARENT_PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

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
}

// Icono emoji para el Marker clásico: el emoji va como `label` centrado sobre un
// icono transparente. `labelOrigin` lo coloca en la "punta" del pin (abajo).
function emojiIcon(): google.maps.Icon {
  return {
    url: TRANSPARENT_PX,
    size: new google.maps.Size(30, 30),
    scaledSize: new google.maps.Size(30, 30),
    anchor: new google.maps.Point(15, 28),
    labelOrigin: new google.maps.Point(15, 14),
  }
}

function emojiLabel(emoji: string): google.maps.MarkerLabel {
  return { text: emoji, fontSize: '26px', className: 'lg-pin' }
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
  return (
    <Marker
      position={answer}
      icon={emojiIcon()}
      label={emojiLabel('🎯')}
      clickable={false}
      animation={animation}
    />
  )
}

export function PlayMap({ guess, answer, locked, onPick, meAvatar, meUserId }: Props) {
  return (
    <Map
      className="lg-map"
      defaultCenter={WORLD}
      defaultZoom={WORLD_ZOOM}
      minZoom={2}
      // Un dedo mueve el mapa en móvil (sin el banner "usa dos dedos"), igual que
      // el worldCopyJump/arrastre fluido de antes.
      gestureHandling="greedy"
      // Mapa estándar de Google → POIs/bares visibles por defecto (lo que pide el
      // juego). Sin mapId: usamos Marker clásico, no AdvancedMarker.
      // Atelier: basemap CLARO tipo atlas (roadmap), nunca el oscuro; forzamos el
      // esquema claro para que no siga el modo oscuro del sistema.
      mapTypeId="roadmap"
      colorScheme="LIGHT"
      disableDefaultUI
      zoomControl
      clickableIcons={false}
      // Colocar/mover el pin tocando el mapa, solo mientras no esté bloqueado.
      onClick={(e) => {
        if (locked) return
        const latLng = e.detail.latLng
        if (latLng) onPick({ lat: latLng.lat, lng: latLng.lng })
      }}
    >
      {guess && <Marker position={guess} icon={guessIcon(meAvatar, meUserId)} clickable={false} />}
      {answer && <AnswerMarker answer={answer} />}
      {guess && answer && <DrawnLine guess={guess} answer={answer} />}
      {guess && answer && <FitToReveal guess={guess} answer={answer} />}
    </Map>
  )
}
