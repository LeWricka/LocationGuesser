import { useEffect, useMemo, useRef, useState } from 'react'
import { newGroupCode } from '../../lib/group'
import { createGroup } from '../../lib/groupData'
import { joinGroupAsOwner } from '../../lib/membership'
import { track } from '../../lib/analytics'
import { useSession } from '../../lib/session-context'
import { AppHeader, Button, Spinner, DatePicker, useToast } from '../../ui'
import { ShellUtilitario } from '../../ui/shells'
import { CalendarIcon, PeopleIcon, SparkIcon, TripPinIcon } from './CreateIcons'
import { formatTripDates } from './tripDates'
import styles from './CreateGroup.module.css'

interface Props {
  onBack: () => void
}

// Etapas del formulario: 0=el viaje (nombre · fechas · gente) · 1=resumen.
// El campo de acompañantes vive SOLO en la etapa 0.
// NO se pide carátula al crear: la portada es opcional y se añade después.
type Stage = 0 | 1
const TOTAL_STAGES = 2

// Crear un viaje (flujo grupo-primero). El viaje es el contenedor social del
// plan: lo creas, los invitas y lo viven contigo. No se crea ningún reto aquí;
// eso se hace luego dentro del viaje. Quien crea queda como dueño (`created_by` +
// fila 'owner' en group_members) y navegamos a #g=<código>.
//
// La pantalla usa ShellUtilitario (hoja limpia sobre --paper, sin backdrop oscuro)
// porque no hay protagonista visual real: es un formulario, no un mapa/foto.
// Elimina la zona muerta oscura que aparecía arriba con el ImmersiveSheet anterior.
// Los datos del viaje (fechas, descripción, acompañantes) son OPCIONALES; solo el
// nombre hace falta para avanzar.
export function CreateGroup({ onBack }: Props) {
  const [stage, setStage] = useState<Stage>(0)
  const [name, setName] = useState('')
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [description, setDescription] = useState('')
  const [companions, setCompanions] = useState('')
  const [moreOpen, setMoreOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [celebrating, setCelebrating] = useState(false)

  // Al cambiar de etapa el cuerpo vuelve arriba (cada etapa empieza por su título).
  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0
  }, [stage])

  const toast = useToast()
  const { user } = useSession()

  const nameOk = name.trim().length > 0
  // El rango es válido salvo que la vuelta caiga antes de la salida (las dos son
  // opcionales, así que sin alguna no hay error que mostrar).
  const datesInverted = Boolean(startsOn && endsOn && endsOn < startsOn)

  const dateSummary = useMemo(() => formatTripDates(startsOn, endsOn), [startsOn, endsOn])

  // Gating de avance por etapa. Solo el nombre bloquea; el resto es opcional.
  const canAdvanceFromStage: Record<Stage, boolean> = {
    0: nameOk,
    1: false,
  }

  function goStage(n: Stage) {
    setStage(n)
  }

  function advance() {
    if (stage === 0 && !nameOk) {
      toast.show('Falta el nombre del viaje para seguir.', { tone: 'neutral' })
      return
    }
    if (stage < 1 && canAdvanceFromStage[stage]) goStage((stage + 1) as Stage)
  }

  function retreat() {
    if (stage > 0) goStage((stage - 1) as Stage)
  }

  async function create() {
    if (!user) {
      toast.show('Inicia sesión para crear un viaje.', { tone: 'danger' })
      return
    }
    if (!nameOk) {
      toast.show('Ponle un nombre al viaje.', { tone: 'danger' })
      return
    }
    setBusy(true)
    try {
      const groupId = newGroupCode()
      // El creador es el dueño: `created_by` lo marca y el RLS de groups deja
      // editar/borrar solo a `created_by = auth.uid()`. createGroup recorta y
      // normaliza los datos opcionales del viaje (fechas, descripción, etc.).
      await createGroup(groupId, user.id, {
        name,
        startsOn,
        endsOn,
        description,
        companions,
      })
      // Membresía 'owner' para que el viaje aparezca en "Tus viajes" (la home se
      // nutre de group_members). La fila propia la permite el RLS de inserción.
      await joinGroupAsOwner(groupId, user.id)
      track('group_created', {
        group_id: groupId,
        has_dates: Boolean(startsOn || endsOn),
        has_description: description.trim().length > 0,
        has_companions: companions.trim().length > 0,
      })
      // Microcelebración antes de entrar al viaje. El listener de hashchange de
      // App.tsx recoge el cambio de hash y renderiza la página del viaje.
      setCelebrating(true)
      window.setTimeout(() => {
        location.hash = `#g=${groupId}`
      }, 1400)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // "Failed to fetch" suele ser la red del usuario (VPN, DNS, bloqueador),
      // no la app.
      const networkish = /failed to fetch|networkerror|load failed/i.test(msg)
      toast.show(
        networkish
          ? 'Sin conexión con el servidor. Prueba con datos en vez de WiFi (o al revés) y desactiva VPN, DNS privado o bloqueador; luego reinténtalo.'
          : `No se pudo crear el viaje: ${msg}`,
        { tone: 'danger' },
      )
      setBusy(false)
    }
  }

  // Footer CTA: varía según la etapa y el estado de carga.
  const footer =
    stage === 0 ? (
      <Button
        type="button"
        size="lg"
        fullWidth
        disabled={!nameOk}
        onClick={advance}
        aria-label="Revisar y crear viaje"
      >
        Revisar y crear
        <ArrowRight />
      </Button>
    ) : (
      <Button
        type="button"
        size="lg"
        fullWidth
        disabled={busy}
        onClick={() => void create()}
        aria-label="Crear viaje"
      >
        {busy ? <Spinner size={18} /> : <SparkIcon size={18} />}
        Crear viaje
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
            leadLabel={stage === 0 ? 'Volver' : 'Paso anterior'}
            title="Nuevo viaje"
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

        {/* ETAPA 0 — el viaje: nombre · fechas · gente (todo en una hoja que respira;
            el campo de acompañantes vive solo aquí, sin duplicar). */}
        {stage === 0 && (
          <section className={styles.stage}>
            <div className={styles.eyebrow}>
              <i className={styles.dot} /> Paso 1 de 2 · El viaje
            </div>
            <h1 className={`${styles.h} ${styles.serif}`}>Empieza el viaje</h1>
            <p className={styles.sub}>
              Dale un nombre y, si quieres, di cuándo es y con quién. Lo demás puede esperar.
            </p>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="cg-name">
                Nombre del viaje
              </label>
              <input
                id="cg-name"
                className={`${styles.input} ${styles.nameInput}`}
                type="text"
                placeholder="Japón en otoño"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    advance()
                  }
                }}
              />
              <p className={styles.hint}>Para que los tuyos lo reconozcan de un vistazo.</p>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>
                Fechas <span>· opcional</span>
              </label>
              <div className={styles.dates}>
                <div className={styles.dateBox}>
                  <span className={styles.dateCap}>Salida</span>
                  <DatePicker
                    aria-label="Fecha de salida"
                    placeholder="Elige día"
                    value={startsOn}
                    max={endsOn || undefined}
                    onChange={(v) => setStartsOn(v ?? '')}
                  />
                </div>
                <div className={styles.dateBox}>
                  <span className={styles.dateCap}>Vuelta</span>
                  <DatePicker
                    aria-label="Fecha de vuelta"
                    placeholder="Elige día"
                    value={endsOn}
                    min={startsOn || undefined}
                    onChange={(v) => setEndsOn(v ?? '')}
                  />
                </div>
              </div>
              {datesInverted ? (
                <p className={styles.warnHint}>La vuelta es antes de la salida. Lo ordenaremos.</p>
              ) : (
                <p className={styles.hint}>Marca un rango. El diario se ordena por estos días.</p>
              )}
            </div>

            {/* ¿Con quién vas? — el ÚNICO campo de acompañantes (antes duplicado). */}
            <div className={styles.field}>
              <label className={styles.label} htmlFor="cg-people">
                ¿Con quién vas? <span>· opcional</span>
              </label>
              <div className={styles.peopleField}>
                <span className={styles.peopleIco}>
                  <PeopleIcon size={20} />
                </span>
                <input
                  id="cg-people"
                  className={styles.peopleInput}
                  type="text"
                  placeholder="Marta, Diego y yo"
                  value={companions}
                  onChange={(e) => setCompanions(e.target.value)}
                />
              </div>
              <p className={styles.hint}>
                Solo para recordarlo. A los tuyos los invitas luego con el enlace del viaje.
              </p>
            </div>

            {/* Descripción (opcional, colapsada para que la hoja respire). */}
            <button
              type="button"
              className={`${styles.moreBtn} ${moreOpen ? styles.moreOpen : ''}`}
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((v) => !v)}
            >
              <span>Añadir una descripción</span>
              <Chevron />
            </button>
            <div className={`${styles.more} ${moreOpen ? styles.moreShow : ''}`}>
              <div className={styles.field} style={{ marginTop: 14 }}>
                <label className={styles.label} htmlFor="cg-desc">
                  Descripción <span>· opcional</span>
                </label>
                <textarea
                  id="cg-desc"
                  className={styles.textarea}
                  placeholder="Dos semanas de templos, ramen y trenes bala."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>

            {!nameOk && <p className={styles.warnHint}>Falta el nombre del viaje.</p>}
          </section>
        )}

        {/* ETAPA 1 — resumen + crear. */}
        {stage === 1 && (
          <section className={styles.stage}>
            <div className={styles.eyebrow}>
              <i className={styles.dot} /> Paso 2 de 2 · Listo
            </div>
            <h1 className={`${styles.h} ${styles.serif}`}>Así queda</h1>
            <p className={styles.sub}>Revísalo. Podrás cambiarlo todo más tarde desde el viaje.</p>

            <div className={styles.review}>
              <div className={styles.reviewRow}>
                <span className={styles.rIco}>
                  <TripPinIcon size={18} />
                </span>
                <div className={styles.rTxt}>
                  <small>Viaje</small>
                  <b>{name.trim() || 'Viaje sin nombre'}</b>
                </div>
              </div>
              <div className={styles.reviewRow}>
                <span className={styles.rIco}>
                  <CalendarIcon size={18} />
                </span>
                <div className={styles.rTxt}>
                  <small>Fechas</small>
                  <b>{dateSummary ?? 'Sin fechas'}</b>
                </div>
              </div>
              <div className={styles.reviewRow}>
                <span className={styles.rIco}>
                  <PeopleIcon size={18} />
                </span>
                <div className={styles.rTxt}>
                  <small>Acompañantes</small>
                  <b>{companions.trim() || 'Solo tú, de momento'}</b>
                </div>
              </div>
              {description.trim() && (
                <div className={styles.reviewRow}>
                  <span className={styles.rIco}>
                    <SparkIcon size={18} />
                  </span>
                  <div className={styles.rTxt}>
                    <small>De qué va</small>
                    <b className={styles.reviewDesc}>{description.trim()}</b>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </ShellUtilitario>

      {/* MICROCELEBRACIÓN al crear: burst + "¡Buen viaje!". */}
      {celebrating && (
        <div className={styles.celebrate} role="status">
          <div className={styles.celebrateCard}>
            <span className={styles.burst}>
              <SparkIcon size={44} />
            </span>
            <h3 className={styles.serif}>¡Buen viaje!</h3>
            <p>
              Tu viaje está listo.
              <br />
              Comparte el enlace y empezad a llenar el diario.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Iconos puntuales del chrome / navegación ---

function ArrowRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={styles.chev}
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
