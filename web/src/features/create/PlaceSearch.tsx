import { useEffect, useId, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import type { LatLng } from '../../lib/geo'
import { searchPlaces, type PlaceResult } from '../../lib/geocode'
import { Icon, Spinner } from '../../ui'
import styles from './PlaceSearch.module.css'

// Debounce del buscador de sitios: Nominatim limita a ~1 req/s, así que
// esperamos a que el usuario pare de teclear antes de disparar la búsqueda.
const SEARCH_DEBOUNCE_MS = 400
// Umbral mínimo de caracteres para buscar (evita una ráfaga de fetches con
// 1 letra, que casi nunca da un resultado útil).
const SEARCH_MIN_CHARS = 2

interface Props {
  /** Sitio elegido: el caller decide qué hacer con él (marcar el pin, centrar
   * el mapa…). Este componente no sabe nada de Leaflet. */
  onSelect: (point: LatLng) => void
}

/**
 * Campo de búsqueda de sitios por nombre ('Bogotá', 'Fushimi Inari'), pensado
 * para vivir ENCIMA de un mapa (`MapPicker`). Componente propio (sin
 * dependencia de Leaflet) para que sea testeable de forma aislada — issue #522.
 */
export function PlaceSearch({ onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceResult[]>([])
  const [searching, setSearching] = useState(false)
  const resultsId = useId()
  // Descarta respuestas que llegan tarde (p.ej. la búsqueda de una tecla
  // anterior que resuelve después de la última): solo pinta si su id sigue
  // siendo el más reciente.
  const requestIdRef = useRef(0)

  const trimmed = query.trim()
  const showDropdown = trimmed.length >= SEARCH_MIN_CHARS

  useEffect(() => {
    // Query demasiado corta: no hay nada que pedir a la red. NO reseteamos
    // `results`/`searching` aquí (sería setState síncrono derivado del propio
    // query, mejor calculado en el render vía `showDropdown` más abajo); el
    // efecto simplemente no dispara ninguna búsqueda.
    if (!showDropdown) return

    const id = ++requestIdRef.current
    // eslint-disable-next-line react-hooks/set-state-in-effect -- arranca el spinner antes del debounce+fetch async; el resultado llega en el .then()
    setSearching(true)
    const timer = setTimeout(() => {
      void searchPlaces(trimmed).then((found) => {
        if (requestIdRef.current !== id) return
        setResults(found)
        setSearching(false)
      })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [trimmed, showDropdown])

  // Elegir un resultado: avisa al caller y cierra la lista.
  function pick(r: PlaceResult) {
    onSelect({ lat: r.lat, lng: r.lng })
    setQuery('')
    setResults([])
  }

  // Derivados del render: si la query es demasiado corta, no hay lista ni
  // spinner que mostrar aunque el estado interno aún no se haya limpiado.
  const visibleResults = showDropdown ? results : []
  const visibleSearching = showDropdown && searching

  return (
    <div className={styles.wrap}>
      <div className={styles.field}>
        <Icon icon={Search} size={16} className={styles.icon} />
        <input
          type="search"
          className={styles.input}
          placeholder="Busca un sitio…"
          aria-label="Busca un sitio"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={resultsId}
          aria-autocomplete="list"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {visibleSearching && <Spinner size={15} className={styles.spinner} />}
      </div>
      {showDropdown && (
        <ul
          id={resultsId}
          className={styles.results}
          role="listbox"
          aria-label="Resultados de la búsqueda"
        >
          {!visibleSearching && visibleResults.length === 0 && (
            <li className={styles.empty} aria-live="polite">
              Sin resultados
            </li>
          )}
          {visibleResults.map((r, i) => (
            <li key={`${r.lat},${r.lng},${i}`}>
              <button
                type="button"
                className={[styles.resultBtn, 'lg-press'].join(' ')}
                role="option"
                aria-selected={false}
                onClick={() => pick(r)}
              >
                <span className={styles.resultName}>{r.name}</span>
                {r.detail && <span className={styles.resultDetail}>{r.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
