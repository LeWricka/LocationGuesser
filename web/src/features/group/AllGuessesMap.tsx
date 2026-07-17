/// <reference types="google.maps" />
import { useEffect } from 'react'
import { Map, Marker, Polyline, useMap } from '@vis.gl/react-google-maps'
import type { LatLng } from '../../lib/geo'
import { avatarPinFromProfile, targetPinSvg, PIN_SIZE, PIN_ANCHOR } from '../../lib/avatarPin'

// Vista por defecto (el MUNDO) hasta que fitBounds encuadra los puntos.
const WORLD: google.maps.LatLngLiteral = { lat: 25, lng: 0 }
const WORLD_ZOOM = 2

export interface GuessMarker extends LatLng {
  userId: string
  name: string
  /** `avatar_url` del perfil (token `emoji:…`, URL o null) para el pin de disco. */
  avatar: string | null
  /** Puesto en el reto, 1-based (issue #811): el MISMO orden que la tabla
   * (`ChallengeBoard`, vía `rankByUserId` — no un criterio propio recalculado
   * aquí). Pinta el badge del pin (oro/plata/bronce/neutro). */
  rank: number
}

interface Props {
  answer: LatLng
  guesses: GuessMarker[]
  /** Id del jugador que está mirando el resultado (issue #795): resalta su
   * propio pin (anillo teal profundo) y su línea a la respuesta (issue #811:
   * accent, más gruesa). Sin esto (mapa de un histórico ajeno, p.ej.) ningún
   * pin ni línea se resalta. */
  meUserId?: string
}

// Acento Pizarra de los tokens (no hardcodear color): Google Maps necesita un
// string literal para el trazo de la línea propia, así que leemos `--accent`
// del :root en runtime — mismo truco que `PlayMap.accentColor` (no exportado
// desde allí, así que se repite aquí; son 4 líneas, no justifica un módulo
// compartido solo para esto).
function accentColor(): string {
  if (typeof window === 'undefined') return '#34506b' // design-lint-allow: SSR/test, sin window
  const value = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  return value || '#34506b' // design-lint-allow: mismo fallback que PlayMap.accentColor
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
// del resto (issue #795). `rank` pinta el badge de puesto en la esquina
// sup-derecha (issue #811) — sustituye al nombre en texto bajo el pin, que
// amontonaba el mapa con muchos jugadores (issue #795: `visibleLabelUserIds`
// y su umbral de "top-3" quedan retirados, ya no hacen falta).
function guessIcon(
  avatar: string | null,
  userId: string,
  own: boolean,
  rank: number,
): google.maps.Icon {
  return {
    url: avatarPinFromProfile(avatar, userId, own, rank),
    scaledSize: new google.maps.Size(PIN_SIZE.width, PIN_SIZE.height),
    anchor: new google.maps.Point(PIN_ANCHOR.x, PIN_ANCHOR.y),
  }
}

// Grosor/opacidad de la línea de cada jugada a la respuesta (issue #811,
// petición del dueño: "que se vea de dónde venía cada tiro"). Con hasta ~10
// jugadores un trazo grueso u opaco por cada uno sería una tela de araña, así
// que las AJENAS van finas y muy translúcidas; la PROPIA se destaca (accent,
// +1 de grosor, casi opaca) para seguir siendo fácil de distinguir del resto.
const OTHER_LINE_WEIGHT = 2
const OWN_LINE_WEIGHT = OTHER_LINE_WEIGHT + 1
const OTHER_LINE_OPACITY = 0.35
const OWN_LINE_OPACITY = 0.9
const OTHER_LINE_COLOR = '#ffffff' // design-lint-allow: la API de Google Maps exige color literal

function GuessLines({ answer, guesses, meUserId }: Props) {
  return (
    <>
      {guesses.map((g) => {
        const own = g.userId === meUserId
        const path = [
          { lat: g.lat, lng: g.lng },
          { lat: answer.lat, lng: answer.lng },
        ]
        return (
          <Polyline
            key={g.userId}
            path={path}
            strokeColor={own ? accentColor() : OTHER_LINE_COLOR}
            strokeWeight={own ? OWN_LINE_WEIGHT : OTHER_LINE_WEIGHT}
            strokeOpacity={own ? OWN_LINE_OPACITY : OTHER_LINE_OPACITY}
            clickable={false}
          />
        )
      })}
    </>
  )
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
 * disco de CADA jugador que votó con el badge de su PUESTO (issue #811 — ya
 * no el nombre en texto bajo el pin, que amontonaba el mapa con muchos
 * jugadores), una línea fina de cada jugada a la respuesta real (la propia
 * destacada) y la respuesta (diana destacada). Encuadra todos los puntos. Sin
 * AdvancedMarker → sin mapId.
 */
export function AllGuessesMap({ answer, guesses, meUserId }: Props) {
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
      <GuessLines answer={answer} guesses={guesses} meUserId={meUserId} />
      {guesses.map((g) => (
        <Marker
          key={g.userId}
          position={{ lat: g.lat, lng: g.lng }}
          icon={guessIcon(g.avatar, g.userId, g.userId === meUserId, g.rank)}
          clickable={false}
          title={g.name}
        />
      ))}
      <FitToAll answer={answer} guesses={guesses} meUserId={meUserId} />
    </Map>
  )
}
