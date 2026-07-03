import { forwardRef } from 'react'
import { ArrowRight, Users } from 'lucide-react'
import { Icon, IconPin, WordmarkTabide } from '../../ui'
import styles from './TripInviteCard.module.css'

interface Props {
  /** Nombre del viaje al que se invita. */
  tripName: string
  /** Línea de meta ya formateada ("N viajeros · N retos"), construida por el
   * llamante con `tripInviteMetaLine` (issue #617). */
  metaLine: string
  /** Fondo YA resuelto como data URL (same-origin para el snapshot): cascada
   * portada explícita → foto del último recuerdo → derivada del lugar → null
   * (cae al mapa nocturno de marca). Ver `resolveTripInviteCover`. */
  coverDataUrl: string | null
  /** Dominio para el pie (recall de marca; el enlace real va en el caption). */
  domain: string
}

/**
 * Tarjeta-IMAGEN de "Invitar al viaje" (issue #617), poster vertical 1080×1350
 * — mismo formato que `ChallengeShareCard`/`LeaderboardCard`: sustituye al link
 * crudo al compartir por una imagen de marca con la portada del viaje (o el
 * mapa nocturno de marca si no hay ninguna) y, encima, el nombre del viaje, la
 * línea de viajeros/retos, el wordmark y una llamada a unirse.
 *
 * Pensada para snapshot con html-to-image: como `ChallengeShareCard`, solo usa
 * colores/gradientes/bordes sólidos (sin `backdrop-filter`/`filter`/sombras de
 * glow), que la herramienta de snapshot no rasteriza bien. Se monta fuera del
 * viewport a tamaño real; el ref apunta al nodo raíz que se rasteriza. Función
 * presentacional pura.
 */
export const TripInviteCard = forwardRef<HTMLDivElement, Props>(function TripInviteCard(
  { tripName, metaLine, coverDataUrl, domain },
  ref,
) {
  const hasCover = Boolean(coverDataUrl)

  return (
    <div ref={ref} className={styles.card}>
      <div
        className={styles.media}
        style={hasCover ? { backgroundImage: `url('${coverDataUrl}')` } : undefined}
        aria-hidden="true"
      >
        {/* Sin portada resuelta: mapa nocturno de marca (mismo gradiente
            grafito/teal + pin que el placeholder de la home, HomeDashboard). */}
        {!hasCover && (
          <span className={styles.nightMap} aria-hidden="true">
            <IconPin size={240} className={styles.nightMapPin} />
          </span>
        )}
      </div>
      {/* Velo de lectura al pie: el fondo manda, el texto blanco se lee AA encima. */}
      <div className={styles.scrim} aria-hidden="true" />

      <div className={styles.top}>
        <WordmarkTabide size={40} className={styles.wordmark} />
      </div>

      <div className={styles.bottom}>
        <span className={styles.eyebrow}>
          <Icon icon={Users} size={26} />
          {metaLine}
        </span>
        <h1 className={styles.title}>{tripName.trim() || 'Un viaje'}</h1>
        <span className={styles.cta}>
          Únete al viaje
          <Icon icon={ArrowRight} size={28} />
        </span>
        <span className={styles.domain}>{domain}</span>
      </div>
    </div>
  )
})
