import { useEffect, useState } from 'react'
import { AlertTriangle, Check, Hash } from 'lucide-react'
import { StopwatchIcon } from './CreateIcons'
import { PhotoDropzone } from './PhotoDropzone'
import { ImmersiveSheet } from './ImmersiveSheet'
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
import { Icon, Spinner, useToast } from '../../ui'
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
const DEADLINE_OPTIONS: { minutes: number; label: string; review: string }[] = [
  { minutes: 60, label: '1 h', review: 'Cierra en 1 h' },
  { minutes: 240, label: '4 h', review: 'Cierra en 4 h' },
  { minutes: 720, label: 'Hoy', review: 'Cierra hoy' },
  { minutes: 4320, label: '3 días', review: 'Cierra en 3 días' },
]
const DEFAULT_DEADLINE_INDEX = 1

// Tiempo por jugada en segundos; null = sin límite.
const GUESS_OPTIONS: { value: number | null; label: string; review: string }[] = [
  { value: 15, label: '15 s', review: '15 s por intento' },
  { value: 30, label: '30 s', review: '30 s por intento' },
  { value: 60, label: '60 s', review: '60 s por intento' },
  { value: null, label: 'Libre', review: 'sin límite por intento' },
]
const DEFAULT_GUESS_INDEX = 1

// Unidades sugeridas (pills). "otra" abre un campo libre ≤8 car.
const UNIT_PILLS = ['€', 'km', 'kg', '%', 'min'] as const
const UNIT_MAX = 8

// Estrictez del scoring (number_tolerance). Misma curva que la RPC; el texto en
// vivo se calcula con geo.scoreForNumber para que cuadre con el servidor.
const TOLERANCE_OPTIONS: { value: NumberTolerance; label: string }[] = [
  { value: 'indulgente', label: 'Indulgente' },
  { value: 'normal', label: 'Normal' },
  { value: 'estricto', label: 'Estricto' },
]

// Etapas de la hoja: 0=respuesta · 1=detalles · 2=resumen.
type Stage = 0 | 1 | 2
const TOTAL_STAGES = 3
const STAGE_HEIGHTS: Record<Stage, number> = { 0: 430, 1: 470, 2: 400 }

/**
 * Parsea la respuesta escrita (formato es-ES: coma decimal) a número, infiriendo
 * los DECIMALES de cómo se escribió (lo que pide el reto). Devuelve null si no es
 * un número válido. "84,50" → { value: 84.5, decimals: 2 }.
 */
function parseAnswer(raw: string): { value: number; decimals: number } | null {
  const cleaned = raw.trim().replace(/\s/g, '')
  if (cleaned === '') return null
  // Solo dígitos y una coma decimal (es-ES). Rechazamos cualquier otra cosa.
  if (!/^\d+(,\d+)?$/.test(cleaned)) return null
  const [intPart, decPart = ''] = cleaned.split(',')
  const value = Number(`${intPart}.${decPart}`)
  if (!Number.isFinite(value)) return null
  return { value, decimals: Math.min(decPart.length, 4) }
}

