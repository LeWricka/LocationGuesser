import { forwardRef } from 'react'
import { ArrowRight, Compass } from 'lucide-react'
import {
  Icon,
  LogoMomentu,
  ShareCardGlobeScene,
  ShareCardObturadorScene,
  WordmarkMomentu,
} from '../../ui'
import styles from './ChallengeShareCard.module.css'

interface Props {
  /** Nombre del reto recién creado. */
  challengeTitle: string
  /** Nombre del viaje al que pertenece (contexto de a quién llega). */
  groupName: string | null
  /**
   * Tipo del reto (`challenge_kind`, issue #880): decide el placeholder SIN
   * FOTO — 'location' pinta el GLOBO (esfera nocturna + ruta + destino, "hay un
   * lugar escondido"), 'number' el OBTURADOR (el mark grande de marca): el
   * globo no tiene sentido para "¿cuánto?". Con foto/portada no se usa.
   */
  kind: 'location' | 'number'
  /** Fondo YA resuelto como data URL (same-origin para el snapshot): cascada
   * foto del reto → portada del viaje → null (cae al fondo de marca). */
  coverDataUrl: string | null
  /** Dominio para el pie (recall de marca; el enlace real va en el caption). */
  domain: string
}

/**
 * Tarjeta-IMAGEN de "¡Reto creado!" (issue #595, poster vertical 1080×1350,
 * mismo formato que `LeaderboardCard`): sustituye al link crudo al compartir por
 * una imagen de marca con el fondo de la foto del reto (o la portada del viaje,
 * o el fondo de marca —globo/obturador según `kind`, issue #880— si no hay
 * ninguna) y, encima, el nombre del reto, del viaje, el lockup y una llamada
 * corta a jugar.
 *
 * Pensada para snapshot con html-to-image: como `LeaderboardCard`, solo usa
 * colores/gradientes/bordes sólidos (sin `backdrop-filter`/`filter`/sombras de
 * glow), que la herramienta de snapshot no rasteriza bien. Se monta fuera del
 * viewport a tamaño real; el ref apunta al nodo raíz que se rasteriza. Función
 * presentacional pura.
 */
export const ChallengeShareCard = forwardRef<HTMLDivElement, Props>(function ChallengeShareCard(
  { challengeTitle, groupName, kind, coverDataUrl, domain },
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
        {/* Sin foto propia ni portada del viaje: fondo de marca (issue #880).
            Ubicación → globo ("hay un lugar escondido"); número → obturador
            (el globo no aplica a "¿cuánto?"). */}
        {!hasCover && (kind === 'location' ? <ShareCardGlobeScene /> : <ShareCardObturadorScene />)}
      </div>
      {/* Velo de lectura al pie: el fondo manda, el texto blanco se lee AA encima. */}
      <div className={styles.scrim} aria-hidden="true" />

      {/* Lockup de marca: obturador (LogoMomentu) + wordmark, como HomeDashboard. */}
      <div className={styles.top}>
        <LogoMomentu size={48} />
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
