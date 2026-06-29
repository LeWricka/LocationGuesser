import type { Moment } from '../../lib/trip'
import styles from './MomentTimeline.module.css'

interface Props {
  /** Momentos en orden cronológico ASC (mismo orden que el carrusel). */
  moments: Moment[]
  /** Momento seleccionado (resalta su marca). */
  selectedId: string | null
  /** Tocar una marca → seleccionar ese momento (centra mapa + desplaza carrusel). */
  onSelect: (challengeId: string) => void
}

// Etiqueta corta de la marca: día y mes ("8 abr"). Si la fecha no es válida,
// caemos a un guion para no romper la franja.
const dateFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' })
function shortDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return dateFmt.format(date).replace('.', '')
}

/**
 * Franja temporal sobre el carrusel: una marca por momento en orden cronológico.
 * El momento en juego se distingue (punto cálido pulsante); el seleccionado se
 * resalta. Tocar una marca selecciona ese momento (igual que tocar su tarjeta),
 * lo que centra el mapa en su pin y desplaza el carrusel.
 *
 * MVP ligero: scroll horizontal con snap, cero librerías. Va sobre el mapa, así
 * que usa el chrome de vidrio y texto sobre foto (tokens), legible sobre satélite.
 */
export function MomentTimeline({ moments, selectedId, onSelect }: Props) {
  if (moments.length === 0) return null

  return (
    <nav className={styles.timeline} aria-label="Línea temporal del viaje">
      <ol className={styles.track}>
        {moments.map((m) => {
          const isSelected = m.challengeId === selectedId
          const isActive = m.status === 'active'
          return (
            <li key={m.challengeId} className={styles.item}>
              <button
                type="button"
                className={[
                  styles.mark,
                  isSelected ? styles.selected : '',
                  isActive ? styles.active : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-pressed={isSelected}
                aria-label={`${m.title}${isActive ? ' · en juego' : ''}`}
                onClick={() => onSelect(m.challengeId)}
              >
                <span className={styles.dot} aria-hidden="true" />
                <span className={styles.label}>{isActive ? 'En juego' : shortDate(m.date)}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
