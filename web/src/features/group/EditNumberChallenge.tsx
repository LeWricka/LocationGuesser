import { useEffect, useState } from 'react'
import { Clock, Hash, Lock } from 'lucide-react'
import { parseAnswer, symbolFor, unitKeyFor, UNIT_MAX, UNIT_OPTIONS } from '../create/numberAnswer'
import { countVotes, updateNumberChallenge, type ChallengeForPlay } from '../../lib/challenges'
import { deadlineFromMinutes, formatDeadlineDateTime, isPast } from '../../lib/time'
import { track } from '../../lib/analytics'
import {
  AppHeader,
  Banner,
  Button,
  Field,
  Icon,
  Input,
  Row,
  SegmentedControl,
  type SegmentedOption,
  Spinner,
  Stack,
  useToast,
} from '../../ui'
import styles from './EditChallenge.module.css'

interface Props {
  /** Reto de NÚMERO a editar (SIN la cifra: `answer_number_src` no se puede releer). */
  challenge: ChallengeForPlay
  /** Vuelve atrás sin guardar (cancelar). */
  onBack: () => void
  /** Reto actualizado: el viaje lo usa para refrescar la lista. */
  onSaved: (challenge: ChallengeForPlay) => void
}

// PLAZO: MISMAS paradas y gramática que el editor de ubicación (`EditChallenge`,
// issue "editar reto — ajustar la fecha"): relativas a AHORA, reveladas tras
// tocar "Cambiar plazo" (evita un 5º chip de "sin cambios" que desbordaba a
// 320px). Ver el comentario homólogo en EditChallenge.tsx.
const KEEP_DURATION = ''
const DEFAULT_DURATION_VALUE = '240' // 4 h, mismo default que EditChallenge
const DURATION_OPTIONS: SegmentedOption<string>[] = [
  { value: '60', label: '1 h' },
  { value: '240', label: '4 h' },
  { value: '720', label: 'Hoy' },
  { value: '4320', label: '3 días' },
]

// Tiempo por jugada: MISMAS paradas que `CreateNumberChallenge` (segundos, no
// minutos — adivinar una cifra es más rápido que localizar un mapa).
const NO_GUESS_LIMIT = ''
const GUESS_OPTIONS: SegmentedOption<string>[] = [
  { value: '15', label: '15 s' },
  { value: '30', label: '30 s' },
  { value: '60', label: '60 s' },
  { value: NO_GUESS_LIMIT, label: 'Libre' },
]

