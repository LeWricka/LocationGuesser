import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Hash } from 'lucide-react'
import { PhotoDropzone } from './PhotoDropzone'
import { ChallengeCreatedShare } from './ChallengeCreatedShare'
import { createNumberChallenge, type ChallengeForPlay } from '../../lib/challenges'
import { DEFAULT_NUMBER_TOLERANCE } from '../../lib/geo'
import { deadlineFromMinutes } from '../../lib/time'
import { uploadImage } from '../../lib/storage'
import { track } from '../../lib/analytics'
import { reportError } from '../../lib/observability'
import { describeError } from '../../lib/errors'
import { useSession } from '../../lib/session-context'
import {
  AppHeader,
  Button,
  Icon,
  SegmentedControl,
  Spinner,
  UnitInput,
  type Unit,
  useToast,
} from '../../ui'
import { ShellUtilitario } from '../../ui/shells'
import styles from './CreateNumberChallenge.module.css'

interface Props {
  /** Grupo (el viaje) al que se añade el reto. */
  groupId: string
  /** Nombre del viaje para el contexto del eyebrow. */
  groupName?: string | null
  /** Sale del flujo sin crear (vuelve al selector de tipo). */
  onBack: () => void
  /** Reto creado: el viaje vuelve a la lista y ofrece su enlace. */
  onCreated: (challenge: ChallengeForPlay) => void
}

// Plazo del reto (igual que el reto de lugar): duración relativa en minutos.
const DEADLINE_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 60, label: '1 h' },
  { minutes: 240, label: '4 h' },
  { minutes: 720, label: 'Hoy' },
  { minutes: 4320, label: '3 días' },
]
const DEFAULT_DEADLINE_INDEX = 1

// Tiempo por jugada en segundos; null = sin límite. El SegmentedControl maneja
// strings, así que indexamos por etiqueta y resolvemos el valor por separado.
const GUESS_OPTIONS: { value: number | null; label: string }[] = [
  { value: 15, label: '15 s' },
  { value: 30, label: '30 s' },
  { value: 60, label: '60 s' },
  { value: null, label: 'Libre' },
]
const DEFAULT_GUESS_INDEX = 1

// Unidades del número (UnitInput): NO solo €. La unidad va al lado del número.
// `custom` abre un campo libre ≤8 car (la respuesta del rediseño a "solo €").
const UNIT_OPTIONS: readonly Unit[] = [
  { value: 'eur', symbol: '€', label: 'euros (€)' },
  { value: 'km', symbol: 'km', label: 'kilómetros (km)' },
  { value: 'kg', symbol: 'kg', label: 'kilos (kg)' },
  { value: 'pct', symbol: '%', label: 'por ciento (%)' },
  { value: 'min', symbol: 'min', label: 'minutos (min)' },
  { value: 'none', symbol: '—', label: 'sin unidad' },
  { value: 'custom', symbol: '…', label: 'otra…' },
]
const UNIT_MAX = 8

// El símbolo que se guarda/muestra para una clave de unidad (vacío = sin unidad).
function symbolFor(unitKey: string, custom: string): string {
  if (unitKey === 'custom') return custom.trim()
  if (unitKey === 'none') return ''
  return UNIT_OPTIONS.find((u) => u.value === unitKey)?.symbol ?? ''
}

// Etapas del formulario (issue #586 — de 3 pasos a 2, proceso con sentido):
//  0 = la pregunta (nombre + pregunta + foto opcional).
//  1 = respuesta y reglas (cifra + unidad + plazo + tiempo por jugada).
// La estrictez del conteo ya no se pregunta: se fija a "normal" (antes exponía
// una tercera decisión que no aportaba al proceso de crear el reto).
type Stage = 0 | 1
const TOTAL_STAGES = 2

/**
 * Parsea la respuesta escrita (formato es-ES: coma decimal) a número, infiriendo
 * los DECIMALES de cómo se escribió (lo que pide el reto). Devuelve null si no es
 * un número válido. "84,50" → { value: 84.5, decimals: 2 }.
 */
