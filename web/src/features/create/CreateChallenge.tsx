import { useEffect, useState } from 'react'
import { MapPicker } from './MapPicker'
import { StreetViewPreview } from './StreetViewPreview'
import type { LatLng } from '../../lib/geo'
import { createChallenge } from '../../lib/challenges'
import { findPanorama, type PanoramaMatch } from '../../lib/streetview'
import { newGroupCode } from '../../lib/group'
import { resolveMapsUrl } from '../../lib/mapsUrl'
import { supabase } from '../../lib/supabase'
import { useIdentity } from '../identity'
import { Badge, Button, Card, Field, Input, Row, Spinner, Stack, useToast } from '../../ui'
import styles from './CreateChallenge.module.css'

interface Props {
  onBack: () => void
}

const SPAIN: LatLng = { lat: 40.4, lng: -3.7 }

interface NominatimHit {
  lat: string
  lon: string
  display_name: string
}

// Plazo del reto: presets relativos al momento de crear. "Fin del día" =
// medianoche del creador, congelada como timestamp absoluto.
type DeadlinePreset = '1h' | '4h' | 'eod'

const DEADLINE_OPTIONS: { value: DeadlinePreset; label: string }[] = [
  { value: '1h', label: '1 hora' },
  { value: '4h', label: '4 horas' },
  { value: 'eod', label: 'Fin del día' },
]

