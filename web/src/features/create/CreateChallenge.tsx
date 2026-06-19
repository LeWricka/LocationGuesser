import { useState } from 'react'
import { MapPicker } from './MapPicker'
import type { LatLng } from '../../lib/geo'
import { createChallenge } from '../../lib/challenges'
import { getName, setName } from '../../lib/identity'

interface Props {
  onBack: () => void
}

const SPAIN: LatLng = { lat: 40.4, lng: -3.7 }

interface NominatimHit {
  lat: string
  lon: string
}

export function CreateChallenge({ onBack }: Props) {
  const [title, setTitle] = useState('')
  const [point, setPoint] = useState<LatLng | null>(null)
  const [flyTo, setFlyTo] = useState<LatLng | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function useGps() {
    if (!navigator.geolocation) {
      setStatus('Tu navegador no permite geolocalización.')
      return
    }
    setStatus('Buscando tu ubicación…')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setPoint(p)
        setFlyTo(p)
        setStatus(null)
      },
      () => setStatus('No se pudo obtener tu ubicación. Toca el mapa.'),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  async function runSearch() {
    const q = search.trim()
    if (!q) return
    setStatus('Buscando…')
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
      )
      const data = (await res.json()) as NominatimHit[]
      if (data[0]) {
        const p = { lat: Number(data[0].lat), lng: Number(data[0].lon) }
        setPoint(p)
        setFlyTo(p)
        setStatus(null)
      } else {
        setStatus('No encontrado. Toca el mapa.')
      }
    } catch {
      setStatus('No se pudo buscar. Toca el mapa.')
    }
  }

  async function generate() {
    if (!point) {
      setStatus('Marca primero el punto en el mapa.')
      return
    }
    let name = getName()
    if (!name) {
      name = window.prompt('¿Tu nombre? (para firmar el reto)')?.trim() ?? ''
      if (!name) return
      setName(name)
    }
    setBusy(true)
    setStatus('Guardando…')
    try {
      const { challenge, groupId } = await createChallenge({
        title: title.trim() || '¿Dónde estoy? 🌍',
        lat: point.lat,
        lng: point.lng,
        createdBy: name,
      })
      setLink(`${location.origin}${location.pathname}#g=${groupId}&c=${challenge.id}`)
      setStatus(null)
    } catch (err) {
      setStatus(`Error al guardar: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  function copy() {
    if (link) void navigator.clipboard.writeText(link)
  }

  return (
    <main className="app">
      <header className="row">
        <button type="button" className="btn ghost" onClick={onBack}>
          ← Volver
        </button>
        <h2>Crear un reto</h2>
      </header>

      <div className="toolbar">
        <button type="button" className="btn" onClick={useGps}>
          📡 Mi ubicación
        </button>
        <input
          className="input"
          placeholder="Buscar un lugar…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void runSearch()
            }
          }}
        />
      </div>

      <MapPicker value={point} flyTo={flyTo} center={SPAIN} zoom={5} onPick={setPoint} />

      {point && (
        <p className="muted small">
          📍 {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
        </p>
      )}

      <input
        className="input"
        placeholder="Título del reto (opcional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <button
        type="button"
        className="btn primary"
        disabled={!point || busy}
        onClick={() => void generate()}
      >
        Generar enlace
      </button>

      {status && <p className="status">{status}</p>}

      {link && (
        <div className="result">
          <p className="muted small">¡Reto creado! Comparte este enlace:</p>
          <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} />
          <button type="button" className="btn" onClick={copy}>
            Copiar enlace
          </button>
        </div>
      )}
    </main>
  )
}
