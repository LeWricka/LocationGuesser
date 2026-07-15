import { Play, Share2, User } from 'lucide-react'
import { Badge, Button, ChallengePhoto, Icon, IconCandado, IconDiana } from '../../ui'
import { resolveMomentPhoto, type Moment } from '../../lib/trip'
import { parseMomentDate } from '../../lib/time'
import styles from './MomentCard.module.css'

interface Props {
  moment: Moment
  /** ¿Es la tarjeta seleccionada (centrada)? Resalta su marco. */
  selected?: boolean
  /** Tocar la foto: centra su pin en el mapa Y abre la hoja de detalle (foto grande). */
  onExpand: () => void
  /** Solo en momentos en juego: lanza el flujo de adivinar. */
  onPlay?: () => void
  /**
   * Icono "compartir" a 1 tap (issue #758): solo se ofrece cuando el llamador lo
   * pasa, y el llamador (`TripDiario`) solo lo hace para el reto EN JUEGO
   * seleccionado — compartir un reto cerrado no lleva a ninguna acción.
   */
  onShare?: () => void
}

// Fecha compacta del momento ("8 abr"). Sin año: el viaje suele caber en uno y la
// cabecera ya da contexto. Devuelve null si la fecha no es válida (no rompe nada).
const dateFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' })
function formatMomentDate(value: string): string | null {
  // `parseMomentDate` (lib/time.ts) distingue `happened_on` (fecha pura, #566) de
  // `created_at` (instante ISO legado) para no desplazar el día en husos al oeste.
  const date = parseMomentDate(value)
  if (Number.isNaN(date.getTime())) return null
  // Intl añade un punto al mes abreviado ("8 abr."); lo quitamos para el compacto.
  return dateFmt.format(date).replace('.', '')
}

/**
 * Tarjeta de un momento en el carrusel del viaje (anatomía §2 del spec).
 * Foto a sangre con overlay de legibilidad; título + fecha + nº de adivinadores.
 *
 * INTERACCIÓN (reconciliación puntos 3/4):
 *  - tocar la FOTO = SELECCIONAR el momento → el mapa hace ZOOM a su pin (acción
 *    primaria, lo que la gente espera del diario visual);
 *  - abrir el detalle (foto grande + texto) es una acción EXPLÍCITA: el botón
 *    "Ver detalle" (icono expandir) arriba a la derecha. Así un toque no dispara
 *    a la vez zoom y hoja.
 *
 * RECUERDO vs RETO (separación contenido/reto):
 *  - un RECUERDO (`is_challenge = false`) es solo contenido: foto + lugar visible +
 *    fecha, SIN "Adivina" ni cuenta atrás. No lleva chip de reto.
 *  - un RETO lleva chip "🎯 Reto" para distinguirlo; si está EN JUEGO añade el badge
 *    "EN JUEGO" y la única acción cálida "Adivina →" (regla del pivote: jugar es
 *    capa, no peaje — un reto ya cerrado se ve y ya).
 *
 * RETO PROPIO EN JUEGO (issue #578): el creador no puede jugar su propio reto (guarda
 * "Este reto es tuyo", #513), así que su tarjeta NUNCA ofrece "Adivina →" — sería un
 * botón que promete algo imposible. Mantiene el badge "EN JUEGO" (sigue en curso) pero
 * el hueco del CTA pasa a informar del recuento real de jugadas ("N han jugado" /
 * "Esperando jugadas" si aún nadie jugó). Tocar la tarjeta sigue abriendo el detalle.
 *
 * FOTO SORPRESA (issue #655): un reto EN JUEGO/práctica con `photoIsHint: false` no
 * pinta `moment.imageUrl` a pelo — sería destriparlo antes de que nadie vote.
 * `resolveMomentPhoto` (lib/trip.ts, misma regla que la pestaña Fotos) decide la
 * foto real a mostrar y si hace falta el sello "Sorpresa"; el creador (`isOwn`) SÍ
 * ve su propia foto en preview, con el mismo sello para que sepa que el resto
 * del grupo aún no la ve.
 */
