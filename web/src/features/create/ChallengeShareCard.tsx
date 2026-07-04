import { forwardRef } from 'react'
import { ArrowRight, Compass } from 'lucide-react'
import { Icon, IconPin, WordmarkMomentu } from '../../ui'
import styles from './ChallengeShareCard.module.css'

interface Props {
  /** Nombre del reto recién creado. */
  challengeTitle: string
  /** Nombre del viaje al que pertenece (contexto de a quién llega). */
  groupName: string | null
  /** Fondo YA resuelto como data URL (same-origin para el snapshot): cascada
   * foto del reto → portada del viaje → null (cae al mapa nocturno de marca). */
  coverDataUrl: string | null
  /** Dominio para el pie (recall de marca; el enlace real va en el caption). */
  domain: string
}

/**
 * Tarjeta-IMAGEN de "¡Reto creado!" (issue #595, poster vertical 1080×1350,
 * mismo formato que `LeaderboardCard`): sustituye al link crudo al compartir por
 * una imagen de marca con el fondo de la foto del reto (o la portada del viaje,
 * o el mapa nocturno de marca si no hay ninguna) y, encima, el nombre del reto,
 * del viaje, el wordmark y una llamada corta a jugar.
 *
 * Pensada para snapshot con html-to-image: como `LeaderboardCard`, solo usa
 * colores/gradientes/bordes sólidos (sin `backdrop-filter`/`filter`/sombras de
 * glow), que la herramienta de snapshot no rasteriza bien. Se monta fuera del
 * viewport a tamaño real; el ref apunta al nodo raíz que se rasteriza. Función
 * presentacional pura.
 */
export const ChallengeShareCard = forwardRef<HTMLDivElement, Props>(function ChallengeShareCard(
  { challengeTitle, groupName, coverDataUrl, domain },
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
        {/* Sin foto propia ni portada del viaje: mapa nocturno de marca (mismo
            gradiente grafito/teal + pin que el placeholder de la home, HomeDashboard). */}
        {!hasCover && (
          <span className={styles.nightMap} aria-hidden="true">
            <IconPin size={240} className={styles.nightMapPin} />
          </span>
        )}
      </div>
      {/* Velo de lectura al pie: el fondo manda, el texto blanco se lee AA encima. */}
      <div className={styles.scrim} aria-hidden="true" />

      <div className={styles.top}>
        <WordmarkMomentu size={40} className={styles.wordmark} />
      </div>

      <div className={styles.bottom}>
        <span className={styles.eyebrow}>
          <Icon icon={Compass} size={26} />
          {groupName?.trim() || 'Un viaje'}
        </span>
        <h1 className={styles.title}>{challengeTitle.trim() || 'Reto sin nombre'}</h1>
        <span className={styles.cta}>
          ¿Adivinas dónde?
          <Icon icon={ArrowRight} size={28} />
        </span>
        <span className={styles.domain}>{domain}</span>
      </div>
    </div>
  )
})