function parseAnswer(raw: string): { value: number; decimals: number } | null {
  // El UnitInput ya filtra a dígitos, coma/punto y signo; aquí normalizamos el
  // punto a coma para tratar ambos separadores y validamos el formato es-ES.
  const cleaned = raw.trim().replace(/\s/g, '').replace(/\./g, ',')
  if (cleaned === '') return null
  if (!/^\d+(,\d+)?$/.test(cleaned)) return null
  const [intPart, decPart = ''] = cleaned.split(',')
  const value = Number(`${intPart}.${decPart}`)
  if (!Number.isFinite(value)) return null
  return { value, decimals: Math.min(decPart.length, 4) }
}

// Reto de NÚMERO ("¿Adivinas?"): pregunta + cifra oculta + unidad. Sin mapa ni
// Street View: es un FORMULARIO, no una escena con protagonista visual (issue
// #586 — el shell inmersivo dejaba un backdrop oscuro vacío con el título del
// fondo asomando recortado tras la hoja). Vive en ShellUtilitario, igual que
// CreateGroup y CreateChallengeKindPicker: hoja limpia sobre --paper, cabecera
// fija con atrás, CTA como footer. Al crear NO salta a jugar: muestra la hoja de
// Compartir (el destino común de los flujos de crear reto).
export function CreateNumberChallenge({ groupId, groupName, onBack, onCreated }: Props) {
  const [stage, setStage] = useState<Stage>(0)
  // Dirección del cambio de paso (#531): avanzar entra desde la derecha, volver
  // desde la izquierda. `goStage` es el único punto que mueve `stage`, así que
  // calcular la dirección ahí cubre avanzar y retroceder.
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward')
  // Reto recién creado: en vez de saltar a jugar, mostramos la hoja de Compartir.
  const [created, setCreated] = useState<ChallengeForPlay | null>(null)

  const [title, setTitle] = useState('')
  const [question, setQuestion] = useState('')
  const [answerRaw, setAnswerRaw] = useState('')
  const [unitKey, setUnitKey] = useState('eur')
  const [customUnit, setCustomUnit] = useState('')
  // Estrictez del conteo: fija a "normal" (ya no es una decisión del formulario,
  // ver comentario del tipo `Stage`). Misma curva que la RPC del servidor.
  const tolerance = DEFAULT_NUMBER_TOLERANCE

  const [deadlineIndex, setDeadlineIndex] = useState(DEFAULT_DEADLINE_INDEX)
  const [guessIndex, setGuessIndex] = useState(DEFAULT_GUESS_INDEX)

  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const toast = useToast()
  const { user } = useSession()

  // Al cambiar de etapa el cuerpo vuelve arriba (cada etapa empieza por su título;
  // mismo patrón que CreateGroup).
  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0
  }, [stage])

  // Limpia el object URL de la foto al desmontar (no fugar memoria).
  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview)
    }
  }, [photoPreview])

  function pickPhoto(file: File | null) {
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return file ? URL.createObjectURL(file) : null
    })
    setPhotoFile(file)
  }

  const usingCustomUnit = unitKey === 'custom'
  const effectiveUnit = symbolFor(unitKey, customUnit)
  const parsed = parseAnswer(answerRaw)
  const guessSeconds = GUESS_OPTIONS[guessIndex].value

  // Gating de avance por etapa:
  //  0 (la pregunta): exige nombre y pregunta.
  //  1 (respuesta y reglas): etapa final, el CTA crea directamente.
  const canAdvanceFromStage: Record<Stage, boolean> = {
    0: title.trim().length > 0 && question.trim().length > 0,
    1: false,
  }

  const readyToCreate =
    title.trim().length > 0 &&
    question.trim().length > 0 &&
    parsed != null &&
    (!usingCustomUnit || customUnit.trim().length > 0)

  // Qué falta, en concreto, para poder crear (mensaje claro, no botón muerto).
  const missing = (() => {
    if (title.trim().length === 0) return 'Ponle un nombre al reto.'
    if (question.trim().length === 0) return 'Escribe la pregunta.'
    if (parsed == null) return 'Falta la respuesta correcta (solo cifras).'
    if (usingCustomUnit && customUnit.trim().length === 0) return 'Escribe la unidad o elige una.'
    return null
  })()

  function goStage(n: Stage) {
    setDirection(n > stage ? 'forward' : 'backward')
    setStage(n)
  }
  function advance() {
    if (stage === 0 && canAdvanceFromStage[0]) goStage(1)
  }
  function retreat() {
    if (stage > 0) goStage(0)
  }

  async function save() {
    if (!user) {
      toast.show('Inicia sesión para crear un reto.', { tone: 'danger' })
      return
    }
    if (missing || !parsed) {
      toast.show(missing ?? 'Faltan datos del reto.', { tone: 'danger' })
      return
    }

    setBusy(true)
    try {
      let imagePath: string | undefined
      if (photoFile) {
        setStatus('Subiendo la foto…')
        imagePath = await uploadImage(photoFile)
      }

      setStatus('Creando el reto…')
      const { challenge } = await createNumberChallenge({
        title: title.trim(),
        question: question.trim(),
        answerNumber: parsed.value,
        decimals: parsed.decimals,
        unit: effectiveUnit || null,
        tolerance,
        createdBy: user.id,
        groupId,
        deadlineAt: deadlineFromMinutes(DEADLINE_OPTIONS[deadlineIndex].minutes),
        guessSeconds,
        imagePath,
      })
      setStatus(null)
      track('challenge_created', {
        group_id: groupId,
        challenge_id: challenge.id,
        challenge_kind: 'number',
        has_photo: Boolean(imagePath),
        guess_seconds: guessSeconds,
        duration_hours: DEADLINE_OPTIONS[deadlineIndex].minutes / 60,
        number_tolerance: tolerance,
      })
      // En vez de saltar a jugar, abrimos la hoja de Compartir: el destino común de
      // los flujos de crear reto (qué se comparte, a quién, y cómo volver al viaje).
      setCreated(challenge)
    } catch (err) {
      reportError(err, { area: 'create_number_challenge' })
      const msg = describeError(err)
      setStatus(null)
      toast.show(`No se pudo crear el reto: ${msg}`, { tone: 'danger' })
      setBusy(false)
    }
  }

  // Clase del contenido del paso: dirección del `.stage` (#531). Solo el CONTENIDO
  // anima; la cabecera/footer de ShellUtilitario quedan fijos entre pasos.
  const stageClass = `${styles.stage} ${direction === 'backward' ? styles.stepBack : ''}`.trim()

  // Footer CTA: varía según la etapa y el estado de carga (mismo patrón que
  // CreateGroup: solo el botón vive en el footer, avisos y estado quedan en el
  // cuerpo que scrollea).
  const footer =
    stage === 0 ? (
      <Button
        type="button"
        size="lg"
        fullWidth
        disabled={!canAdvanceFromStage[0]}
        onClick={advance}
        aria-label="Siguiente: respuesta y reglas"
      >
        Siguiente: la respuesta
        <ArrowRight />
      </Button>
    ) : (
      <Button
        type="button"
        size="lg"
        fullWidth
        disabled={!readyToCreate || busy}
        onClick={() => void save()}
        aria-label="Crear el reto"
      >
        {busy ? <Spinner size={18} /> : <Rocket />}
        Crear el reto
      </Button>
    )

  return (
    <div className={styles.root}>
      <ShellUtilitario
        header={
          <AppHeader
            variant="plain"
            lead="back"
            onLead={stage === 0 ? onBack : retreat}
            leadLabel={stage === 0 ? 'Atrás' : 'Paso anterior'}
            kicker={groupName ?? undefined}
            title="Nuevo reto · ¿Adivinas?"
          />
        }
        footer={footer}
      >
        {/* Indicador de progreso: puntos teal (activo) vs neutro. */}
        <div
          className={styles.progress}
          role="progressbar"
          aria-valuenow={stage + 1}
          aria-valuemin={1}
          aria-valuemax={TOTAL_STAGES}
          aria-label={`Paso ${stage + 1} de ${TOTAL_STAGES}`}
        >
          {Array.from({ length: TOTAL_STAGES }, (_, i) => (
            <span
              key={i}
              className={`${styles.progressDot} ${i <= stage ? styles.progressActive : ''}`}
            />
          ))}
        </div>

        {/* Referencia de scroll para volver arriba al cambiar etapa. */}
        <div ref={bodyRef} />

        {/* ETAPA 0 — la pregunta: nombre + pregunta + foto opcional. */}
        {stage === 0 && (
          <section className={stageClass}>
            {/* Sin el nombre del viaje aquí: envolvía el eyebrow a dos líneas en
                móvil y descolocaba el punto (el contexto ya lo da la navegación). */}
            <div className={styles.eyebrow}>
              <i className={styles.dot} /> Paso 1 de 2 · La pregunta
            </div>
            <h1 className={styles.h}>¿Qué adivinan?</h1>
            <p className={styles.sub}>Ponle nombre y lanza la pregunta de cifra a tu grupo.</p>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="cn-title">
                Nombre del reto
              </label>
              <input
                id="cn-title"
                className={styles.input}
                type="text"
                placeholder="p. ej. La cuenta de la cena"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="cn-question">
                Tu pregunta
              </label>
              <input
                id="cn-question"
                className={styles.input}
                type="text"
                placeholder="p. ej. ¿Cuánto costó la cena del grupo?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>
                Foto <span>· opcional</span>
              </label>
              <PhotoDropzone
                preview={photoPreview}
                onPick={pickPhoto}
                onClear={() => pickPhoto(null)}
                label="Añadir foto (opcional)"
              />
            </div>

            {!canAdvanceFromStage[0] && (title.trim() || question.trim()) && (
              <p className={styles.warnHint}>Falta {title.trim() ? 'la pregunta' : 'el nombre'}.</p>
            )}
          </section>
        )}

        {/* ETAPA 1 — respuesta y reglas: cifra + unidad + plazo + tiempo por jugada. */}
        {stage === 1 && (
          <section className={stageClass}>
            <div className={styles.eyebrow}>
              <i className={styles.dot} /> Paso 2 de 2 · Respuesta y reglas
            </div>
            <h1 className={styles.h}>La cifra correcta</h1>
            <p className={styles.sub}>Y cuándo cierra el reto.</p>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="cn-answer">
                Respuesta correcta{' '}
                <span className={styles.lock}>
                  <Icon icon={Hash} size={11} /> oculta hasta que voten
                </span>
              </label>
              {/* Número + selector de unidad al lado: el número manda, la unidad lo
                  acompaña (no se elige en otra pantalla). NO solo €. Placeholder
                  normal (ejemplo de formato), no un "0" gris gigante fantasma. */}
              <UnitInput
                value={answerRaw}
                onValueChange={setAnswerRaw}
                units={UNIT_OPTIONS}
                unit={unitKey}
                onUnitChange={setUnitKey}
                placeholder="84,50"
                label="Respuesta correcta"
              />
              {answerRaw.length > 0 && !parsed && (
                <p className={styles.errHint}>Escribe solo cifras (la coma para decimales).</p>
              )}
              {usingCustomUnit && (
                <input
                  className={`${styles.input} ${styles.customUnit}`}
                  type="text"
                  maxLength={UNIT_MAX}
                  placeholder="p. ej. pts"
                  aria-label="Unidad personalizada"
                  value={customUnit}
                  onChange={(e) => setCustomUnit(e.target.value)}
                />
              )}
            </div>

            <div className={styles.field}>
              <label className={styles.label}>
                Plazo para jugar <span>· cuándo cierra</span>
              </label>
              <SegmentedControl
                label="Plazo para jugar"
                options={DEADLINE_OPTIONS.map((opt, i) => ({ value: String(i), label: opt.label }))}
                value={String(deadlineIndex)}
                onChange={(v) => setDeadlineIndex(Number(v))}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>
                Tiempo por jugada <span>· cuenta atrás</span>
              </label>
              <SegmentedControl
                label="Tiempo por jugada"
                options={GUESS_OPTIONS.map((opt, i) => ({ value: String(i), label: opt.label }))}
                value={String(guessIndex)}
                onChange={(v) => setGuessIndex(Number(v))}
              />
            </div>

            {!readyToCreate && missing && (
              <div className={styles.warning}>
                <Icon icon={AlertTriangle} size={18} />
                <span>{missing}</span>
              </div>
            )}

            {status && (
              <div className={styles.statusRow}>
                <Spinner size={16} />
                <span>{status}</span>
              </div>
            )}
          </section>
        )}
      </ShellUtilitario>

      {/* Tras crear, hoja de Compartir: qué se comparte, a quién, y cómo volver al
          viaje (el reto aparece ya en su sitio). Es el destino de crear un reto. */}
      {created && (
        <ChallengeCreatedShare
          groupId={groupId}
          groupName={groupName}
          challengeId={created.id}
          challengeTitle={created.title}
          imagePath={created.image_path}
          onPlay={() => onCreated(created)}
        />
      )}
    </div>
  )
}

function ArrowRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Rocket() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
