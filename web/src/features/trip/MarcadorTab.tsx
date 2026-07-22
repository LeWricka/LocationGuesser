import { useState } from 'react'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import { Crown, Gift, Share2, Skull, User } from 'lucide-react'
import { Avatar, Button, CountUp, Icon, IconDiana } from '../../ui'
import type { LeaderboardEntry } from '../../lib/leaderboard'
import type { GroupPrizes } from '../../lib/database.types'
import type { PastChallengeSummary } from './useTripData'
// "El camino" (issue #831): la ruta dorada vertical de los retos del viaje —
// antes vivía aquí mismo como "Retos anteriores" (issue #608), extraída a su
// propio fichero por el tamaño de la pieza (thumbnail, nodo, IntersectionObserver
// de entrada).
import { Camino } from './Camino'
// Rescatado de GroupPage (código muerto, issue #608): PREMIOS por puesto
// existía solo ahí, así que se perdió al pasar el marcador a esta pestaña. Se
// REUTILIZA tal cual (sin tocarlo): `prizes.ts` es la misma tabla de puestos
// premiables que editaba GroupSettingsModal-adyacente. El FAB "Compartir
// clasificación" (`ShareLeaderboardModal`) que vivía aquí junto a los premios
// se retiró en el issue #758: su acción pasó a ser un item de la hoja
// "Compartir" nueva del viaje (`TripPage`), que ya tiene los datos (leaderboard,
// prizes, groupName) para montar el modal sin pedírselos a esta pestaña.
import { PRIZE_SLOTS, prizeForRow } from '../group/prizes'
// Editor de premios (issues #123/#608): extraído a fichero propio (issues
// #752/#753) para que también lo abra el nudge post-creación del viaje
// (`CreateGroup`), no solo el Marcador.
import { PrizesEditorModal } from '../group/PrizesEditorModal'
import styles from './MarcadorTab.module.css'

interface Props {
  leaderboard: LeaderboardEntry[]
  /** userId del usuario en sesión: resalta su fila con acento teal. */
  myUserId?: string | null
  /** Abre la hoja de invitar (CTA del vacío: sin retos ni marcador, invitar es el
   * siguiente paso obvio, no un texto sin acción — issue #510). */
  onInvite: () => void
  /** Abre el flujo de crear reto. Se ofrece a cualquier MIEMBRO (issue #783). */
  onAddChallenge: () => void
  /** ¿Puede el usuario crear retos? (issue #783: cualquier MIEMBRO del viaje).
   * Gobierna SOLO el CTA "Crear un reto" del vacío — los premios ya NO
   * dependen de este prop, ver `isOwner`. */
  canCreate: boolean
  /** ¿Es DUEÑO del viaje? (issue #783, separado de `canCreate`) — gobierna la
   * edición de premios: es el mismo permiso que en GroupPage/GroupSettings. */
  isOwner: boolean
  /** Código del viaje: guarda los premios (`PrizesEditorModal`). */
  groupId: string
  /** Premios por puesto (`groups.prizes`, issue #123). null = sin premios. */
  prizes: GroupPrizes | null
  /** Retos anteriores del viaje (issue #608, rescatado de GroupPage/PastSection;
   * ampliado en el #800 a los EN JUEGO). */
  pastChallenges: PastChallengeSummary[]
  /** Reto EN JUEGO sin jugar (issue #800, anti-spoiler): al flujo de jugar, el
   * mismo que "Adivina" del Diario — nunca al detalle, que revelaría el mapa. */
  onPlayChallenge: (challengeId: string) => void
  /** Reto CERRADO, o EN JUEGO ya jugado: abre el detalle completo (issue #800) —
   * clasificación del reto, mapa con todas las jugadas y la foto. */
  onViewChallenge: (challengeId: string) => void
  /** Tras guardar los premios: refresca el viaje para que los chips reflejen el cambio. */
  onPrizesSaved: () => void
  /**
   * Anclas de `GuidedTour` (viaje de ejemplo, onboarding nuevo pieza 4/4), todas
   * opcionales y sin efecto fuera de la guía: el podio ("Y quién va ganando."),
   * el envoltorio de "El camino" ("Los retos del viaje: aquí se juega.") y el
   * PRIMER hito de la ruta ("Así se juega uno.") — este último se reenvía a
   * `Camino`, que lo ata a su primer `<li>`.
   */
  podioRef?: RefObject<HTMLOListElement | null>
  caminoWrapRef?: RefObject<HTMLDivElement | null>
  firstHitoRef?: RefObject<HTMLLIElement | null>
}

