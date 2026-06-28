/// <reference types="google.maps" />
import { useEffect } from 'react'
import { Map, Marker, useMap } from '@vis.gl/react-google-maps'
import type { LatLng } from '../../lib/geo'
import { avatarPinFromProfile, PIN_SIZE, PIN_ANCHOR, PIN_LABEL_ORIGIN } from '../../lib/avatarPin'

// Vista por defecto (el MUNDO) hasta que fitBounds encuadra los puntos.
const WORLD: google.maps.LatLngLiteral = { lat: 25, lng: 0 }
const WORLD_ZOOM = 2

// El pin 🎯 de la respuesta real reusa el patrón del Marker clásico de PlayMap:
// icono transparente de 1px + emoji como `label` (sin AdvancedMarker → sin mapId).
const TRANSPARENT_PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

export interface GuessMarker extends LatLng {
  userId: string
  name: string
  /** `avatar_url` del perfil (token `emoji:…`, URL o null) para el pin de burbuja. */
  avatar: string | null
}

interface Props {
  answer: LatLng
  guesses: GuessMarker[]
}

// Icono 🎯 de la respuesta (emoji centrado sobre el icono transparente).
function answerIcon(): google.maps.Icon {
  return {
    url: TRANSPARENT_PX,
    size: new google.maps.Size(30, 30),
    scaledSize: new google.maps.Size(30, 30),
    anchor: new google.maps.Point(15, 28),
    labelOrigin: new google.maps.Point(15, 14),
  }
}

// Icono de burbuja de avatar (teardrop SVG con el emoji del jugador). El nombre
// va como label bajo la punta del pin (PIN_LABEL_ORIGIN).
function guessIcon(avatar: string | null, userId: string): google.maps.Icon {
  return {
    url: avatarPinFromProfile(avatar, userId),
    scaledSize: new google.maps.Size(PIN_SIZE.width, PIN_SIZE.height),
    anchor: new google.maps.Point(PIN_ANCHOR.x, PIN_ANCHOR.y),
    labelOrigin: new google.maps.Point(PIN_LABEL_ORIGIN.x, PIN_LABEL_ORIGIN.y),
  }
}

function nameLabel(name: string): google.maps.MarkerLabel {
  return { text: name, fontSize: '12px', fontWeight: '600' }
}

// Label de la respuesta: el emoji 🎯 grande, centrado sobre el icono transparente.
function answerLabel(): google.maps.MarkerLabel {
  return { text: '🎯', fontSize: '26px', className: 'lg-pin' }
}

// Encuadra la respuesta + todos los votos. El bloque del revelado entra con
// animación (despliegue del disclosure): si encuadramos mientras anima, Google
// mide mal el contenedor y un pin queda fuera. Encuadramos tras un frame y otra
// vez al asentarse el layout, igual que FitToReveal de PlayMap.
function FitToAll({ answer, guesses }: Props) {
  const map = useMap()
  useEffect(() => {
    if (!map) return
    const fit = () => {
      const bounds = new google.maps.LatLngBounds()
      bounds.extend(answer)
      for (const g of guesses) bounds.extend({ lat: g.lat, lng: g.lng })
      // Un solo punto (respuesta sin votos plotables): centro con zoom medio.
      if (guesses.length === 0) {
        map.setCenter(answer)
        map.setZoom(11)
        return
      }
      map.fitBounds(bounds, { top: 64, right: 64, bottom: 64, left: 64 })
      if ((map.getZoom() ?? 0) > 12) map.setZoom(12)
    }
    const raf = requestAnimationFrame(fit)
    const settle = setTimeout(fit, 520)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(settle)
    }
  }, [map, answer, guesses])
  return null
}

/**
 * Mapa resumen de un reto cerrado (Google Maps, mismo motor que PlayMap): la
 * burbuja de avatar de CADA jugador que votó (con su nombre como label) y la
 * respuesta real 🎯. Encuadra todos los puntos. Sin AdvancedMarker → sin mapId.
 */
export function AllGuessesMap({ answer, guesses }: Props) {
  return (
    <Map
      className="lg-map"
      defaultCenter={WORLD}
      defaultZoom={WORLD_ZOOM}
      minZoom={2}
      gestureHandling="greedy"
      disableDefaultUI
      zoomControl
      clickableIcons={false}
    >
      <Marker position={answer} icon={answerIcon()} label={answerLabel()} clickable={false} />
      {guesses.map((g) => (
        <Marker
          key={g.userId}
          position={{ lat: g.lat, lng: g.lng }}
          icon={guessIcon(g.avatar, g.userId)}
          label={nameLabel(g.name)}
          clickable={false}
          title={g.name}
        />
      ))}
      <FitToAll answer={answer} guesses={guesses} />
    </Map>
  )
}
