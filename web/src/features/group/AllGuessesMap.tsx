/// <reference types="google.maps" />
import { useEffect } from 'react'
import { Map, Marker, useMap } from '@vis.gl/react-google-maps'
import type { LatLng } from '../../lib/geo'
import {
  avatarPinFromProfile,
  targetPinSvg,
  PIN_SIZE,
  PIN_ANCHOR,
  PIN_LABEL_ORIGIN,
} from '../../lib/avatarPin'

// Vista por defecto (el MUNDO) hasta que fitBounds encuadra los puntos.
const WORLD: google.maps.LatLngLiteral = { lat: 25, lng: 0 }
const WORLD_ZOOM = 2

export interface GuessMarker extends LatLng {
  userId: string
  name: string
  /** `avatar_url` del perfil (token `emoji:…`, URL o null) para el pin de disco. */
  avatar: string | null
  /** Puntos obtenidos (issue #795): decide quién entra en el "top-3" cuando hay
   * demasiados jugadores para etiquetarlos a todos sin amontonarse. */
  points: number
}

interface Props {
  answer: LatLng
  guesses: GuessMarker[]
  /** Id del jugador que está mirando el resultado (issue #795): resalta su
   * propio pin (anillo teal profundo) y le garantiza el label aunque no esté
   * entre los primeros. Sin esto (mapa de un histórico ajeno, p.ej.) ningún pin
   * se resalta y el criterio de labels cae solo al top-3. */
  meUserId?: string
}

// Icono de la respuesta (diana): mismo tamaño/ancla que los pines de avatar
// para que encajen en el mismo mapa (issue #794, "una sola fábrica").
function answerIcon(): google.maps.Icon {
  return {
    url: targetPinSvg(),
    scaledSize: new google.maps.Size(PIN_SIZE.width, PIN_SIZE.height),
    anchor: new google.maps.Point(PIN_ANCHOR.x, PIN_ANCHOR.y),
  }
}

// Icono del pin de un jugador. `own` resalta el PROPIO pin (anillo teal
// profundo en vez de blanco) para encontrarse un vistazo más rápido entre los
// del resto (issue #795). El nombre va como label bajo la punta (PIN_LABEL_ORIGIN).
function guessIcon(avatar: string | null, userId: string, own: boolean): google.maps.Icon {
  return {
    url: avatarPinFromProfile(avatar, userId, own),
    scaledSize: new google.maps.Size(PIN_SIZE.width, PIN_SIZE.height),
    anchor: new google.maps.Point(PIN_ANCHOR.x, PIN_ANCHOR.y),
    labelOrigin: new google.maps.Point(PIN_LABEL_ORIGIN.x, PIN_LABEL_ORIGIN.y),
  }
}

function nameLabel(name: string): google.maps.MarkerLabel {
  return { text: name, fontSize: '12px', fontWeight: '600' }
}

// Label del pin, o undefined si no le toca (criterio de `visibleLabelUserIds`).
// El propio jugador lleva el sufijo "(tú)": con el mismo nombre que ve el resto
// del viaje, es la forma más rápida de encontrarse entre varios pines.
function labelFor(
  g: GuessMarker,
  labeled: Set<string>,
  meUserId?: string,
): google.maps.MarkerLabel | undefined {
  if (!labeled.has(g.userId)) return undefined
  return nameLabel(g.userId === meUserId ? `${g.name} (tú)` : g.name)
}

// Con pocos jugadores, un label bajo cada pin se lee bien. A partir de este
// umbral (issue #795: "legibilidad con muchos pines cercanos") etiquetar a
// TODOS amontona el mapa —los nombres se solapan y no se entiende nada a un
// vistazo—, así que el criterio pasa a ser visual-first: solo lo importante.
const LABEL_CROWD_THRESHOLD = 5
// Con el mapa lleno, cuántos de los mejores puestos conservan su label (además
// del propio jugador, que SIEMPRE la lleva: es lo primero que busca).
const LABEL_TOP_N = 3

/**
 * Decide qué jugadores conservan el nombre bajo el pin (issue #795). Con pocos
 * jugadores (`< LABEL_CROWD_THRESHOLD`) todos llevan label: no hay amontonamiento
 * que evitar. Con más, solo el TOP-3 por puntos + el propio jugador (si no
 * estuviera ya entre ellos) — el resto de pines se ven igual (disco + nombre al
 * tocar/`title`), pero sin el texto fijo que saturaría el mapa.
 */
// Función pura exportada junto al componente para testearla aislada
// (AllGuessesMap.test.tsx); no vale la pena un fichero aparte para esta única
// función de ~10 líneas.
// eslint-disable-next-line react-refresh/only-export-components
export function visibleLabelUserIds(guesses: GuessMarker[], meUserId?: string): Set<string> {
  if (guesses.length < LABEL_CROWD_THRESHOLD) return new Set(guesses.map((g) => g.userId))
  const top = [...guesses]
    .sort((a, b) => b.points - a.points)
    .slice(0, LABEL_TOP_N)
    .map((g) => g.userId)
  const ids = new Set(top)
  if (meUserId) ids.add(meUserId)
  return ids
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
 * Mapa resumen de un reto cerrado (Google Maps, mismo motor que PlayMap): el
 * disco de CADA jugador que votó (con su nombre como label, según
 * `visibleLabelUserIds`) y la respuesta real (diana destacada). Encuadra todos
 * los puntos. Sin AdvancedMarker → sin mapId.
 */
export function AllGuessesMap({ answer, guesses, meUserId }: Props) {
  const labeled = visibleLabelUserIds(guesses, meUserId)
  return (
    <Map
      className="lg-map"
      defaultCenter={WORLD}
      defaultZoom={WORLD_ZOOM}
      minZoom={2}
      // Satélite con etiquetas (issue #794, "revisa el resto de defaults"):
      // mismo lienzo que el revelado de PlayMap (`locked` → hybrid), para que
      // el resultado se vea igual pase por el mapa que pase.
      mapTypeId="hybrid"
      colorScheme="LIGHT"
      gestureHandling="greedy"
      disableDefaultUI
      // Sin zoomControl (issue #794, AllGuessesMap.tsx:99): el pellizco basta
      // en móvil y el control de serie de Google (cuadrado gris con +/-) rompe
      // el lenguaje visual de la app — no hay ningún otro mapa de la app que lo
      // lleve (PlayMap en revelado tampoco, MomentMiniMap ya lo lleva a false).
      clickableIcons={false}
    >
      <Marker position={answer} icon={answerIcon()} clickable={false} />
      {guesses.map((g) => (
        <Marker
          key={g.userId}
          position={{ lat: g.lat, lng: g.lng }}
          icon={guessIcon(g.avatar, g.userId, g.userId === meUserId)}
          label={labelFor(g, labeled, meUserId)}
          clickable={false}
          title={g.name}
        />
      ))}
      <FitToAll answer={answer} guesses={guesses} />
    </Map>
  )
}