// Editor de reto de NÚMERO ("¿Cuánto?", issue #922). HERMANO de `EditChallenge`
// pero SIN mapa ni Street View: no hay ubicación que editar. Reutiliza el mismo
// `EditChallenge.module.css` (clases genéricas: coords/status) y el patrón de
// "revelar tras un botón" para plazo y respuesta.
//
// DOS reglas de integridad distintas:
//  - Pregunta y unidad son METADATOS libres: se pueden editar siempre, tengan
//    o no jugadas (no son la respuesta, no son spoiler).
//  - La RESPUESTA (cifra + decimales) solo se puede tocar si el reto aún no
//    tiene votos; con jugadas guardadas, cambiarla dejaría el histórico
//    comparado contra una cifra que ya no es la jugada (mismo criterio que
//    `locationLocked` en EditChallenge). Además, la cifra actual NUNCA se
//    puede releer (SELECT revocado en `answer_number_src`): el formulario NO
//    la prefija ni la muestra; el dueño la re-introduce desde cero si quiere
//    cambiarla, y si no toca el campo, no se toca nada de la respuesta.
export function EditNumberChallenge({ challenge, onBack, onSaved }: Props) {
  const [title, setTitle] = useState(challenge.title)
  const [question, setQuestion] = useState(challenge.number_question ?? '')

  // Unidad: siempre editable. Reconstruimos qué opción fija coincide con el
  // símbolo guardado (o la tratamos como personalizada) con `unitKeyFor`.
  const initialUnit = unitKeyFor(challenge.number_unit)
  const [unitKey, setUnitKey] = useState(initialUnit.unitKey)
  const [customUnit, setCustomUnit] = useState(initialUnit.customUnit)
  const usingCustomUnit = unitKey === 'custom'

  const [guessValue, setGuessValue] = useState<string>(
    challenge.guess_seconds == null ? NO_GUESS_LIMIT : String(challenge.guess_seconds),
  )
  const [durationValue, setDurationValue] = useState<string>(KEEP_DURATION)
  // Un reto cerrado no se reabre editando el plazo (mismo criterio que EditChallenge).
  const [isClosed] = useState(() => challenge.deadline_at != null && isPast(challenge.deadline_at))
  const [previewNowMs, setPreviewNowMs] = useState<number | null>(null)

  function onChangeDuration(v: string) {
    setDurationValue(v)
    setPreviewNowMs(v === KEEP_DURATION ? null : Date.now())
  }

  const previewDeadlineIso =
    previewNowMs != null && durationValue !== KEEP_DURATION
      ? new Date(previewNowMs + Number(durationValue) * 60_000).toISOString()
      : null

  // Respuesta editable solo sin votos (misma regla que `locationLocked`).
  const [votes, setVotes] = useState<number | null>(null)
  const answerLocked = votes === null || votes > 0

  // Re-introducir la cifra: oculto tras un botón (nunca se prefija con la
  // actual — no se puede releer). `answerRaw` vacío + sin tocar = no se manda
  // ningún cambio de respuesta al guardar.
  const [answerEditing, setAnswerEditing] = useState(false)
  const [answerRaw, setAnswerRaw] = useState('')
  const parsedAnswer = parseAnswer(answerRaw)

  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const toast = useToast()

  // ¿Tiene votos? Decide si la respuesta es editable. Se comprueba en cliente
  // para la UI; `updateNumberChallenge` lo revalida en la capa de datos.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const n = await countVotes(challenge.id)
        if (!cancelled) setVotes(n)
      } catch {
        // Si falla, mantenemos la respuesta bloqueada (votes sigue null).
      }
    })()
    return () => {
      cancelled = true
    }
  }, [challenge.id])

  function startAnswerEdit() {
    setAnswerEditing(true)
    setAnswerRaw('')
  }
  function cancelAnswerEdit() {
    setAnswerEditing(false)
    setAnswerRaw('')
  }

  async function save() {
    // Defensa: un reto cerrado no reabre por aquí (gating también en la UI).
    const changingDuration = !isClosed && durationValue !== KEEP_DURATION
    let newDeadlineAt: string | undefined
    if (changingDuration) {
      newDeadlineAt = deadlineFromMinutes(Number(durationValue))
      if (isPast(newDeadlineAt)) {
        toast.show('Ese plazo ya habría pasado. Elige una duración mayor.', { tone: 'danger' })
        return
      }
    }

    // Si el dueño abrió "cambiar la respuesta" pero no escribió una cifra
    // válida, no seguimos: mejor avisar que guardar a medias.
    if (answerEditing && !parsedAnswer) {
      toast.show('Escribe la nueva cifra correcta (o descarta el cambio).', { tone: 'danger' })
      return
    }

    setBusy(true)
    try {
      const guessSeconds = guessValue === NO_GUESS_LIMIT ? null : Number(guessValue)
      const effectiveUnit = symbolFor(unitKey, customUnit)

      setStatus('Guardando los cambios…')
      const updated = await updateNumberChallenge(challenge.id, {
        title: title.trim() || '¿Cuánto?',
        guessSeconds,
        question: question.trim(),
        unit: effectiveUnit || null,
        ...(newDeadlineAt !== undefined ? { deadlineAt: newDeadlineAt } : {}),
        ...(answerEditing && parsedAnswer
          ? { answer: { answerNumber: parsedAnswer.value, decimals: parsedAnswer.decimals } }
          : {}),
      })
      setStatus(null)
      track('challenge_edited', {
        group_id: challenge.group_id,
        challenge_id: challenge.id,
        challenge_kind: 'number',
        ...(changingDuration ? { deadline_changed: true } : {}),
        ...(answerEditing && parsedAnswer ? { answer_changed: true } : {}),
      })
      onSaved(updated)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setStatus(null)
      toast.show(`No se pudieron guardar los cambios: ${msg}`, { tone: 'danger' })
      setBusy(false)
    }
  }

  return (
    <main className="lg-page">
      <AppHeader title="Editar reto · ¿Cuánto?" lead="back" onLead={onBack} leadLabel="Volver" />

      <Stack gap={4}>
        <Field label="Título del reto" hint="Si lo dejas vacío usamos «¿Cuánto?».">
          {(fieldProps) => (
            <Input
              {...fieldProps}
              placeholder="¿Cuánto?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
        </Field>

        <Field
          label="Tu pregunta"
          hint="Lo que se lee al jugar. No es la respuesta, se puede editar siempre."
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              placeholder="p. ej. ¿Cuánto costó la cena con tu gente?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          )}
        </Field>

        <Field label="Unidad" hint="Cómo se muestra la cifra al revelar. Se puede editar siempre.">
          {(fieldProps) => (
            <Stack gap={2} align="start">
              <select
                {...fieldProps}
                className={styles.textarea}
                value={unitKey}
                onChange={(e) => setUnitKey(e.target.value)}
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label ?? u.symbol}
                  </option>
                ))}
              </select>
              {usingCustomUnit && (
                <input
                  className={styles.textarea}
                  type="text"
                  maxLength={UNIT_MAX}
                  placeholder="p. ej. pts"
                  aria-label="Unidad personalizada"
                  value={customUnit}
                  onChange={(e) => setCustomUnit(e.target.value)}
                />
              )}
            </Stack>
          )}
        </Field>

        {/* Respuesta: bloqueada si el reto ya tiene jugadas (cambiarla dejaría el
            histórico comparado contra una cifra que ya no es la jugada). La cifra
            actual NUNCA se muestra ni se prefija (spoiler write-only). */}
        <Field
          label="Respuesta correcta"
          hint={
            answerLocked
              ? undefined
              : 'Oculta siempre. Solo cámbiala si de verdad quieres corregirla: hay que re-escribirla entera.'
          }
        >
          {() =>
            answerLocked ? (
              <Banner tone="info" icon={Lock}>
                Bloqueada: este reto ya tiene jugadas. Cambiar la respuesta dejaría el histórico
                comparado contra una cifra distinta a la que se jugó.
              </Banner>
            ) : answerEditing ? (
              <Stack gap={2} align="start">
                <input
                  className={styles.textarea}
                  type="text"
                  inputMode="decimal"
                  placeholder="84,50"
                  aria-label="Nueva respuesta correcta"
                  value={answerRaw}
                  onChange={(e) => setAnswerRaw(e.target.value.replace(/[^\d.,-]/g, ''))}
                />
                {answerRaw.length > 0 && !parsedAnswer && (
                  <p className={styles.coords}>Escribe solo cifras (la coma para decimales).</p>
                )}
                <Button variant="ghost" size="sm" onClick={cancelAnswerEdit}>
                  Descartar el cambio de respuesta
                </Button>
              </Stack>
            ) : (
              <Button variant="secondary" size="sm" onClick={startAnswerEdit}>
                <Icon icon={Hash} size={16} />
                Cambiar la respuesta correcta
              </Button>
            )
          }
        </Field>

        <Field
          label="Plazo"
          hint={
            isClosed
              ? 'Cerrar es otra acción: un reto cerrado no se reabre editando el plazo.'
              : undefined
          }
        >
          {() => (
            <Stack gap={2}>
              <Row gap={2} className={styles.coords}>
                <Icon icon={Clock} size={14} />
                <span>
                  {challenge.deadline_at
                    ? `${isClosed ? 'Cerró' : 'Cierra'} el ${formatDeadlineDateTime(challenge.deadline_at)}.`
                    : 'Sin plazo.'}
                </span>
              </Row>
              {!isClosed &&
                (durationValue === KEEP_DURATION ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onChangeDuration(DEFAULT_DURATION_VALUE)}
                  >
                    <Icon icon={Clock} size={16} />
                    Cambiar plazo
                  </Button>
                ) : (
                  <>
                    <SegmentedControl
                      label="Plazo del reto"
                      options={DURATION_OPTIONS}
                      value={durationValue}
                      onChange={onChangeDuration}
                    />
                    {previewDeadlineIso && (
                      <Row gap={2} className={styles.coords}>
                        <Icon icon={Clock} size={14} />
                        <span>
                          Pasará a cerrar el {formatDeadlineDateTime(previewDeadlineIso)}.
                        </span>
                      </Row>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onChangeDuration(KEEP_DURATION)}
                    >
                      Deshacer cambio de plazo
                    </Button>
                  </>
                ))}
            </Stack>
          )}
        </Field>

        <Field label="Tiempo por jugada">
          {() => (
            <SegmentedControl
              label="Tiempo por jugada"
              options={GUESS_OPTIONS}
              value={guessValue}
              onChange={setGuessValue}
            />
          )}
        </Field>

        <Button size="lg" fullWidth loading={busy} onClick={() => void save()}>
          Guardar cambios
        </Button>

        {status && (
          <Row gap={2} className={styles.status}>
            <Spinner size={16} />
            <span>{status}</span>
          </Row>
        )}
      </Stack>
    </main>
  )
}
