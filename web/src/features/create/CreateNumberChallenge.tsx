import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Hash } from 'lucide-react'
import { PhotoDropzone } from './PhotoDropzone'
import { ImmersiveSheet } from './ImmersiveSheet'
import { ChallengeCreatedShare } from './ChallengeCreatedShare'
import { createNumberChallenge, type ChallengeForPlay } from '../../lib/challenges'
import {
  DEFAULT_NUMBER_TOLERANCE,
  fmtNumber,
  scoreForNumber,
  type NumberTolerance,
} from '../../lib/geo'
import { deadlineFromMinutes } from '../../lib/time'
import { uploadImage } from '../../lib/storage'
import { track } from '../../lib/analytics'
import { reportError } from '../../lib/observability'
import { describeError } from '../../lib/errors'
import { useSession } from '../../lib/session-context'
import { Icon, SegmentedControl, Spinner, UnitInput, type Unit, useToast } from '../../ui'
import sheet from './CreateChallengeImmersive.module.css'
import styles from './CreateNumberChallenge.module.css'

interface Props {
  /** Grupo (el viaje) al que se añade el reto. */
  groupId: string
  /** Nombre del viaje para la píldora de cabecera. */
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

// Estrictez del scoring (number_tolerance). Misma curva que la RPC; el texto en
// vivo se calcula con geo.scoreForNumber para que cuadre con el servidor.
const TOLERANCE_OPTIONS = [
  { value: 'indulgente' as const, label: 'Indulgente' },
  { value: 'normal' as const, label: 'Normal' },
  { value: 'estricto' as const, label: 'Estricto' },
]

// El símbolo que se guarda/muestra para una clave de unidad (vacío = sin unidad).
function symbolFor(unitKey: string, custom: string): string {
  if (unitKey === 'custom') return custom.trim()
  if (unitKey === 'none') return ''
  return UNIT_OPTIONS.find((u) => u.value === unitKey)?.symbol ?? ''
}

// Etapas de la hoja, en el orden corregido del rediseño:
//  0 = nombre + pregunta · 1 = respuesta + unidad (juntas) · 2 = reglas.
type Stage = 0 | 1 | 2
const TOTAL_STAGES = 3
const STAGE_HEIGHTS: Record<Stage, number> = { 0: 440, 1: 460, 2: 470 }

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

// Reto de NÚMERO ("¿Adivinas?"): pregunta + cifra oculta + unidad + estrictez. Sin
// mapa ni Street View. Orden del rediseño (Oleada 3): primero el NOMBRE y la
// PREGUNTA, luego la RESPUESTA con la UNIDAD al lado (el número manda, la unidad lo
// acompaña vía UnitInput), y por último las REGLAS. Al crear NO salta a jugar:
// muestra la hoja de Compartir (el destino común de los flujos de crear reto). El
// hero pinta la pregunta REAL que se va escribiendo (no un placeholder de relleno).
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
  const [tolerance, setTolerance] = useState<NumberTolerance>(DEFAULT_NUMBER_TOLERANCE)

  const [deadlineIndex, setDeadlineIndex] = useState(DEFAULT_DEADLINE_INDEX)
  const [guessIndex, setGuessIndex] = useState(DEFAULT_GUESS_INDEX)

  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const toast = useToast()
  const { user } = useSession()

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

  // Lectura en vivo de la estrictez: "±10% (≈ X) ≈ N pts · clavarlo = 5.000".
  const liveRead = useMemo(() => {
    if (!parsed) return null
    const tenPct = parsed.value * 0.1
    const pts = scoreForNumber(tenPct, parsed.value, tolerance)
    return {
      tenPct: fmtNumber(tenPct, parsed.decimals, effectiveUnit || null),
      pts: pts.toLocaleString('es-ES'),
    }
  }, [parsed, tolerance, effectiveUnit])

