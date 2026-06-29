import { useMemo } from 'react'
import { haversine } from '../../lib/geo'
import type { Moment, RoutePoint } from '../../lib/trip'
import styles from './TripCover.module.css'

interface Props {
  /** Nombre del viaje (display). Va en cursiva manuscrita. */
  title: string
  /** Línea de participantes ya compuesta ("Tú, Amaia y 3 más"), o vacía. */
  members: string
  /** Todos los momentos (cualquier estado): de aquí sale el span de días. */
  moments: Moment[]
  /** Ruta = momentos cerrados con coord, en orden cronológico: de aquí salen los km. */
  route: RoutePoint[]
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

/**
 * Nº de días que ABARCA el viaje: span inclusivo entre la fecha del primer y el
 * último momento (no nº de días distintos con actividad). Para un diario de
 * viaje "16 DÍAS" es más representativo el tramo total —del día que arrancó al
 * día que terminó— que cuántos días concretos se subió algo: un viaje de dos
 * semanas con fotos solo 3 días sigue siendo un viaje de dos semanas.
 * Normalizamos a medianoche local para contar días de calendario, no horas.
 */
function tripDays(moments: Moment[]): number {
  if (moments.length === 0) return 0
  let min = Infinity
  let max = -Infinity
  for (const m of moments) {
    const d = new Date(m.date)
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    if (day < min) min = day
    if (day > max) max = day
  }
  return Math.round((max - min) / MS_PER_DAY) + 1
}

/**
 * Distancia total del recorrido: suma de haversine entre puntos consecutivos de
 * la ruta (momentos cerrados, ya en orden cronológico). Reusa `geo.ts` —no
 * reimplementamos la fórmula. Solo cuenta tramos "clavados": los activos no
 * tienen coord (anti-spoiler), así que no inflan ni revelan distancia.
 */
function tripKm(route: RoutePoint[]): number {
  let total = 0
  for (let i = 1; i < route.length; i++) {
    total += haversine(route[i - 1], route[i])
  }
  return total
}

// Separador de miles español (16344 → "16.344"). Sin decimales: el dato gigante
// de una portada se lee de un vistazo, no necesita precisión de metro.
const kmFormatter = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 })

/**
 * Portada editorial del viaje (Fase 2, §1.8 del spec): nombre del viaje en
 * cursiva manuscrita + fila de stats con números gigantes (`lg-data`) y
 * etiquetas (`lg-eyebrow`), estilo Polarsteps. Vive dentro del chrome flotante
 * de `TripPage`, sobre el mapa (glass/scrim de tokens): NO tapa el mapa ni
 * bloquea el carrusel —es una pastilla de cabecera, no una capa a pantalla
 * completa. Stats derivadas en cliente, sin tocar BD.
 */
export function TripCover({ title, members, moments, route }: Props) {
  const days = useMemo(() => tripDays(moments), [moments])
  const km = useMemo(() => tripKm(route), [route])
  const stops = moments.length

  return (
    <div className={styles.cover}>
      <h1 className={styles.name}>{title}</h1>
      {members && <p className={styles.members}>{members}</p>}

      <dl className={styles.stats}>
        {days > 0 && (
          <div className={styles.stat}>
            <dd className={`lg-data ${styles.value}`}>{days}</dd>
            <dt className={`lg-eyebrow ${styles.label}`}>{days === 1 ? 'Día' : 'Días'}</dt>
          </div>
        )}
        {km > 0 && (
          <div className={styles.stat}>
            <dd className={`lg-data ${styles.value}`}>{kmFormatter.format(km)}</dd>
            <dt className={`lg-eyebrow ${styles.label}`}>Km</dt>
          </div>
        )}
        {stops > 0 && (
          <div className={styles.stat}>
            <dd className={`lg-data ${styles.value}`}>{stops}</dd>
            <dt className={`lg-eyebrow ${styles.label}`}>{stops === 1 ? 'Momento' : 'Momentos'}</dt>
          </div>
        )}
      </dl>
    </div>
  )
}
