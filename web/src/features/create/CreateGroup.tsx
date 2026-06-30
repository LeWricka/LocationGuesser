import { useMemo, useState } from 'react'
import { newGroupCode } from '../../lib/group'
import { createGroup } from '../../lib/groupData'
import { joinGroupAsOwner } from '../../lib/membership'
import { track } from '../../lib/analytics'
import { useSession } from '../../lib/session-context'
import { Spinner, useToast } from '../../ui'
import { CalendarIcon, PeopleIcon, SparkIcon, TripPinIcon } from './CreateIcons'
import { ImmersiveSheet } from './ImmersiveSheet'
import { formatTripDates } from './tripDates'
import styles from './CreateGroup.module.css'

interface Props {
  onBack: () => void
}

// Etapas de la hoja: 0=el viaje (nombre/fechas/detalles) · 1=tu gente · 2=resumen.
type Stage = 0 | 1 | 2
const TOTAL_STAGES = 3
// Alturas (px) de la hoja por etapa: crece con el contenido (como crear-reto).
const STAGE_HEIGHTS: Record<Stage, number> = { 0: 540, 1: 360, 2: 470 }

// Crear un viaje (flujo grupo-primero). El viaje es el contenedor social del
// plan: lo creas, los invitas y lo viven contigo. No se crea ningún reto aquí;
// eso se hace luego dentro del viaje. Quien crea queda como dueño (`created_by` +
// fila 'owner' en group_members) y navegamos a #g=<código>. El flujo es
// inmersivo: mapa a sangre de fondo + hoja que crece por etapas (coherente con
// CreateChallengeImmersive y jugar). Los datos del viaje (fechas, descripción,
// acompañantes) son OPCIONALES; solo el nombre hace falta para avanzar.
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
    1: true,
    2: false,
  }

  function goStage(n: Stage) {
    setStage(n)
  }

  function advance() {
    if (stage === 0 && !nameOk) {
      toast.show('Ponle un nombre al viaje para seguir.', { tone: 'neutral' })
      return
    }
    if (stage < 2 && canAdvanceFromStage[stage]) goStage((stage + 1) as Stage)
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

  return (
    <div className={styles.root}>
      {/* MAPA DECORATIVO A SANGRE: ruta + pines, fondo inmersivo (sin Leaflet:
          aquí no se marca ningún punto, es ambiente). */}
      <div className={styles.map} aria-hidden>
        <svg viewBox="0 0 390 840" preserveAspectRatio="xMidYMid slice">
          <path
            className={styles.land}
            d="M-20,180 Q60,120 150,160 T320,140 L410,180 L410,360 Q300,330 220,370 T40,360 L-20,330 Z"
          />
          <path
            className={styles.land}
            d="M40,520 Q140,470 240,520 T420,500 L420,720 Q300,690 200,730 T20,700 L20,560 Z"
          />
          <path
            className={styles.route}
            d="M95,250 C150,300 200,330 250,300 S320,420 270,560 S150,610 130,650"
          />
        </svg>
        <span className={styles.mapPin} style={{ left: 90, top: 243, animationDelay: '0.6s' }} />
        <span className={styles.mapPin} style={{ left: 248, top: 294, animationDelay: '0.95s' }} />
        <span className={styles.mapPin} style={{ left: 266, top: 553, animationDelay: '1.3s' }} />
        <span className={styles.mapPin} style={{ left: 126, top: 644, animationDelay: '1.65s' }} />
      </div>

      {/* Viñeta para legibilidad del chrome claro sobre el mapa. */}
      <div className={styles.vignette} aria-hidden />

      {/* Topbar flotante translúcido: atrás · título. */}
      <div className={styles.top}>
        <button type="button" className={styles.iconBtn} aria-label="Atrás" onClick={onBack}>
          <BackArrow />
        </button>
        <div className={styles.topTitle}>
          <b>Nuevo viaje</b>
        </div>
        {/* Hueco simétrico para centrar el título. */}
        <span className={styles.iconBtn} aria-hidden />
      </div>

      {/* BOTTOM SHEET que sube y crece por etapas. */}
      <ImmersiveSheet
        stage={stage}
        total={TOTAL_STAGES}
        height={STAGE_HEIGHTS[stage]}
        canAdvance={canAdvanceFromStage[stage]}
        onAdvance={advance}
        onRetreat={retreat}
      >
        {/* ETAPA 0 — el viaje. */}
        {stage === 0 && (
          <section className={styles.stage}>
            <div className={styles.eyebrow}>
              <i className={styles.dot} /> Paso 1 de 3 · El viaje
            </div>
            <h1 className={`${styles.h} ${styles.serif}`}>Empieza el viaje</h1>
            <p className={styles.sub}>
              Dale un nombre y, si quieres, di cuándo es. Lo demás puede esperar.
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
                  <input
                    className={styles.dateInput}
                    type="date"
                    aria-label="Fecha de salida"
                    value={startsOn}
                    max={endsOn || undefined}
                    onChange={(e) => setStartsOn(e.target.value)}
                  />
                </div>
                <div className={styles.dateBox}>
                  <span className={styles.dateCap}>Vuelta</span>
                  <input
                    className={styles.dateInput}
                    type="date"
                    aria-label="Fecha de vuelta"
                    value={endsOn}
                    min={startsOn || undefined}
                    onChange={(e) => setEndsOn(e.target.value)}
                  />
                </div>
              </div>
              {datesInverted ? (
                <p className={styles.warnHint}>La vuelta es antes de la salida. Lo ordenaremos.</p>
              ) : (
                <p className={styles.hint}>Marca un rango. El diario se ordena por estos días.</p>
              )}
            </div>

            {/* Más detalles (opcional, colapsado). */}
            <button
              type="button"
              className={`${styles.moreBtn} ${moreOpen ? styles.moreOpen : ''}`}
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((v) => !v)}
            >
              <span>Añadir descripción y acompañantes</span>
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
              <div className={styles.field}>
                <label className={styles.label} htmlFor="cg-people">
                  ¿Con quién vas? <span>· opcional</span>
                </label>
                <input
                  id="cg-people"
                  className={styles.input}
                  type="text"
                  placeholder="Marta, Diego y yo"
                  value={companions}
                  onChange={(e) => setCompanions(e.target.value)}
                />
                <p className={styles.hint}>
                  Solo para recordarlo. A los tuyos los invitas luego con el enlace del viaje.
                </p>
              </div>
            </div>

            <button className={styles.cta} type="button" disabled={!nameOk} onClick={advance}>
              Siguiente: tu gente
              <ArrowRight />
            </button>
          </section>
        )}

        {/* ETAPA 1 — tu gente (acompañantes). */}
        {stage === 1 && (
          <section className={styles.stage}>
            <div className={styles.eyebrow}>
              <i className={styles.dot} /> Paso 2 de 3 · Tu gente
            </div>
            <h1 className={`${styles.h} ${styles.serif}`}>Tu gente</h1>
            <p className={styles.sub}>
              Nadie viaja solo. Anota con quién vas; a los tuyos los invitas luego con el enlace.
            </p>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="cg-people-2">
                ¿Con quién vas? <span>· opcional</span>
              </label>
              <div className={styles.peopleField}>
                <span className={styles.peopleIco}>
                  <PeopleIcon size={20} />
                </span>
                <input
                  id="cg-people-2"
                  className={styles.peopleInput}
                  type="text"
                  placeholder="Marta, Diego y yo"
                  value={companions}
                  onChange={(e) => setCompanions(e.target.value)}
                />
              </div>
              <p className={styles.hint}>
                Es solo un recordatorio del viaje. Para que jueguen de verdad, comparte el enlace
                del viaje cuando lo crees.
              </p>
            </div>

            <button className={styles.cta} type="button" onClick={advance}>
              Revisar y crear
              <ArrowRight />
            </button>
          </section>
        )}

        {/* ETAPA 2 — resumen + crear. */}
        {stage === 2 && (
          <section className={styles.stage}>
            <div className={styles.eyebrow}>
              <i className={styles.dot} /> Paso 3 de 3 · Listo
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

            <button
              className={styles.cta}
              type="button"
              disabled={busy}
              onClick={() => void create()}
            >
              {busy ? <Spinner size={18} /> : <SparkIcon size={18} />}
              Crear viaje
            </button>
          </section>
        )}
      </ImmersiveSheet>

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

// --- Iconos puntuales del chrome flotante / navegación ---

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
