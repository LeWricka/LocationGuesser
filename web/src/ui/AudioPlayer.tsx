import { useEffect, useRef, useState, type ChangeEvent, type SyntheticEvent } from 'react'
import { Pause, Play } from 'lucide-react'
import { Icon } from './Icon'
import styles from './AudioPlayer.module.css'

interface Props {
  /** URL a reproducir: firmada (bucket privado) o un object URL local de preview. */
  src: string
  /** Etiqueta accesible del control (p.ej. "nota de voz"), en minúscula. */
  label?: string
  /** Se dispara la PRIMERA vez que arranca la reproducción (no en cada resume/loop). */
  onPlay?: () => void
  className?: string
}

// `0:00`/`1:05`. Duración no finita (NaN/Infinity, p.ej. metadata aún sin
// resolver de un blob de MediaRecorder recién grabado) se trata como "0" en
// vez de imprimir "NaN:NaN" o "Infinity:NaN".
function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  const mm = Math.floor(safe / 60)
  const ss = Math.floor(safe % 60)
  return `${mm}:${String(ss).padStart(2, '0')}`
}

/**
 * Reproductor de audio MÍNIMO (nota de voz, issue #648): botón play/pausa +
 * barra de progreso + duración, con tokens del kit — nada de waveform. El
 * `<audio>` nativo (oculto) hace el trabajo real (decodificación, fade/tacto
 * del sistema); esto es solo el chrome visual encima, controlado por React.
 * Puramente presentacional: no sabe de Storage ni de challenges — recibe una
 * URL ya resuelta. Reutilizado por `VoiceRecorder` (preview de la grabación,
 * `features/create`) y `MomentSheet` (nota de voz ya guardada, vista).
 */
export function AudioPlayer({ src, label = 'nota de voz', onPlay, className }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  // Solo la PRIMERA reproducción cuenta para `onPlay` (analítica): pausar y
  // volver a darle no debe disparar el evento de nuevo.
  const firedOnPlay = useRef(false)

  // Fuente nueva (p.ej. tras regrabar en el preview): vuelve a cero, no
  // arrastra el progreso/duración de la nota anterior.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset síncrono al cambiar de `src`, no un derivado de otro estado
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    firedOnPlay.current = false
  }, [src])

  function readDuration(e: SyntheticEvent<HTMLAudioElement>) {
    const d = e.currentTarget.duration
    if (Number.isFinite(d)) setDuration(d)
  }

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      return
    }
    if (!firedOnPlay.current) {
      firedOnPlay.current = true
      onPlay?.()
    }
    void audio.play()
  }

  function seek(e: ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current
    const value = Number(e.target.value)
    if (audio) audio.currentTime = value
    setCurrentTime(value)
  }

  const lowerLabel = label.toLowerCase()

  return (
    <div className={[styles.player, className].filter(Boolean).join(' ')}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={readDuration}
        // Chrome reporta `duration = Infinity` en metadata para algunos blobs
        // de MediaRecorder hasta que el propio playback la recalcula: este
        // evento recoge esa corrección tardía sin necesitar un hack de seek.
        onDurationChange={readDuration}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
      />
      <button
        type="button"
        className={styles.toggle}
        onClick={togglePlay}
        aria-label={playing ? `Pausar ${lowerLabel}` : `Reproducir ${lowerLabel}`}
      >
        <Icon icon={playing ? Pause : Play} size={16} />
      </button>
      <input
        type="range"
        className={styles.progress}
        min={0}
        max={duration}
        step={0.1}
        value={Math.min(currentTime, duration)}
        onChange={seek}
        aria-label={`Progreso de ${lowerLabel}`}
      />
      <span className={styles.time}>
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
    </div>
  )
}