function deadlineISO(preset: DeadlinePreset): string {
  const d = new Date()
  if (preset === '1h') d.setHours(d.getHours() + 1)
  else if (preset === '4h') d.setHours(d.getHours() + 4)
  else d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

// Tiempo por jugada en segundos; null = sin límite.
const GUESS_OPTIONS: { value: number | null; label: string }[] = [
  { value: 60, label: '1 min' },
  { value: 120, label: '2 min' },
  { value: 180, label: '3 min' },
  { value: null, label: 'Sin límite' },
]

export function CreateChallenge({ onBack }: Props) {
  const [title, setTitle] = useState('')
  const [point, setPoint] = useState<LatLng | null>(null)
  const [flyTo, setFlyTo] = useState<LatLng | null>(null)
  const [search, setSearch] = useState('')
  const [suggestions, setSuggestions] = useState<NominatimHit[]>([])
  const [searching, setSearching] = useState(false)
  const [mapsLink, setMapsLink] = useState('')
  const [resolving, setResolving] = useState(false)
  const [locating, setLocating] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Panorama encajado al punto elegido (pivote #54): si es null no hay cobertura
  // de Street View y no dejamos crear el reto.
  const [pano, setPano] = useState<PanoramaMatch | null>(null)
  const [checkingPano, setCheckingPano] = useState(false)
  // POV con el que arrancarán los jugadores; el creador puede girar la previa.
  const [pov, setPov] = useState({ heading: 0, pitch: 0 })
  const [deadline, setDeadline] = useState<DeadlinePreset>('eod')
  const [guessSeconds, setGuessSeconds] = useState<number | null>(120)
  const toast = useToast()
  const { ensureIdentity, modal: identityModal } = useIdentity()

  // Al elegir el punto (por cualquier método) encajamos el panorama de Street
  // View más cercano. Sin cobertura → avisamos y bloqueamos la creación.
  useEffect(() => {
    if (!point) return
    let cancelled = false
    void (async () => {
      setCheckingPano(true)
      setPano(null)
      try {
        const match = await findPanorama(point.lat, point.lng)
        if (cancelled) return
        if (!match) {
          toast.show('No hay Street View aquí; elige otro punto.', { tone: 'danger' })
          return
        }
        setPano(match)
        setPov({ heading: 0, pitch: 0 })
      } finally {
        if (!cancelled) setCheckingPano(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // toast es estable (contexto); solo reaccionamos al punto elegido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point])

  // Autocompletado Nominatim con debounce; respeta su uso (300ms, solo > 2 car).
  // `searching` enciende el spinner del buscador para que el usuario vea que pasa algo.
  useEffect(() => {
    const q = search.trim()
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      if (q.length < 3) {
        setSuggestions([])
        setSearching(false)
        return
      }
      setSearching(true)
      void (async () => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`,
            { signal: ctrl.signal },
          )
          const data = (await res.json()) as NominatimHit[]
          setSuggestions(data)
        } catch {
          // Búsqueda fallida o abortada: silenciamos; el mapa sigue disponible.
        } finally {
          setSearching(false)
        }
      })()
    }, 300)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [search])

  function pickSuggestion(hit: NominatimHit) {
    const p = { lat: Number(hit.lat), lng: Number(hit.lon) }
    setPoint(p)
    setFlyTo(p)
    setSearch(hit.display_name)
    setSuggestions([])
    setStatus(null)
  }

  // Pegar enlace de Maps: el parser local resuelve URLs largas y coordenadas al
  // instante; los enlaces cortos (botón Compartir de Maps en móvil) pasan por la
  // Edge Function, de ahí el spinner. `resolveMapsUrl` ya distingue ambos casos.
  async function resolveLink(raw: string) {
    const value = raw.trim()
    if (!value) return
    setResolving(true)
    try {
      const p = await resolveMapsUrl(value)
      if (!p) {
        toast.show('No pude leer ese enlace; usa el mapa, GPS o búsqueda.', { tone: 'danger' })
        return
      }
      setPoint(p)
      setFlyTo(p)
      setStatus(null)
      setMapsLink('')
    } finally {
      setResolving(false)
    }
  }

  function useGps() {
    if (!navigator.geolocation) {
      toast.show('Tu navegador no permite geolocalización.', { tone: 'danger' })
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setFlyTo({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocating(false)
      },
      () => {
        setLocating(false)
        toast.show('No se pudo obtener tu ubicación. Toca el mapa.', { tone: 'danger' })
      },
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  async function generate() {
    if (!pano) {
      toast.show('Elige un punto con cobertura de Street View.', { tone: 'danger' })
      return
    }

    setBusy(true)
    try {
      // El grupo ("el viaje") nace aquí: necesitamos su fila para registrar al
      // jugador (FK players→groups) antes de identificar a quien crea el reto.
      setStatus('Creando el grupo…')
      const groupId = newGroupCode()
      const { error: groupError } = await supabase.from('groups').insert({ id: groupId })
      if (groupError) throw new Error(groupError.message)

      // Identidad sin login: con identidad global no pide nada; navegador limpio
      // → modal con nombre + PIN. Devuelve null si el usuario cancela.
      setStatus(null)
      const name = await ensureIdentity(groupId)
      if (!name) {
        setBusy(false)
        return
      }

      setStatus('Guardando el reto…')
      // Guardamos la lat/lng encajada al panorama (la respuesta real para el
      // scoring) y el panorama exacto + POV inicial.
      const { challenge } = await createChallenge({
        title: title.trim() || '¿Dónde estoy? 🌍',
        lat: pano.lat,
        lng: pano.lng,
        createdBy: name,
        groupId,
        svPanoId: pano.panoId,
        svHeading: pov.heading,
        svPitch: pov.pitch,
        deadlineAt: deadlineISO(deadline),
        guessSeconds,
      })
      setLink(`${location.origin}${location.pathname}#g=${groupId}&c=${challenge.id}`)
      setStatus(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setStatus(null)
      // "Failed to fetch" suele ser la red/navegador del usuario bloqueando la
      // conexión (VPN, DNS privado, bloqueador, ahorro de datos), no la app.
      const networkish = /failed to fetch|networkerror|load failed/i.test(msg)
      toast.show(
        networkish
          ? 'Sin conexión con el servidor. Prueba con datos en vez de WiFi (o al revés) y desactiva VPN, DNS privado o bloqueador; luego reinténtalo.'
          : `No se pudo crear el reto: ${msg}`,
        { tone: 'danger' },
      )
    } finally {
      setBusy(false)
    }
  }

  // Texto listo para pegar en el chat del grupo (#8): gancho + enlace.
  const shareText = link ? `🌍 ¿Dónde estoy? Adivina en el mapa: ${link}` : ''

  function copy() {
    if (!link) return
    void navigator.clipboard.writeText(shareText)
    toast.show('Texto copiado, pégalo en el grupo', { tone: 'success' })
  }

  async function share() {
    if (!link) return
    // Web Share API (móvil): abre la hoja nativa para mandarlo al chat. Si el
    // usuario cancela, no es error. Sin soporte → copiamos como respaldo.
    if (navigator.share) {
      try {
        await navigator.share({ title: '¿Dónde estoy? 🌍', text: shareText })
        return
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
      }
    }
    copy()
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

        <p className={styles.intro}>
          Elige un punto con cobertura de Street View. Los demás explorarán el panorama y adivinarán
          dónde es.
        </p>

        <div className={styles.searchWrap}>
          <Row gap={2}>
            <Button variant="secondary" loading={locating} onClick={useGps}>
              📡 Mi ubicación
            </Button>
            <div className={styles.searchField}>
              <Input
                className={styles.searchInput}
                placeholder="Buscar un lugar…"
                aria-label="Buscar un lugar"
                autoComplete="off"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {searching && (
                <span className={styles.searchSpinner}>
                  <Spinner size={16} label="Buscando" />
                </span>
              )}
            </div>
          </Row>
          {suggestions.length > 0 && (
            <ul className={styles.suggestions}>
              {suggestions.map((hit, i) => (
                <li key={`${hit.lat},${hit.lon},${i}`}>
                  <button
                    type="button"
                    className={styles.suggestion}
                    onClick={() => pickSuggestion(hit)}
                  >
                    {hit.display_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Field
          label="Pega un enlace de Google Maps"
          hint="Funciona con el botón «Compartir» de Maps o con coordenadas."
        >
          {(fieldProps) => (
            <Row gap={2}>
              <div className={styles.searchField}>
                <Input
                  {...fieldProps}
                  className={styles.searchInput}
                  placeholder="https://maps.app.goo.gl/… o 40.4,-3.7"
                  autoComplete="off"
                  value={mapsLink}
                  onChange={(e) => setMapsLink(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void resolveLink(mapsLink)
                    }
                  }}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData('text')
                    if (text) void resolveLink(text)
                  }}
                />
                {resolving && (
                  <span className={styles.searchSpinner}>
                    <Spinner size={16} label="Resolviendo enlace" />
                  </span>
                )}
              </div>
              <Button
                variant="secondary"
                loading={resolving}
                disabled={!mapsLink.trim()}
                onClick={() => void resolveLink(mapsLink)}
              >
                Usar enlace
              </Button>
            </Row>
          )}
        </Field>

        <MapPicker value={point} flyTo={flyTo} center={SPAIN} zoom={5} onPick={setPoint} />

        {point && (
          <Row gap={2}>
            <Badge tone="accent">📍 Punto marcado</Badge>
            <span className={styles.coords}>
              {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
            </span>
          </Row>
        )}

        {checkingPano && (
          <Row gap={2} className={styles.status}>
            <Spinner size={16} />
            <span>Buscando Street View…</span>
          </Row>
        )}

        {pano && (
          <Field label="Vista previa" hint="Gira la cámara para fijar cómo arrancarán los demás.">
            {() => (
              <StreetViewPreview
                panoId={pano.panoId}
                heading={pov.heading}
                pitch={pov.pitch}
                onPovChange={setPov}
              />
            )}
          </Field>
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

        <Field label="Plazo para contestar">
          {() => (
            <Row gap={2} wrap>
              {DEADLINE_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  variant={deadline === opt.value ? 'primary' : 'secondary'}
                  size="sm"
                  aria-pressed={deadline === opt.value}
                  onClick={() => setDeadline(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </Row>
          )}
        </Field>

        <Field label="Tiempo por jugada">
          {() => (
            <Row gap={2} wrap>
              {GUESS_OPTIONS.map((opt) => (
                <Button
                  key={opt.label}
                  variant={guessSeconds === opt.value ? 'primary' : 'secondary'}
                  size="sm"
                  aria-pressed={guessSeconds === opt.value}
                  onClick={() => setGuessSeconds(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </Row>
          )}
        </Field>

        <Button
          size="lg"
          fullWidth
          loading={busy}
          disabled={!pano || checkingPano}
          onClick={() => void generate()}
        >
          Generar enlace
        </Button>

        {status && (
          <Row gap={2} className={styles.status}>
            <Spinner size={16} />
            <span>{status}</span>
          </Row>
        )}

        {link && (
          <Card padding="md" raised>
            <Stack gap={3}>
              <strong>¡Reto creado! Compártelo en el grupo:</strong>
              <Input
                className={styles.linkInput}
                readOnly
                value={shareText}
                aria-label="Mensaje para compartir el reto"
                onFocus={(e) => e.target.select()}
              />
              <Row gap={2}>
                {typeof navigator !== 'undefined' && 'share' in navigator && (
                  <Button onClick={() => void share()}>Compartir</Button>
                )}
                <Button variant="secondary" onClick={copy}>
                  Copiar
                </Button>
              </Row>
            </Stack>
          </Card>
        )}
      </Stack>

      {identityModal}
    </main>
  )
}
