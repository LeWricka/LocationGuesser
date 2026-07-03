import { useEffect, useRef, useState } from 'react'
import { Mic, RotateCcw, Square, Trash2 } from 'lucide-react'
import { AudioPlayer, Icon, useToast } from '../../ui'
import { track } from '../../lib/analytics'
import styles from './VoiceRecorder.module.css'

/**
 * Estado de la nota de voz del formulario, propiedad del PADRE (AddMoment /
 * MomentSheet vía EditMomentForm) — este componente es controlado, igual que
 * `MomentGalleryPicker` con sus fotos:
 *  - `none`:     sin nota de voz.
 *  - `existing`: nota YA guardada en Storage (edición); solo la URL firmada
 *                para reproducirla. Al guardar, si sigue en este estado, NO se
 *                toca `audio_path` (undefined = sin cambios).
 *  - `draft`:    grabación NUEVA, pendiente de subir al guardar el momento.
 */
export type VoiceValue =
  | { kind: 'none' }
  | { kind: 'existing'; url: string }
  | { kind: 'draft'; blob: Blob; mimeType: string; url: string }

interface Props {
  value: VoiceValue
  onChange: (value: VoiceValue) => void
  disabled?: boolean
}

// Tope de grabación (issue #648): a los 60s, auto-stop.
const MAX_SECONDS = 60

// mimeType que soporte el navegador, en orden de preferencia: opus/webm
// (Chrome/Firefox) primero, mp4/aac (Safari) como fallback. Sin soporte de
// `isTypeSupported` (o ninguno de los candidatos), se deja sin especificar y
// el propio `MediaRecorder` decide (su `.mimeType` tras `start()` dice cuál usó).
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac']

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined
  }
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type))
}

function formatElapsed(seconds: number): string {
  const mm = Math.floor(seconds / 60)
  const ss = seconds % 60
  return `${mm}:${String(ss).padStart(2, '0')}`
}

/**
 * Grabadora de nota de voz (≤60s, issue #648): botón micro → grabando
 * (indicador + contador, auto-stop al tope) → preview con player + regrabar/
 * descartar. El permiso del micro se pide SOLO al pulsar "Grabar" (patrón GPS
 * #599, `AddMoment.useGps`) — nunca por adelantado.
 *
 * Vive en `features/create` (no en `ui`) porque habla con la API del
 * navegador (MediaRecorder/getUserMedia) y con el toast de error — como
 * `MapPicker`, que EditMomentForm importa igual desde aquí para reutilizarlo
 * en la edición de un recuerdo ya existente (mismo criterio: el WIDGET de
 * "crear/editar" vive junto al asistente que lo estrenó, y se reimporta desde
 * `features/trip` cuando hace falta). El PLAYER de solo-reproducción sí es
 * genérico y puramente presentacional → ese vive en `ui/AudioPlayer`.
 */
export function VoiceRecorder({ value, onChange, disabled = false }: Props) {
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  // El contador también vive en un ref: `recorder.onstop` (closure fijada al
  // arrancar la grabación) necesita el valor FINAL para la analítica, y el
  // `elapsed` de state capturado en esa closure quedaría congelado en 0.
  const elapsedRef = useRef(0)
  const toast = useToast()

  function stopTimer() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  // Limpieza al desmontar: corta la grabación en curso y libera el micro (no
  // dejarlo "escuchando" tras salir del formulario).
  useEffect(() => {
    return () => {
      stopTimer()
      recorderRef.current?.stop()
      streamRef.current?.getTracks().forEach((mediaTrack) => mediaTrack.stop())
    }
  }, [])

  // Arranca la grabación: el permiso del micro se pide AQUÍ, solo al pulsar
  // (patrón GPS #599) — nunca por adelantado ni al montar el formulario.
  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.show('Tu navegador no permite grabar audio.', { tone: 'danger' })
      return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      const denied = err instanceof DOMException && err.name === 'NotAllowedError'
      toast.show(
        denied
          ? 'Diste «no» al permiso del micrófono. Actívalo en el navegador para grabar.'
          : 'No se pudo acceder al micrófono.',
        { tone: 'danger' },
      )
      return
    }
    streamRef.current = stream
    const mimeType = pickMimeType()
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    chunksRef.current = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      stream.getTracks().forEach((mediaTrack) => mediaTrack.stop())
      streamRef.current = null
      // `.mimeType` es el que de VERDAD grabó el navegador (puede diferir del
      // pedido, o venir sin especificar si `pickMimeType` no encontró soporte).
      const finalMime = recorder.mimeType || mimeType || 'audio/webm'
      const blob = new Blob(chunksRef.current, { type: finalMime })
      const url = URL.createObjectURL(blob)
      onChange({ kind: 'draft', blob, mimeType: finalMime, url })
      track('voice_note_recorded', { duration_seconds: elapsedRef.current })
    }
    recorderRef.current = recorder
    setElapsed(0)
    elapsedRef.current = 0
    recorder.start()
    setRecording(true)
    timerRef.current = window.setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1
        elapsedRef.current = next
        if (next >= MAX_SECONDS) stopRecording()
        return next
      })
    }, 1000)
  }

  function stopRecording() {
    stopTimer()
    setRecording(false)
    recorderRef.current?.stop()
    recorderRef.current = null
  }

  function releaseDraftUrl() {
    if (value.kind === 'draft') URL.revokeObjectURL(value.url)
  }

  function discard() {
    releaseDraftUrl()
    onChange({ kind: 'none' })
  }

  function reRecord() {
    releaseDraftUrl()
    void startRecording()
  }

  if (recording) {
    return (
      <div className={styles.recording}>
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.timer}>{formatElapsed(elapsed)}</span>
        <span className={styles.hint}>Grabando… máx. 1 min</span>
        <button
          type="button"
          className={styles.stopBtn}
          onClick={stopRecording}
          aria-label="Detener grabación"
        >
          <Icon icon={Square} size={14} />
        </button>
      </div>
    )
  }

  if (value.kind === 'none') {
    return (
      <button
        type="button"
        className={styles.startBtn}
        disabled={disabled}
        onClick={() => void startRecording()}
      >
        <Icon icon={Mic} size={18} /> Grabar nota de voz
      </button>
    )
  }

  // 'existing' o 'draft': ya hay algo grabado que reproducir.
  return (
    <div className={styles.preview}>
      <AudioPlayer src={value.url} label="nota de voz" className={styles.previewPlayer} />
      <div className={styles.previewActions}>
        <button
          type="button"
          className={styles.previewAction}
          disabled={disabled}
          onClick={reRecord}
        >
          <Icon icon={RotateCcw} size={14} /> Regrabar
        </button>
        <button
          type="button"
          className={[styles.previewAction, styles.danger].join(' ')}
          disabled={disabled}
          onClick={discard}
        >
          <Icon icon={Trash2} size={14} /> Descartar
        </button>
      </div>
    </div>
  )
}
