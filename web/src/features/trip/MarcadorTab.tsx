import { useState } from 'react'
import type { CSSProperties } from 'react'
import { AlertTriangle, Crown, Gift, Share2 } from 'lucide-react'
import {
  Avatar,
  Button,
  CountUp,
  Icon,
  IconDiana,
  IconTrofeo,
  Input,
  Modal,
  Row,
  Stack,
  useToast,
} from '../../ui'
import type { LeaderboardEntry } from '../../lib/leaderboard'
import type { GroupPrizes } from '../../lib/database.types'
// `Medal` no está en el barril de `../../ui` — se importa igual que en el podio
// de temporada de GroupPage/Podium.tsx. Aquí SOLO junto al nombre del ganador en
// "Retos anteriores" (inline, pequeño): ese contexto no es ambiguo; el que sí lo
// era es el pedestal del podio de arriba (ver comentario del componente).
import { Medal } from '../../ui/Medal'
import { updateGroupPrizes } from '../../lib/groupData'
import { tripShareUrl } from '../../lib/shareLinks'
import type { PastChallengeResult, PastChallengeSummary } from './useTripData'
// Rescatados de GroupPage (código muerto, issue #608): PREMIOS por puesto y el
// modal de "Compartir clasificación como imagen" existían solo ahí, así que se
// perdieron al pasar el marcador a esta pestaña. Se REUTILIZAN tal cual (sin
// tocarlos): `prizes.ts` es la misma tabla de puestos premiables que editaba
// GroupSettingsModal-adyacente, y `ShareLeaderboardModal` es el mismo modal que
// rasteriza `LeaderboardCard` a PNG.
import { PRIZE_SLOTS, prizeForRow } from '../group/prizes'
import { ShareLeaderboardModal } from '../group/ShareLeaderboardModal'
import styles from './MarcadorTab.module.css'

interface Props {
  leaderboard: LeaderboardEntry[]
  /** userId del usuario en sesión: resalta su fila con acento teal. */
  myUserId?: string | null
  /** Abre la hoja de invitar (CTA del vacío: sin retos ni marcador, invitar es el
   * siguiente paso obvio, no un texto sin acción — issue #510). */
  onInvite: () => void
  /** Abre el flujo de crear reto. Solo se ofrece a quien puede crear (dueño). */
  onAddChallenge: () => void
  /** ¿Puede el usuario crear retos? (dueño) — también gobierna la edición de
   * premios (issue #608): es el mismo permiso que en GroupPage/GroupSettings. */
  canCreate: boolean
  /** Código del viaje: arma el enlace de compartir y guarda los premios. */
  groupId: string
  /** Nombre del viaje, para el título de la tarjeta de compartir. */
  groupName: string
  /** Premios por puesto (`groups.prizes`, issue #123). null = sin premios. */
  prizes: GroupPrizes | null
  /** Retos anteriores del viaje (issue #608, rescatado de GroupPage/PastSection). */
  pastChallenges: PastChallengeSummary[]
  /** Abre el detalle de un reto (mismo hash `#g=…&c=…` que "Adivina"/"Ya jugaste":
   * revelado si ya está cerrado o jugado). */
  onOpenChallenge: (challengeId: string) => void
  /** Tras guardar los premios: refresca el viaje para que los chips reflejen el cambio. */
  onPrizesSaved: () => void
}

// Orden de ENTRADA del podio: 3º → 2º → 1º (el ganador remata la coreografía).
// Mapea el rank real (1|2|3) al índice de aparición que alimenta --i (stagger).
const PODIO_ENTRY_ORDER: Record<1 | 2 | 3, number> = { 3: 0, 2: 1, 1: 2 }

const ORDINAL: Record<1 | 2 | 3, string> = { 1: '1º', 2: '2º', 3: '3º' }

// Icono discreto "salió de la app durante la jugada" (issue #200, rescatado de
// GroupPage:965/1230 — vivía solo en el marcador EN VIVO, que ya no se usaba).
// title + aria-label duplican el aviso para ratón y lector de pantalla, igual
// criterio que el original.
function LeftAppFlag() {
  return (
    <span
      className={styles.leftAppFlag}
      title="Salió de la app durante la jugada"
      aria-label="Salió de la app durante la jugada"
    >
      <Icon icon={AlertTriangle} size={13} />
    </span>
  )
}

