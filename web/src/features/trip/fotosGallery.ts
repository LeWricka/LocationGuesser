/**
 * Lógica PURA de la pestaña Fotos (issue #645): agrupar la galería del viaje
 * por día. Aparte de `FotosTab.tsx` (que solo puede exportar el componente,
 * regla `react-refresh/only-export-components`) para poder testearla sin
 * montar React — mismo patrón que `pinMarkers.ts`/`routeDraw.ts` en esta carpeta.
 */

/** Una foto de la galería del viaje, ya resuelta (URL firmada) y ligada a SU
 * momento (para agrupar por día y para "Ver el momento"). */
export interface GalleryPhoto {
  src: string
  momentId: string
  momentTitle: string
  /** Fecha del MOMENTO (no de la foto individual): agrupa por día como el
   * Diario — todas las fotos de un mismo recuerdo caen bajo su mismo día. */
  date: string
}

export interface DayGroup {
  key: string
  label: string
  photos: (GalleryPhoto & { flatIndex: number })[]
}

// Fecha corta del día ("15 jun"), en UTC para que coincida siempre con `dayKey`
// (evita que un huso horario distinto meta una foto de madrugada en el día de
// al lado entre la agrupación y la etiqueta visible).
const DAY_LABEL_FMT = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

/** Clave de agrupación por día: los 10 primeros caracteres de un ISO
 * (`created_at` ya viene en UTC) son su fecha `YYYY-MM-DD`. Determinista, sin
 * líos de huso horario. */
export function dayKey(iso: string): string {
  return iso.slice(0, 10)
}

/** Fecha corta legible del día ("15 jun"), en UTC (ver `dayKey`). */
export function dayLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  // Intl añade un punto al mes abreviado ("15 jun."); lo quitamos (mismo
  // criterio que `MomentCard.formatMomentDate`).
  return DAY_LABEL_FMT.format(date).replace('.', '')
}

/** Agrupa fotos YA EN ORDEN CRONOLÓGICO por día, conservando ese orden entre
 * grupos (el primer día del viaje primero). */
export function groupPhotosByDay(photos: GalleryPhoto[]): DayGroup[] {
  const groups = new Map<string, DayGroup>()
  photos.forEach((photo, flatIndex) => {
    const key = dayKey(photo.date)
    const existing = groups.get(key)
    if (existing) existing.photos.push({ ...photo, flatIndex })
    else groups.set(key, { key, label: dayLabel(photo.date), photos: [{ ...photo, flatIndex }] })
  })
  return Array.from(groups.values())
}