// Reto de NÚMERO ("¿Cuánto?", #323): pregunta + cifra oculta + unidad + estrictez.
// Sin mapa ni Street View. Mismo lenguaje visual que el flujo de lugar (foto-hero +
// hoja que crece por etapas), pero la "respuesta" es una cifra que se queda oculta
// (answer_number_src) hasta que el grupo vota.
export function CreateNumberChallenge({ groupId, groupName, onBack, onCreated }: Props) {
  const [stage, setStage] = useState<Stage>(0)
  const [celebrating, setCelebrating] = useState(false)

  const [title, setTitle] = useState('')
  const [question, setQuestion] = useState('')
  const [answerRaw, setAnswerRaw] = useState('')
  const [unit, setUnit] = useState<string>('€')
  const [customUnit, setCustomUnit] = useState('')
  const [usingCustomUnit, setUsingCustomUnit] = useState(false)
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

  const effectiveUnit = usingCustomUnit ? customUnit.trim() : unit
  const parsed = parseAnswer(answerRaw)
  const guessSeconds = GUESS_OPTIONS[guessIndex].value

  // Lectura en vivo de la estrictez: "±10% (≈ X) ≈ N pts · clavarlo = 5.000".
  // Usa geo.scoreForNumber (idéntico a la RPC) sobre la respuesta tecleada.
  const liveRead = (() => {
    if (!parsed) return null
    const tenPct = parsed.value * 0.1
    const pts = scoreForNumber(tenPct, parsed.value, tolerance)
    return {
      tenPct: fmtNumber(tenPct, parsed.decimals, effectiveUnit || null),
      pts: pts.toLocaleString('es-ES'),
    }
  })()

  const canAdvanceFromStage: Record<Stage, boolean> = {
    0: question.trim().length > 0 && parsed != null,
    1: !usingCustomUnit || customUnit.trim().length > 0,
    2: false,
  }

  const readyToCreate =
    title.trim().length > 0 &&
    question.trim().length > 0 &&
    parsed != null &&
    (!usingCustomUnit || customUnit.trim().length > 0)

  function advance() {
    if (stage < 2 && canAdvanceFromStage[stage]) setStage((stage + 1) as Stage)
  }
  function retreat() {
    if (stage > 0) setStage((stage - 1) as Stage)
  }

  function selectUnit(u: string) {
    setUsingCustomUnit(false)
    setUnit(u)
  }
  function toggleCustomUnit() {
    setUsingCustomUnit((on) => !on)
  }

  async function save() {
    if (!user) {
      toast.show('Inicia sesión para crear un reto.', { tone: 'danger' })
      return
    }
    if (!parsed || question.trim().length === 0 || title.trim().length === 0) {
      toast.show('Falta la pregunta o la cifra correcta.', { tone: 'danger' })
      return
    }

    setBusy(true)
    try {
      let imagePath: string | undefined
      if (photoFile) {
        setStatus('Subiendo la foto…')
        imagePath = await uploadImage(photoFile)
      }

      setStatus('Lanzando el reto…')
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
      setCelebrating(true)
      window.setTimeout(() => onCreated(challenge), 1500)
    } catch (err) {
      reportError(err, { area: 'create_number_challenge' })
      const msg = describeError(err)
      setStatus(null)
      toast.show(`No se pudo lanzar el reto: ${msg}`, { tone: 'danger' })
      setBusy(false)
    }
  }

  return (
    <div className={styles.root}>
      {/* Foto-hero: la imagen (si la hay) llena la cabecera; encima, chip de tipo
          y la pregunta. Sin foto, un degradado neutro de la marca. */}
      <div className={styles.hero}>
        {photoPreview ? (
          <img className={styles.heroImg} src={photoPreview} alt="" aria-hidden />
        ) : (
          <div className={styles.heroNeutral} aria-hidden />
        )}
        <div className={styles.heroVeil} aria-hidden />
        <div className={styles.heroTop}>
          <button type="button" className={styles.iconBtn} aria-label="Atrás" onClick={onBack}>
            <BackArrow />
          </button>
          <span className={styles.kindChip}>
            <Icon icon={Hash} size={13} /> ¿Cuánto?
          </span>
          <div className={styles.topTitle}>
            {groupName ? <small>Viaje · {groupName}</small> : <small>Nuevo reto</small>}
          </div>
        </div>
        <div className={styles.heroQuestion}>
          <p className={styles.heroAsk}>{question.trim() || 'Tu pregunta aparecerá aquí'}</p>
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
        {/* ETAPA 0 — pregunta + respuesta + foto. */}
        {stage === 0 && (
          <section className={sheet.stage}>
            <div className={sheet.eyebrow}>
              <i className={sheet.dot} /> Paso 1 de 3 · La porra
            </div>
            <h1 className={sheet.h}>Lanza tu pregunta</h1>
            <p className={sheet.sub}>Una cifra que tu grupo intentará adivinar.</p>

            <div className={sheet.field}>
              <label className={sheet.label} htmlFor="cn-question">
                La pregunta
              </label>
              <input
                id="cn-question"
                className={sheet.input}
                type="text"
                placeholder="p. ej. ¿Cuánto creéis que nos costó?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </div>

            <div className={sheet.field}>
              <label className={sheet.label} htmlFor="cn-answer">
                Respuesta correcta{' '}
                <span className={styles.lock}>
                  <Icon icon={Hash} size={11} /> oculta hasta que voten
                </span>
              </label>
              <div className={styles.answerRow}>
                <input
                  id="cn-answer"
                  className={styles.numInput}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  value={answerRaw}
                  onChange={(e) => setAnswerRaw(e.target.value)}
                  aria-invalid={answerRaw.length > 0 && !parsed}
                />
                <span className={styles.unitTag} aria-hidden>
                  {effectiveUnit || '—'}
                </span>
              </div>
              {answerRaw.length > 0 && !parsed && (
                <p className={styles.errHint}>Escribe solo cifras (la coma para decimales).</p>
              )}
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
              Siguiente: las reglas
              <ArrowRight />
            </button>
          </section>
        )}

        {/* ETAPA 1 — unidad + estrictez + plazo + tiempo. */}
        {stage === 1 && (
          <section className={sheet.stage}>
            <div className={sheet.eyebrow}>
              <i className={sheet.dot} /> Paso 2 de 3 · Las reglas
            </div>
            <h1 className={sheet.h}>Afina la porra</h1>
            <p className={sheet.sub}>La unidad, lo estricto del conteo y los plazos.</p>

            <div className={sheet.field}>
              <label className={sheet.label}>
                Unidad <span>· opcional</span>
              </label>
              <div className={styles.unitPills}>
                {UNIT_PILLS.map((u) => (
                  <button
                    key={u}
                    type="button"
                    className={`${styles.pill} ${!usingCustomUnit && unit === u ? styles.pillOn : ''}`}
                    aria-pressed={!usingCustomUnit && unit === u}
                    onClick={() => selectUnit(u)}
                  >
                    {u}
                  </button>
                ))}
                <button
                  type="button"
                  className={`${styles.pill} ${styles.pillGhost} ${usingCustomUnit ? styles.pillOn : ''}`}
                  aria-pressed={usingCustomUnit}
                  onClick={toggleCustomUnit}
                >
                  + otra
                </button>
              </div>
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

            <div className={sheet.field}>
              <label className={sheet.label}>
                Estrictez <span>· cómo cae la puntuación</span>
              </label>
              <div className={sheet.seg}>
                {TOLERANCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={tolerance === opt.value ? sheet.segSel : undefined}
                    aria-pressed={tolerance === opt.value}
                    onClick={() => setTolerance(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
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
              <div className={sheet.seg}>
                {DEADLINE_OPTIONS.map((opt, i) => (
                  <button
                    key={opt.label}
                    type="button"
                    className={i === deadlineIndex ? sheet.segSel : undefined}
                    aria-pressed={i === deadlineIndex}
                    onClick={() => setDeadlineIndex(i)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={sheet.field}>
              <label className={sheet.label}>
                Tiempo por jugada <span>· cuenta atrás</span>
              </label>
              <div className={sheet.seg}>
                {GUESS_OPTIONS.map((opt, i) => (
                  <button
                    key={opt.label}
                    type="button"
                    className={i === guessIndex ? sheet.segSel : undefined}
                    aria-pressed={i === guessIndex}
                    onClick={() => setGuessIndex(i)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              className={sheet.cta}
              type="button"
              disabled={!canAdvanceFromStage[1]}
              onClick={advance}
            >
              Revisar y lanzar
              <ArrowRight />
            </button>
          </section>
        )}

        {/* ETAPA 2 — resumen + lanzar. */}
        {stage === 2 && (
          <section className={sheet.stage}>
            <div className={sheet.eyebrow}>
              <i className={sheet.dot} /> Paso 3 de 3 · Listo
            </div>
            <h1 className={sheet.h}>Lanza la porra</h1>
            <p className={sheet.sub}>La cifra queda oculta hasta que todos voten.</p>

            <div className={sheet.field}>
              <label className={sheet.label} htmlFor="cn-title">
                Nombre del reto
              </label>
              <input
                id="cn-title"
                className={sheet.input}
                type="text"
                placeholder="p. ej. La porra de la cena"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className={sheet.review}>
              <div className={sheet.reviewRow}>
                <span className={sheet.rIco}>
                  <Icon icon={Hash} size={18} />
                </span>
                <div className={sheet.rTxt}>
                  <small>Pregunta</small>
                  <b>{question.trim() || '—'}</b>
                </div>
              </div>
              <div className={sheet.reviewRow}>
                <span className={sheet.rIco}>
                  <Icon icon={Hash} size={18} />
                </span>
                <div className={sheet.rTxt}>
                  <small>Respuesta · queda oculta</small>
                  <b className={sheet.hiddenMark}>
                    {parsed ? fmtNumber(parsed.value, parsed.decimals, effectiveUnit || null) : '—'}
                  </b>
                </div>
              </div>
              <div className={sheet.reviewRow}>
                <span className={sheet.rIco}>
                  <StopwatchIcon size={18} />
                </span>
                <div className={sheet.rTxt}>
                  <small>Plazo · tiempo por jugada</small>
                  <b>
                    {DEADLINE_OPTIONS[deadlineIndex].review} · {GUESS_OPTIONS[guessIndex].review}
                  </b>
                </div>
              </div>
            </div>

            {!readyToCreate && (
              <div className={sheet.warning}>
                <Icon icon={AlertTriangle} size={18} />
                <span>Pon un nombre al reto para poder lanzarlo.</span>
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
              Lanzar porra al grupo
            </button>
          </section>
        )}
      </ImmersiveSheet>

      {celebrating && (
        <div className={sheet.celebrate} role="status">
          <div className={sheet.celebrateCard}>
            <span className={sheet.burst}>
              <Icon icon={Check} size={48} />
            </span>
            <h3>¡Porra lanzada!</h3>
            <p>
              Tu grupo ya puede adivinar.
              <br />
              Te avisamos cuando jueguen.
            </p>
          </div>
        </div>
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