/**
 * Pestaña Marcador del viaje: el tablón de un JUEGO, no una lista administrativa
 * (oleada 3, issue #546 — diagnóstico: tarjetas planas, sin jerarquía, 60% de
 * pantalla vacío). v2 (issue #594): el dueño vio la v1 de barras (#547) y la sintió
 * "pocha, poco visual" con datos reales (8 jugadores) — la mecánica es un JUEGO con
 * podio, no una tabla. v3 (issue #608, tras feedback en real del podio #600):
 *
 *  1. CENTRADO + PEDESTALES: la composición vive en un contenedor de ancho
 *     acotado y centrado (`.marcadorAncho`, margin auto) a cualquier ancho de
 *     pantalla — antes el podio (ya `justify-content:center`) podía leerse
 *     descentrado en un viewport ancho porque nada limitaba el ancho del bloque
 *     entero. El pedestal YA NO lleva el icono `Medal`: a 22px dentro de una
 *     peana de color, sus dos "cintas" + disco se leían como una carita/avatar
 *     fantasma (hallazgo del dueño con datos reales). Un ordinal de texto
 *     ("1º"/"2º"/"3º", con el símbolo de grado — nunca un "1" bare, que se leyó
 *     como una "I" mayúscula, issue #594) es inequívoco a cualquier tamaño.
 *  2. PREMIOS por puesto (issue #123, rescatado de GroupPage): un chip junto al
 *     puesto (podio y lista) cuando el dueño definió premio para esa posición;
 *     el dueño lo edita con un botón discreto arriba del todo.
 *  3. RETOS ANTERIORES (rescatado de GroupPage/PastSection): los retos ya
 *     CERRADOS del viaje, más reciente primero — nombre, ganador con medalla (y
 *     el aviso "salió de la app" si aplica) y tu resultado breve. Tocar la fila
 *     abre el detalle del reto (mismo hash `#g=…&c=…` que "Adivina"/"Ya jugaste"
 *     en el reto en vivo: revelado si ya jugaste o el reto ya cerró).
 *  4. COMPARTIR (rescatado de GroupPage): un FAB abre la vista previa de la
 *     tarjeta de clasificación (imagen) para compartirla en el chat.
 *
 * Con ≤3 jugadores solo hay podio (sin lista vacía debajo); con 1 jugador, el líder
 * va solo y centrado (issue #594, punto 3). Sin ninguna jugada, el estado vacío
 * sigue mostrando premios/retos anteriores si ya existieran (un dueño puede fijar
 * premios o cerrar un reto sin votos antes de que nadie juegue).
 *
 * Motion: la columna de cada puesto entra escalonada en el orden 3º→2º→1º
 * (`PODIO_ENTRY_ORDER` alimenta `--i`); el líder usa un easing "spring" sutil
 * (`--motion-ease-spring`) para que se note quién ganó. `animation-fill-mode:
 * backwards` SIEMPRE (nunca `both`/`forwards`, ver gotcha en el .css). Reduced-motion
 * apaga toda animación (igual que la lista de #547).
 */
