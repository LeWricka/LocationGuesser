import { useState } from 'react'
import { Skeleton } from '../../ui'
import styles from './SceneImage.module.css'

interface Props {
  src: string
  alt: string
  /** Clase para el <img> (encaja con el layout del padre: escena, foto…). */
  className?: string
  /** Radio del esqueleto mientras carga (debe casar con el del contenedor). */
  skeletonRadius?: 'sm' | 'md' | 'lg' | 'full'
}

// Foto del reto con estado de carga: muestra un esqueleto con shimmer (UI kit)
// encima hasta que la imagen termina de cargar, para que el hueco no parezca
// roto mientras llega del Storage privado (URL firmada). El esqueleto se anuncia
// como zona de estado; la imagen aparece con un fundido suave al cargar.
//
// `key={src}` desde el padre si la fuente cambia: así el estado de carga se
// reinicia al cambiar de foto (no asumimos que el navegador la tenga en caché).
export function SceneImage({ src, alt, className, skeletonRadius = 'lg' }: Props) {
  const [loaded, setLoaded] = useState(false)

  return (
    <span className={styles.wrap} role={loaded ? undefined : 'status'} aria-busy={!loaded}>
      {!loaded && (
        <span className={styles.skeleton}>
          <Skeleton width="100%" height="100%" radius={skeletonRadius} />
        </span>
      )}
      <img
        className={[className, styles.img, loaded ? styles.imgLoaded : '']
          .filter(Boolean)
          .join(' ')}
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        // Si la imagen falla, quitamos el esqueleto: dejamos el alt visible en
        // vez de un shimmer infinito que parecería colgado.
        onError={() => setLoaded(true)}
      />
    </span>
  )
}
