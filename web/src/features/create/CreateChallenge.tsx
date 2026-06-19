import { useEffect, useMemo, useRef, useState } from 'react'
import { MapPicker } from './MapPicker'
import type { LatLng } from '../../lib/geo'
import { createChallenge } from '../../lib/challenges'
import { newGroupCode } from '../../lib/group'
import { supabase } from '../../lib/supabase'
import { uploadImage } from '../../lib/storage'
import { useIdentity } from '../identity'
import { Badge, Button, Card, Field, Input, Row, Stack, useToast } from '../../ui'
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
  const [status, setStatus] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [deadline, setDeadline] = useState<DeadlinePreset>('eod')
  const [guessSeconds, setGuessSeconds] = useState<number | null>(120)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const { ensureIdentity, modal: identityModal } = useIdentity()

  // Vista previa local derivada del archivo; el efecto solo revoca el URL al
  // cambiar/desmontar (no hace falta estado).
  const imagePreview = useMemo(
    () => (imageFile ? URL.createObjectURL(imageFile) : null),
    [imageFile],
  )
  useEffect(() => {
    if (!imagePreview) return
    return () => URL.revokeObjectURL(imagePreview)
  }, [imagePreview])

  // Autocompletado Nominatim con debounce; respeta su uso (300ms, solo > 2 car).
  useEffect(() => {
    const q = search.trim()
    const ctrl = new AbortController()
    // El clear/fetch va dentro del timer: nada de setState síncrono en el efecto.
    const timer = setTimeout(() => {
      if (q.length < 3) {
        setSuggestions([])
        return
      }
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

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    if (file && !file.type.startsWith('image/')) {
      setStatus('Elige un archivo de imagen.')
      return
    }
    setImageFile(file)
    setStatus(null)
  }

  async function generate() {
    if (!point) {
      setStatus('Marca primero el punto en el mapa.')
      return
    }
    if (!imageFile) {
      setStatus('Añade una foto del reto.')
      return
    }
    // El grupo ("el viaje") nace aquí: necesitamos su fila para registrar al
    // jugador (FK players→groups) antes de identificar a quien crea el reto.
    const groupId = newGroupCode()
    const { error: groupError } = await supabase.from('groups').insert({ id: groupId })
    if (groupError) {
      setStatus(`Error al crear el grupo: ${groupError.message}`)
      return
    }

    // Identidad sin login: con identidad global no pide nada; navegador limpio
    // → modal con nombre + PIN. Devuelve null si el usuario cancela.
    const name = await ensureIdentity(groupId)
    if (!name) return

    setBusy(true)
    setStatus('Subiendo foto…')
    try {
      const imagePath = await uploadImage(imageFile)
      setStatus('Guardando…')
      const { challenge } = await createChallenge({
        title: title.trim() || '¿Dónde estoy? 🌍',
        lat: point.lat,
        lng: point.lng,
        createdBy: name,
        groupId,
        imagePath,
        deadlineAt: deadlineISO(deadline),
        guessSeconds,
      })
      setLink(`${location.origin}${location.pathname}#g=${groupId}&c=${challenge.id}`)
      setStatus(null)
    } catch (err) {
      setStatus(`Error al guardar: ${err instanceof Error ? err.message : String(err)}`)
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

        <Field label="Foto del reto" hint="Obligatoria. La comprimimos y le quitamos el GPS.">
          {(fieldProps) => (
            <div {...fieldProps}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className={styles.fileInput}
                onChange={onPickFile}
              />
              {imagePreview ? (
                <div className={styles.preview}>
                  <img
                    src={imagePreview}
                    alt="Vista previa del reto"
                    className={styles.previewImg}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Cambiar foto
                  </Button>
                </div>
              ) : (
                <Button variant="secondary" fullWidth onClick={() => fileInputRef.current?.click()}>
                  📷 Añadir foto
                </Button>
              )}
            </div>
          )}
        </Field>

        <div className={styles.searchWrap}>
          <Row gap={2}>
            <Button variant="secondary" onClick={useGps}>
              📡 Mi ubicación
            </Button>
            <Input
              className={styles.searchInput}
              placeholder="Buscar un lugar…"
              aria-label="Buscar un lugar"
              autoComplete="off"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
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
          disabled={!point || !imageFile}
          onClick={() => void generate()}
        >
          Generar enlace
        </Button>

        {status && <p className={styles.status}>{status}</p>}

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