export function MarcadorTab({
  leaderboard,
  myUserId,
  onInvite,
  onAddChallenge,
  canCreate,
  groupId,
  groupName,
  prizes,
  pastChallenges,
  onOpenChallenge,
  onPrizesSaved,
}: Props) {
  const [editingPrizes, setEditingPrizes] = useState(false)
  const [sharing, setSharing] = useState(false)
  const hasEntries = leaderboard.length > 0
  const hasPrizes = PRIZE_SLOTS.some(({ key }) => (prizes?.[key]?.trim() ?? '') !== '')

  // El líder marca el 100% de la barra de la lista compacta; el resto (4º+) es
  // relativo a él (leaderboard ya viene ordenado desc por puntos —
  // aggregateLeaderboard). El podio (1º-3º) no lleva barra: su jerarquía la da la
  // composición (alturas de peana), no un porcentaje.
  const topPoints = hasEntries ? leaderboard[0].points : 0
  const podio = leaderboard.slice(0, 3)
  const resto = leaderboard.slice(3)
  // Con pocos jugadores en la lista compacta sobra pantalla (issue #546, "aprovecha
  // el vacío"): más aire arriba y entre filas. El podio ya llena la parte de arriba,
  // así que el umbral aplica al tamaño de la lista compacta, no al total.
  const listaClasses = [
    styles.lista,
    resto.length > 0 && resto.length <= 2 ? styles.listaRespira : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={styles.marcador}>
      {/* Editar/añadir premios (issue #123, rescatado de GroupPage): solo el
          dueño, visible aunque nadie haya jugado aún (puede fijarlos por
          adelantado). Discreto, arriba del todo — no compite con el podio. */}
      {canCreate && (
        <Row justify="end">
          <button
            type="button"
            className={styles.editPrizesBtn}
            onClick={() => setEditingPrizes(true)}
          >
            <Icon icon={Gift} size={15} /> {hasPrizes ? 'Editar premios' : 'Añadir premios'}
          </button>
        </Row>
      )}

      <>
        {hasEntries ? (
          <>
            <ol className={styles.podio} aria-label="Podio">
              {podio.map((entry, i) => {
                const rank = (i + 1) as 1 | 2 | 3
                const esMio = entry.userId === myUserId
                const esLider = rank === 1
                const rankClass =
                  rank === 1 ? styles.podio1 : rank === 2 ? styles.podio2 : styles.podio3
                const anilloClass =
                  rank === 1 ? styles.anillo1 : rank === 2 ? styles.anillo2 : styles.anillo3
                const premio = prizeForRow(prizes, i, leaderboard.length)

                return (
                  <li
                    key={entry.userId}
                    className={[styles.podioItem, rankClass].filter(Boolean).join(' ')}
                    style={{ '--i': PODIO_ENTRY_ORDER[rank] } as CSSProperties}
                    aria-current={esMio ? 'true' : undefined}
                  >
                    {/* Corona SOLO en el líder (igual que Podium.tsx): 2º/3º no llevan
                     * insignia sobre el avatar — su puesto ya lo lee el pedestal. */}
                    {esLider && (
                      <span className={styles.corona} aria-hidden="true">
                        <Icon icon={Crown} size={22} />
                      </span>
                    )}

                    {/* Avatar grande con anillo de medalla: mismo componente del UI kit
                     * (tamaño `lg`) escalado por CSS para no tocar Avatar.tsx — el
                     * líder ~72px, 2º/3º ~56px (issue #594, punto 1). */}
                    <span className={[styles.avatarRing, anilloClass].join(' ')}>
                      <Avatar
                        userId={entry.userId}
                        avatarUrl={entry.avatar}
                        name={entry.name}
                        size="lg"
                      />
                    </span>

                    <span className={styles.podioNombreFila}>
                      <span className={styles.podioNombre}>{entry.name}</span>
                      {/* "Tú" en vez de teñir toda la columna de teal: en el podio ese
                       * acento competiría con el oro/plata/bronce del puesto. */}
                      {esMio && <span className={styles.tuTag}>Tú</span>}
                    </span>

                    <span role="img" aria-label={`${entry.points.toLocaleString('es')} puntos`}>
                      <CountUp value={entry.points} className={styles.podioPuntos} />
                    </span>

                    {premio && (
                      <span className={styles.podioPremio}>
                        <Icon icon={Gift} size={12} />
                        <span className={styles.podioPremioTexto}>{premio}</span>
                      </span>
                    )}

                    {/* Pedestal: cerrado y teñido por puesto, con altura escalonada (la
                     * del 1º, la más alta) — el gesto que lee "podio" de un vistazo. Un
                     * ORDINAL de texto ("1º"/"2º"/"3º") lleva la posición: nunca un
                     * icono (issue #608 — el `Medal` a este tamaño, dentro de una peana
                     * de color, se leyó como una carita/avatar fantasma) ni un "1" bare
                     * (se leyó como "I" mayúscula, issue #594). */}
                    <div className={styles.podioPeana}>
                      <span className={styles.podioPeanaTexto}>{ORDINAL[rank]}</span>
                    </div>
                  </li>
                )
              })}
            </ol>

            {resto.length > 0 && (
              <ol className={listaClasses} aria-label="Resto de la clasificación">
                {resto.map((entry, i) => {
                  const rank = i + 4
                  const esMio = entry.userId === myUserId
                  const barPct = topPoints > 0 ? Math.max(0.08, entry.points / topPoints) : 0
                  const premio = prizeForRow(prizes, i + 3, leaderboard.length)

                  return (
                    <li
                      key={entry.userId}
                      className={[styles.fila, esMio ? styles.miPosicion : '']
                        .filter(Boolean)
                        .join(' ')}
                      style={{ '--i': i } as CSSProperties}
                      aria-current={esMio ? 'true' : undefined}
                    >
                      <div className={styles.filaTop}>
                        <span
                          className={styles.posicion}
                          role="img"
                          aria-label={`Posición ${rank}`}
                        >
                          {rank}
                        </span>

                        <Avatar
                          userId={entry.userId}
                          avatarUrl={entry.avatar}
                          name={entry.name}
                          size="sm"
                        />

                        {/* Nombre + nº de partidas (+ premio del puesto, si lo hay). */}
                        <div className={styles.info}>
                          <div className={styles.nombre}>{entry.name}</div>
                          <div className={styles.partidas}>
                            {entry.plays} {entry.plays === 1 ? 'partida' : 'partidas'}
                          </div>
                          {/* Premio: dato descriptivo (qué se lleva), no una acción —
                              se etiqueta para no confundirse con un botón. */}
                          {premio && (
                            <span className={styles.filaPremio}>
                              <Icon icon={Gift} size={12} />
                              <span className={styles.filaPremioLabel}>Premio</span>
                              <span className={styles.filaPremioTexto}>{premio}</span>
                            </span>
                          )}
                        </div>

                        {/* Puntos: count-up al entrar; teal si es la propia fila. */}
                        <span role="img" aria-label={`${entry.points.toLocaleString('es')} puntos`}>
                          <CountUp
                            value={entry.points}
                            className={[styles.puntos, esMio ? styles.destaca : '']
                              .filter(Boolean)
                              .join(' ')}
                          />
                        </span>
                      </div>

                      {/* Barra de puntuación: proporcional al líder del viaje (no solo
                       * del resto), decorativa (los puntos ya están anunciados arriba). */}
                      <div className={styles.barraTrack} aria-hidden="true">
                        <div
                          className={styles.barraFill}
                          style={{ '--bar-pct': barPct } as CSSProperties}
                        />
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </>
        ) : (
          <div className={styles.vacio} role="status">
            <IconTrofeo size={32} className={styles.vacioCabeza} />
            <p>Cuando alguien adivine un reto, aquí aparecerá la clasificación.</p>
            {/* Poco texto, visual-first: acción, no solo un párrafo sin salida. */}
            <div className={styles.vacioAcciones}>
              <Button variant="secondary" size="sm" onClick={onInvite}>
                <Icon icon={Share2} size={16} /> Invitar
              </Button>
              {canCreate && (
                <Button size="sm" onClick={onAddChallenge}>
                  <IconDiana size={16} /> Crear un reto
                </Button>
              )}
            </div>
          </div>
        )}

        {/* "Retos anteriores" (issue #608, rescatado de GroupPage/PastSection):
            resumen breve, más reciente primero. Tocar la fila abre el detalle
            completo (foto, mapa, listado de votos) por el mismo hash que
            "Adivina"/"Ya jugaste". Solo se muestra si ya hay algo cerrado: no
            añade ruido a un viaje que aún no ha jugado nada. */}
        {pastChallenges.length > 0 && (
          <section className={styles.anteriores}>
            <h2 className={styles.anterioresTitulo}>Retos anteriores</h2>
            <ol className={styles.anterioresLista}>
              {pastChallenges.map((c) => (
                <li key={c.challengeId}>
                  <button
                    type="button"
                    className={[styles.anteriorFila, 'lg-press'].join(' ')}
                    onClick={() => onOpenChallenge(c.challengeId)}
                  >
                    <span className={styles.anteriorTitulo}>{c.title}</span>
                    <span className={styles.anteriorGanador}>
                      {c.winner ? (
                        <>
                          <Medal rank={1} size={14} />
                          {c.winner.name} · {c.winner.points.toLocaleString('es-ES')} pts
                          {c.winner.leftApp && <LeftAppFlag />}
                        </>
                      ) : (
                        'Se cerró sin votos'
                      )}
                    </span>
                    <span className={styles.anteriorResultado}>
                      <PastResultLabel isOwn={c.isOwn} result={c.myResult} />
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}
      </>

      {/* FAB "Compartir clasificación" (issue #608, rescatado de GroupPage): abre
          la previa de la tarjeta (imagen) para compartirla en el chat, el motor
          del bucle social. Solo con clasificación (nada que enseñar sin ella). */}
      {hasEntries && (
        <>
          <button
            type="button"
            className={styles.shareFab}
            onClick={() => setSharing(true)}
            aria-label="Compartir clasificación"
          >
            <Icon icon={Share2} size={18} />
            <span className={styles.shareFabLabel}>Compartir</span>
          </button>

          <ShareLeaderboardModal
            open={sharing}
            onClose={() => setSharing(false)}
            groupName={groupName}
            entries={leaderboard}
            prizes={prizes}
            link={tripShareUrl(location.origin, groupId)}
          />
        </>
      )}

      {canCreate && editingPrizes && (
        <PrizesEditorModal
          groupId={groupId}
          prizes={prizes}
          onClose={() => setEditingPrizes(false)}
          onSaved={() => {
            setEditingPrizes(false)
            onPrizesSaved()
          }}
        />
      )}
    </div>
  )
}

// "Tu resultado" corto en una fila de "Retos anteriores": puntos (+ el aviso
// anti-trampa si salió de la app), "No jugaste" si no participé, o "Tu reto" si
// lo creé yo (nadie vota su propio reto, así que "No jugaste" ahí sería confuso).
function PastResultLabel({
  isOwn,
  result,
}: {
  isOwn: boolean
  result: PastChallengeResult | null
}) {
  if (isOwn) return <>Tu reto</>
  if (!result) return <>No jugaste</>
  return (
    <>
      {result.points.toLocaleString('es-ES')} pts
      {result.leftApp && <LeftAppFlag />}
    </>
  )
}

// Editor de premios (solo dueño): un campo opcional por puesto (1º/2º/3º/último).
// Ninguno es obligatorio. Rescatado tal cual de GroupPage (issue #608, #123): el
// RLS de `groups` respalda la edición en servidor (solo el dueño puede escribir).
function PrizesEditorModal({
  groupId,
  prizes,
  onClose,
  onSaved,
}: {
  groupId: string
  prizes: GroupPrizes | null
  onClose: () => void
  onSaved: () => void
}) {
  // Arranca del valor actual para que el dueño edite sin reescribir todo.
  const [draft, setDraft] = useState<GroupPrizes>(() => ({ ...(prizes ?? {}) }))
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  async function save() {
    setBusy(true)
    try {
      await updateGroupPrizes(groupId, draft)
      toast.show('Premios guardados', { tone: 'success' })
      onSaved()
    } catch (err) {
      toast.show(`No se pudo guardar: ${err instanceof Error ? err.message : String(err)}`, {
        tone: 'danger',
      })
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={busy ? undefined : onClose}
      title={
        <>
          <Icon icon={Gift} size={18} /> Premios del viaje
        </>
      }
      footer={
        <Row gap={2} justify="end">
          <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" loading={busy} onClick={() => void save()}>
            Guardar
          </Button>
        </Row>
      }
    >
      <Stack gap={3}>
        <p className={styles.prizeHint}>Opcionales. Se marcan en la fila de cada puesto.</p>
        {PRIZE_SLOTS.map(({ key, label }, i) => (
          <label key={key} className={styles.prizeField}>
            <span className={styles.prizeFieldLabel}>{label}</span>
            <Input
              value={draft[key] ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
              maxLength={120}
              autoFocus={i === 0}
              placeholder="Ej: elige restaurante"
            />
          </label>
        ))}
      </Stack>
    </Modal>
  )
}