  // Gating de avance por etapa, en el orden nuevo:
  //  0 (nombre + pregunta): exige ambos.
  //  1 (respuesta + unidad): exige cifra válida y, si es unidad libre, que tenga texto.
  const canAdvanceFromStage: Record<Stage, boolean> = {
    0: title.trim().length > 0 && question.trim().length > 0,
    1: parsed != null && (!usingCustomUnit || customUnit.trim().length > 0),
    2: false,
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
    if (stage < 2 && canAdvanceFromStage[stage]) goStage((stage + 1) as Stage)
  }
  function retreat() {
    if (stage > 0) goStage((stage - 1) as Stage)
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

  // Clase del contenido del paso: dirección del `.stage` (#531, tokens compartidos
  // en CreateChallengeImmersive.module.css vía `sheet`). Solo el CONTENIDO de la
  // hoja anima; el hero de foto y la cabecera quedan fijos entre pasos.
  const stageClass = `${sheet.stage} ${direction === 'backward' ? sheet.stepBack : ''}`.trim()

  return (
    <div className={styles.root}>
      {/* Foto-hero: la imagen (si la hay) llena la cabecera; encima, chip de tipo
          y la pregunta REAL que se va escribiendo. Sin foto, un degradado neutro. */}
      <div className={styles.hero}>
        {photoPreview ? (
          <img className={styles.heroImg} src={photoPreview} alt="" aria-hidden />
        ) : (
          <div className={styles.heroNeutral} aria-hidden />
        )}
        <div className={styles.heroVeil} aria-hidden />
        <div className={styles.heroTop}>
          <button
            type="button"
            className={[styles.iconBtn, 'lg-press'].join(' ')}
            aria-label="Atrás"
            onClick={onBack}
          >
            <BackArrow />
          </button>
          <span className={styles.kindChip}>
            <Icon icon={Hash} size={13} /> ¿Adivinas?
          </span>
          <div className={styles.topTitle}>
            {groupName ? <small>Viaje · {groupName}</small> : <small>Nuevo reto</small>}
          </div>
        </div>
        <div className={styles.heroQuestion}>
          {question.trim() ? (
            <p className={styles.heroAsk}>{question.trim()}</p>
          ) : title.trim() ? (
            <p className={styles.heroAsk}>{title.trim()}</p>
          ) : (
            <p className={styles.heroHint}>Escribe el nombre y la pregunta del reto.</p>
          )}
        </div>
      </div>

      <ImmersiveSheet
        stage={stage}
        total={TOTAL_STAGES}
        height={STAGE_HEIGHTS[stage]}
        canAdvance={canAdvanceFromStage[stage]}
        onAdvance={advance}
        onRetreat={retreat}
      >
        {/* ETAPA 0 — nombre + pregunta (primero, como pide el rediseño). */}
        {stage === 0 && (
          <section className={stageClass}>
            <div className={sheet.eyebrow}>
              <i className={sheet.dot} /> Paso 1 de 3 · La pregunta
            </div>
            <h1 className={sheet.h}>¿Qué adivinan?</h1>
            <p className={sheet.sub}>Ponle nombre y lanza la pregunta de cifra a tu grupo.</p>

            <div className={sheet.field}>
              <label className={sheet.label} htmlFor="cn-title">
                Nombre del reto
              </label>
              <input
                id="cn-title"
                className={sheet.input}
                type="text"
                placeholder="p. ej. La cuenta de la cena"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className={sheet.field}>
              <label className={sheet.label} htmlFor="cn-question">
                Tu pregunta
              </label>
              <input
                id="cn-question"
                className={sheet.input}
                type="text"
                placeholder="p. ej. ¿Cuánto costó la cena del grupo?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </div>

            <PhotoDropzone
              preview={photoPreview}
              onPick={pickPhoto}
              onClear={() => pickPhoto(null)}
              label="Añadir foto (opcional)"
            />

            <button
              className={sheet.cta}
              type="button"
              disabled={!canAdvanceFromStage[0]}
              onClick={advance}
            >
              Siguiente: la respuesta
              <ArrowRight />
            </button>
          </section>
        )}

        {/* ETAPA 1 — respuesta + unidad JUNTAS (UnitInput: número grande + unidad). */}
        {stage === 1 && (
          <section className={stageClass}>
            <div className={sheet.eyebrow}>
              <i className={sheet.dot} /> Paso 2 de 3 · La respuesta
            </div>
            <h1 className={sheet.h}>La cifra correcta</h1>
            <p className={sheet.sub}>Queda oculta hasta que todos voten.</p>

            <div className={sheet.field}>
              <label className={sheet.label} htmlFor="cn-answer">
                Respuesta correcta{' '}
                <span className={styles.lock}>
                  <Icon icon={Hash} size={11} /> oculta hasta que voten
                </span>
              </label>
              {/* Número + selector de unidad al lado: el número manda, la unidad lo
                  acompaña (no se elige en otra pantalla). NO solo €. */}
              <UnitInput
                value={answerRaw}
                onValueChange={setAnswerRaw}
                units={UNIT_OPTIONS}
                unit={unitKey}
                onUnitChange={setUnitKey}
                label="Respuesta correcta"
              />
              {answerRaw.length > 0 && !parsed && (
                <p className={styles.errHint}>Escribe solo cifras (la coma para decimales).</p>
              )}
              {usingCustomUnit && (
                <input
                  className={`${sheet.input} ${styles.customUnit}`}
                  type="text"
                  maxLength={UNIT_MAX}
                  placeholder="p. ej. pts"
                  aria-label="Unidad personalizada"
                  value={customUnit}
                  onChange={(e) => setCustomUnit(e.target.value)}
                />
              )}
            </div>

            <button
              className={sheet.cta}
              type="button"
              disabled={!canAdvanceFromStage[1]}
              onClick={advance}
            >
              Siguiente: las reglas
              <ArrowRight />
            </button>
          </section>
        )}

        {/* ETAPA 2 — reglas (estrictez, plazo, tiempo) + crear → Compartir. */}
        {stage === 2 && (
          <section className={stageClass}>
            <div className={sheet.eyebrow}>
              <i className={sheet.dot} /> Paso 3 de 3 · Las reglas
            </div>
            <h1 className={sheet.h}>Afina el reto</h1>
            <p className={sheet.sub}>Lo estricto del conteo y los plazos.</p>

            <div className={sheet.field}>
              <label className={sheet.label}>
                Estrictez <span>· cómo cae la puntuación</span>
              </label>
              <SegmentedControl
                label="Estrictez del conteo"
                options={TOLERANCE_OPTIONS}
                value={tolerance}
                onChange={setTolerance}
              />
              {liveRead ? (
                <p className={styles.scaleRead}>
                  Fallar ±10 % (≈ {liveRead.tenPct}) ≈ <b>{liveRead.pts} pts</b> · clavarlo = 5.000
                </p>
              ) : (
                <p className={sheet.segHint}>El error se mide en relativo a la respuesta.</p>
              )}
            </div>

            <div className={sheet.field}>
              <label className={sheet.label}>
                Plazo para jugar <span>· cuándo cierra</span>
              </label>
              <SegmentedControl
                label="Plazo para jugar"
                options={DEADLINE_OPTIONS.map((opt, i) => ({ value: String(i), label: opt.label }))}
                value={String(deadlineIndex)}
                onChange={(v) => setDeadlineIndex(Number(v))}
              />
            </div>

            <div className={sheet.field}>
              <label className={sheet.label}>
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
              <div className={sheet.warning}>
                <Icon icon={AlertTriangle} size={18} />
                <span>{missing}</span>
              </div>
            )}

            {status && (
              <div className={sheet.statusRow}>
                <Spinner size={16} />
                <span>{status}</span>
              </div>
            )}

            <button
              className={sheet.cta}
              type="button"
              disabled={!readyToCreate || busy}
              onClick={() => void save()}
            >
              {busy ? <Spinner size={18} /> : <Rocket />}
              Crear el reto
            </button>
          </section>
        )}
      </ImmersiveSheet>

      {/* Tras crear, hoja de Compartir: qué se comparte, a quién, y cómo volver al
          viaje (el reto aparece ya en su sitio). Es el destino de crear un reto. */}
      {created && (
        <ChallengeCreatedShare
          groupId={groupId}
          groupName={groupName}
          challengeId={created.id}
          challengeTitle={created.title}
          onPlay={() => onCreated(created)}
        />
      )}
    </div>
  )
}

function BackArrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
