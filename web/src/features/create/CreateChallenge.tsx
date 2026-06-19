import { useState } from 'react'
import { MapPicker } from './MapPicker'
import type { LatLng } from '../../lib/geo'
import { createChallenge } from '../../lib/challenges'
import { getName, setName } from '../../lib/identity'
import { Badge, Button, Card, Field, Input, Row, Stack, useToast } from '../../ui'
import styles from './CreateChallenge.module.css'

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
  const toast = useToast()

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
    if (!link) return
    void navigator.clipboard.writeText(link)
    toast.show('Enlace copiado', { tone: 'success' })
  }

  return (
    <main className="lg-page">
      <Stack gap={4}>
        <Row gap={3} className={styles.header}>
          <Button variant="ghost" size="sm" onClick={onBack}>
            ← Volver
          </Button>
          <h1 className={styles.title}>Crear un reto</h1>
        </Row>

        <Row gap={2}>
          <Button variant="secondary" onClick={useGps}>
            📡 Mi ubicación
          </Button>
          <Input
            className={styles.searchInput}
            placeholder="Buscar un lugar…"
            aria-label="Buscar un lugar"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void runSearch()
              }
            }}
          />
        </Row>

        <MapPicker value={point} flyTo={flyTo} center={SPAIN} zoom={5} onPick={setPoint} />

        {point && (
          <Row gap={2}>
            <Badge tone="accent">📍 Punto marcado</Badge>
            <span className={styles.coords}>
              {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
            </span>
          </Row>
        )}

        <Field
          label="Título del reto"
          hint="Opcional. Si lo dejas vacío usamos «¿Dónde estoy? 🌍»."
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              placeholder="¿Dónde estoy? 🌍"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
        </Field>

        <Button
          size="lg"
          fullWidth
          loading={busy}
          disabled={!point}
          onClick={() => void generate()}
        >
          Generar enlace
        </Button>

        {status && <p className={styles.status}>{status}</p>}

        {link && (
          <Card padding="md" raised>
            <Stack gap={3}>
              <strong>¡Reto creado! Comparte este enlace:</strong>
              <Input
                className={styles.linkInput}
                readOnly
                value={link}
                aria-label="Enlace del reto"
                onFocus={(e) => e.target.select()}
              />
              <Button variant="secondary" onClick={copy}>
                Copiar enlace
              </Button>
            </Stack>
          </Card>
        )}
      </Stack>
    </main>
  )
}