// Orden de ENTRADA del podio: 3º → 2º → 1º (el ganador remata la coreografía).
// Mapea el rank real (1|2|3) al índice de aparición que alimenta --i (stagger).
const PODIO_ENTRY_ORDER: Record<1 | 2 | 3, number> = { 3: 0, 2: 1, 1: 2 }

const ORDINAL: Record<1 | 2 | 3, string> = { 1: '1º', 2: '2º', 3: '3º' }

// Puestos del podio VACÍO (promesa de lo que habrá, issue #753): mismo orden de
// entrada/pedestal que el podio real, sin datos de jugador todavía.
const EMPTY_PODIO_RANKS: (1 | 2 | 3)[] = [1, 2, 3]

// Chip de premio de un puesto (podio o lista): dato descriptivo, no una acción,
// salvo que el dueño pueda editar premios (issues #752/#753) — en ese caso es un
// <button> real (mismo aspecto, sin pinta de botón para el resto de miembros:
// "cuando haya premios, la edición vive en tocar los chips siendo dueño", sin el
// enlace de texto de la esquina que el dueño real no encontró). `premioBtn`
// resetea la apariencia nativa del <button> para que sea indistinguible del
// <span> de solo lectura.
function PremioTappable({
  className,
  canEdit,
  onEdit,
  children,
}: {
  className: string
  canEdit: boolean
  onEdit: () => void
  children: ReactNode
}) {
  if (!canEdit) return <span className={className}>{children}</span>
  return (
    <button type="button" className={`${className} ${styles.premioBtn}`} onClick={onEdit}>
      {children}
    </button>
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
 *     puesto (podio y lista) cuando el dueño definió premio para esa posición.
 *  3. RETOS ANTERIORES (rescatado de GroupPage/PastSection): los retos ya
 *     CERRADOS del viaje, más reciente primero — thumbnail de su foto (issue
 *     #753; placeholder de marca si no tiene), nombre, ganador con medalla (y
 *     el aviso "salió de la app" si aplica) y tu resultado breve. Tocar la fila
 *     abre el detalle del reto (mismo hash `#g=…&c=…` que "Adivina"/"Ya jugaste"
 *     en el reto en vivo: revelado si ya jugaste o el reto ya cerró).
 *
 * COMPARTIR (issue #758): el FAB "Compartir clasificación" que vivía aquí junto
 * a los premios se retiró — su acción (`ShareLeaderboardModal`) pasó a ser un
 * item de la hoja "Compartir" del viaje (visible en los 3 tabs, `TripPage`),
 * que ya tiene el leaderboard/prizes/groupName para montar el modal ella misma.
 *
 * Con ≤3 jugadores solo hay podio (sin lista vacía debajo); con 1 jugador, el líder
 * va solo y centrado (issue #594, punto 3).
 *
 * v4 (issues #752/#753 — rediseño visual del vacío + premios descubribles): el
 * vacío (nadie ha jugado) YA NO es un párrafo con un icono: es un podio VACÍO
 * (huecos de avatar discontinuos, misma composición 2-1-3 y mismos pedestales
 * que el podio real) — la promesa visual de lo que habrá, con copy de una sola
 * línea. Los premios se integran EN el podio (real o vacío) en vez de vivir tras
 * un enlace de texto en la esquina (el dueño real no lo encontró):
 *  - si hay premio del 1º, un chip igual que en el podio real, colgando del hueco;
 *  - el premio del ÚLTIMO va en una píldora propia BAJO el podio (colgado del 3er
 *    pedestal se leía contradictorio: "¿el 3º es el último?");
 *  - si NO hay ningún premio definido y el usuario es dueño, el hueco del 1º
 *    ofrece la CTA "¿Qué se juega?" que abre `PrizesEditorModal`.
 * Una vez hay AL MENOS un premio, la edición vive en TOCAR el chip (dueño):
 * `PremioTappable` lo convierte en un `<button>` real solo para el dueño, con el
 * mismo aspecto que el texto plano (issue #608: para el resto de miembros nunca
 * debe leerse como un botón).
 *
 * v5 (issue #783 — cualquier miembro crea): `canCreate` (CTA "Crear un reto")
 * pasa a ser "soy miembro del viaje"; los premios (chips tappables, CTA "¿Qué
 * se juega?" y el editor) siguen siendo cosa del dueño, ahora tras `isOwner`
 * — un prop nuevo y separado.
 *
 * v6 (issue #800 — detalle del reto): "Retos anteriores" pasa a incluir los
 * retos EN JUEGO además de los cerrados (chip "EN JUEGO" + cuenta atrás, sin
 * "ganador" — el resultado aún no es definitivo), y la fila ya no navega
 * siempre al mismo sitio: `onPlayChallenge` (anti-spoiler, un EN JUEGO sin
 * jugar) u `onViewChallenge` (el detalle nuevo — clasificación, mapa de
 * jugadas, foto — para cualquier CERRADO o un EN JUEGO ya jugado).
 *
 * v7 (issue #831 — rediseño OSCURO e inmersivo, prototipo validado por el PM):
 * la pestaña deja de vivir sobre PAPEL claro y pasa a la MISMA escena oscura
 * que Diario/Bitácora (`--scene-*`/`--glass-*`/`--route-gold`/`--medal-*` de
 * `index.css`/`tokens.css`; ver `TripPage.module.css`, que unifica las 3
 * secciones bajo `.sceneDiario`). Sin eyebrow/título encima del podio (el PM lo
 * quitó explícitamente al validar el prototipo: la cumbre ya se lee sola).
 * "Retos anteriores" se rebautiza **"El camino"**: la MISMA lista
 * (`pastChallenges`, EN JUEGO primero + cerrados del más reciente al más
 * antiguo) pero como una ruta dorada vertical y cronológica, extraída a
 * `Camino.tsx` por tamaño (thumbnail, nodo con pulso, entrada por
 * IntersectionObserver). El ganador de un hito cerrado ahora lleva su AVATAR
 * real (no un icono de medalla) y "Tú: Nº · pts" anuncia el PUESTO propio en
 * ESE reto (antes solo los puntos) — `useTripData` gana `winner.userId`/
 * `winner.avatar` y `myRank` para esto (issue #841).
 */
export function MarcadorTab({
  leaderboard,
  myUserId,
  onInvite,
  onAddChallenge,
  canCreate,
  isOwner,
  groupId,
  prizes,
  pastChallenges,
  onPlayChallenge,
  onViewChallenge,
  onPrizesSaved,
  podioRef,
  caminoWrapRef,
  firstHitoRef,
}: Props) {
  const [editingPrizes, setEditingPrizes] = useState(false)
  const hasEntries = leaderboard.length > 0
  const hasPrizes = PRIZE_SLOTS.some(({ key }) => (prizes?.[key]?.trim() ?? '') !== '')
  const openPrizeEditor = () => setEditingPrizes(true)

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
      {hasEntries ? (
        <>
          <ol className={styles.podio} aria-label="Podio" ref={podioRef}>
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

                  {premio ? (
                    <PremioTappable
                      className={styles.podioPremio}
                      canEdit={isOwner}
                      onEdit={openPrizeEditor}
                    >
                      <Icon icon={Gift} size={12} />
                      <span className={styles.podioPremioTexto}>{premio}</span>
                    </PremioTappable>
                  ) : (
                    // Sin NINGÚN premio definido, el dueño ve en el hueco del 1º la
                    // única entrada para fijarlos (issue #752): en cuanto exista
                    // uno, la edición pasa a vivir en tocar ese chip.
                    esLider &&
                    isOwner &&
                    !hasPrizes && (
                      <button
                        type="button"
                        className={styles.podioPremioCta}
                        onClick={openPrizeEditor}
                      >
                        <Icon icon={Gift} size={12} />
                        ¿Qué se juega?
                      </button>
                    )
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
                      <span className={styles.posicion} role="img" aria-label={`Posición ${rank}`}>
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
                        {/* Premio: dato descriptivo (qué se lleva); tappable solo para
                            el dueño (issue #752), igual criterio que el podio. */}
                        {premio && (
                          <PremioTappable
                            className={styles.filaPremio}
                            canEdit={isOwner}
                            onEdit={openPrizeEditor}
                          >
                            <Icon icon={Gift} size={12} />
                            <span className={styles.filaPremioLabel}>Premio</span>
                            <span className={styles.filaPremioTexto}>{premio}</span>
                          </PremioTappable>
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
        <>
          {/* Podio VACÍO (issue #753): la promesa visual de lo que habrá, no un
              párrafo. Huecos de avatar discontinuos en la misma composición 2-1-3;
              los premios YA integrados (chip en 1º/último si existen, o la CTA
              "¿Qué se juega?" del dueño en el hueco del 1º si aún no hay ninguno). */}
          <ol className={styles.podio} aria-label="Podio">
            {EMPTY_PODIO_RANKS.map((rank) => {
              const esLider = rank === 1
              const rankClass =
                rank === 1 ? styles.podio1 : rank === 2 ? styles.podio2 : styles.podio3
              const anilloClass =
                rank === 1 ? styles.anillo1 : rank === 2 ? styles.anillo2 : styles.anillo3
              // Solo el 1º lleva la promesa de premio EN el podio (issue #753):
              // 2º/3º del podio vacío no significan nada todavía, y el premio del
              // ÚLTIMO va en su propia píldora bajo el podio — colgado del 3er
              // pedestal se leía contradictorio ("¿el 3º es el último?").
              const premio = esLider ? (prizes?.first?.trim() ?? null) : null

              return (
                <li
                  key={rank}
                  className={[styles.podioItem, styles.podioItemVacio, rankClass]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ '--i': PODIO_ENTRY_ORDER[rank] } as CSSProperties}
                >
                  {esLider && (
                    <span className={styles.corona} aria-hidden="true">
                      <Icon icon={Crown} size={22} />
                    </span>
                  )}

                  {/* Hueco de avatar (círculo discontinuo): mismo anillo/escala que el
                      podio real, sin foto ni nombre — la promesa de quién ganará. */}
                  <span className={[styles.avatarRing, anilloClass].join(' ')} aria-hidden="true">
                    <span className={styles.avatarHueco}>
                      <Icon icon={User} size={26} className={styles.avatarHuecoIcono} />
                    </span>
                  </span>

                  {premio ? (
                    <PremioTappable
                      className={styles.podioPremio}
                      canEdit={isOwner}
                      onEdit={openPrizeEditor}
                    >
                      <Icon icon={Gift} size={12} />
                      <span className={styles.podioPremioTexto}>{premio}</span>
                    </PremioTappable>
                  ) : (
                    esLider &&
                    isOwner &&
                    !hasPrizes && (
                      <button
                        type="button"
                        className={styles.podioPremioCta}
                        onClick={openPrizeEditor}
                      >
                        <Icon icon={Gift} size={12} />
                        ¿Qué se juega?
                      </button>
                    )
                  )}

                  <div className={styles.podioPeana}>
                    <span className={styles.podioPeanaTexto}>{ORDINAL[rank]}</span>
                  </div>
                </li>
              )
            })}
          </ol>

          {/* Premio del ÚLTIMO en su propia píldora, centrada BAJO el podio: dentro
              del podio (colgado del 3er pedestal) se leía contradictorio — "¿el 3º
              es el último?". Skull, no Gift: el premio del último es castigo-broma,
              no regalo. Tappable por el dueño, igual criterio que los chips. */}
          {prizes?.last?.trim() && (
            <PremioTappable
              className={styles.ultimoPill}
              canEdit={isOwner}
              onEdit={openPrizeEditor}
            >
              <Icon icon={Skull} size={14} />
              <span className={styles.ultimoPillTexto}>Último: {prizes.last.trim()}</span>
            </PremioTappable>
          )}

          <div className={styles.vacio} role="status">
            {/* Poco texto, visual-first (issue #753): una línea, el podio ya habla. */}
            <p>Aún no hay clasificación. Juega el primer reto y aparecerá aquí.</p>
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
        </>
      )}

      {/* "El camino" (issue #831, antes "Retos anteriores" — issue #608, ampliado
          en el #800 a los EN JUEGO): ruta dorada vertical de los retos del
          viaje. Mismo dato (`pastChallenges`) y mismo anti-spoiler de siempre
          (`onPlayChallenge` vs `onViewChallenge`); la pieza entera vive en
          `Camino.tsx` (extraída por tamaño). No renderiza nada si no hay
          ningún reto: no añade ruido a un viaje recién creado. */}
      <div ref={caminoWrapRef}>
        <Camino
          pastChallenges={pastChallenges}
          onPlayChallenge={onPlayChallenge}
          onViewChallenge={onViewChallenge}
          firstHitoRef={firstHitoRef}
        />
      </div>

      {isOwner && editingPrizes && (
        <PrizesEditorModal
          groupId={groupId}
          prizes={prizes}
          origin="marcador"
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