export function MomentCard({ moment, selected, onExpand, onPlay, onShare }: Props) {
  const isActive = moment.status === 'active'
  // Lleva capa de reto (en juego, cerrado o práctica) → chip "🎯 Reto". Un recuerdo
  // puro no lo lleva: la tarjeta lee como contenido, no como juego.
  const isReto = moment.isChallenge && moment.status !== 'recuerdo'
  // Recuerdo puro (contenido, no juego): ni reto ni en juego → marca de filete
  // izquierdo para diferenciarlo de un vistazo del contenido de juego.
  const isRecuerdo = !isReto && !isActive
  const date = formatMomentDate(moment.date)
  // Nombre del lugar resuelto (país), si ya lo conocemos. Va como EYEBROW sobre la
  // pregunta, en su propio renglón dentro del mismo bloque de texto: así el nombre
  // del lugar y la pregunta jamás se solapan (bug nº1 del test de diseño).
  const placeName = moment.country?.name ?? null
  const { src: photoSrc, surprise } = resolveMomentPhoto(moment)

  return (
    <article
      className={[styles.card, selected ? styles.selected : '', isRecuerdo ? styles.recuerdo : '']
        .filter(Boolean)
        .join(' ')}
    >
      {/* Tocar la foto CENTRA su pin en el mapa y ABRE la hoja de detalle (foto en
          grande). Un solo gesto claro — sin botón de "ampliar" suelto, que se perdía
          sobre fotos claras. El zoom real de la imagen vive ya en el detalle. */}
      <ChallengePhoto
        src={photoSrc}
        alt={moment.title}
        ratio="wide"
        zoomable={false}
        onClick={onExpand}
        className={styles.photo}
      />

      {/* Badge ▶ (issue #649): el momento tiene un clip de vídeo — su fotograma-
          portada ya ES la foto de la tarjeta (ver AddMoment), así que basta con
          señalarlo encima. `moment.videoUrl` solo llega en un RECUERDO (nunca en
          un reto, ver `lib/trip.ts`), así que no hace falta comprobar `isRecuerdo`
          aparte. No interactivo: tocar la tarjeta ya abre el detalle (con el
          player), como cualquier otra foto. */}
      {moment.videoUrl && (
        <div className={styles.videoBadge} data-testid="video-badge" aria-hidden="true">
          <Icon icon={Play} size={16} fill="currentColor" />
        </div>
      )}

      {/* Icono "Compartir reto" (issue #758): 1 tap en la tarjeta SELECCIONADA de
          un reto EN JUEGO → `ShareChallengeModal` directo (lo cablea TripDiario).
          Misma esquina sup-izq que la bandera de país: nunca colisionan, un reto
          activo todavía no tiene país resuelto (solo los CERRADOS lo tienen). */}
      {selected && isActive && onShare && (
        <button
          type="button"
          className={styles.shareBtn}
          onClick={onShare}
          aria-label="Compartir reto"
        >
          <Icon icon={Share2} size={16} />
        </button>
      )}

      {/* Bandera del país en disco de vidrio, esquina sup-izq (estilo Polarsteps).
          Solo aparece cuando el país ya se ha resuelto (CERRADOS con coord); si aún
          no hay, no pintamos nada (sin placeholder). No colisiona con el badge EN
          JUEGO porque los activos no tienen coord ni país. */}
      {moment.country?.flag && (
        <div className={styles.flag} aria-hidden="true">
          <span className={styles.flagEmoji}>{moment.country.flag}</span>
        </div>
      )}

      {/* Sello "Sorpresa" (issue #655): disco de vidrio esquina sup-der (mismo
          lenguaje que la bandera) cuando la foto sigue siendo secreta para el
          grupo — se pinte (preview del creador) o no (placeholder de marca). Sin
          texto: el candado ya lo dice, `aria-label` lleva el detalle a lectores
          de pantalla. */}
      {surprise && (
        <div
          className={styles.surprise}
          role="img"
          aria-label="Foto sorpresa: se revela al cerrar el reto"
        >
          <IconCandado size={14} />
        </div>
      )}

      {/* Overlay sobre la foto: contenedor a sangre + velo de legibilidad, sin
          gestos propios (el CTA de dentro es la única excepción interactiva). */}
      <div className={styles.overlay}>
        {/* Fila del pie: bloque de texto + CTA/pill EN JUEGO en la MISMA fila flex
            (issue #593, tarjeta EN JUEGO desordenada). Antes el CTA vivía absoluto
            en la esquina y el texto ocupaba el ancho completo por su cuenta: un
            título de 2 líneas podía extenderse bajo la pill. Con flex + `min-width:
            0` en `.body`, el texto SIEMPRE reserva el hueco del CTA — nunca se pisan. */}
        <div className={styles.foot}>
          {/* aria-hidden: el contenido textual ya vive accesible vía el alt de la
              foto-botón; el CTA de al lado SÍ queda en el árbol de accesibilidad
              (no hereda este aria-hidden, es un hermano). */}
          <div className={styles.body} aria-hidden="true">
            {/* Chip de estado, sobre el título (no colisiona con la bandera sup-izq ni
                el botón expandir sup-der). Un reto EN JUEGO lleva "EN JUEGO" (cálido,
                pulsa); un reto cerrado/práctica, el chip "🎯 Reto" que lo distingue del
                recuerdo. Un recuerdo no lleva chip: lee como contenido, no como juego. */}
            {isActive ? (
              <span className={styles.chip}>
                <Badge tone="live" dot>
                  EN JUEGO
                </Badge>
              </span>
            ) : isReto ? (
              <span className={styles.chip}>
                <Badge tone="accent">
                  <IconDiana size={13} /> Reto
                </Badge>
              </span>
            ) : null}
            {/* Nombre del lugar como EYEBROW (versalita) sobre la pregunta. Solo si ya
                lo conocemos; si no, la pregunta manda sola. Un único bloque apilado
                (eyebrow + título) sobre el velo del pie: nunca dos textos sueltos. */}
            {placeName && <p className={styles.place}>{placeName}</p>}
            <p className={styles.title}>{moment.title}</p>
            <div className={styles.meta}>
              {date && <span className={styles.date}>{date}</span>}
              <span className={styles.social}>
                <Icon icon={User} size={14} /> {moment.guessedCount}
              </span>
            </div>
          </div>

          {/* CTA cálido SOLO si está en juego Y no es mío. */}
          {isActive && !moment.isOwn && onPlay && (
            <div className={styles.ctaSlot}>
              <Button size="sm" onClick={onPlay}>
                Adivina →
              </Button>
            </div>
          )}

          {/* Reto propio EN JUEGO: sin CTA (no puedo adivinar mi propio reto, #513) —
              en su lugar, el recuento real de jugadas. No es un botón: no promete
              ninguna acción, solo informa. */}
          {isActive && moment.isOwn && (
            <div className={styles.ctaSlot}>
              <span className={styles.ownStatus}>
                <Icon icon={User} size={14} />
                {moment.guessedCount > 0
                  ? `${moment.guessedCount} han jugado`
                  : 'Esperando jugadas'}
              </span>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
