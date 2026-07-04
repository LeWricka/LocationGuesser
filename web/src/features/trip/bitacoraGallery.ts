/**
 * Lógica PURA de la pestaña BITÁCORA del viaje (antes "Fotos", issue #645; el
 * diario que se hojea, esta issue): agrupa los momentos del viaje por día y,
 * dentro de cada día, conserva sus recuerdos EN ORDEN — cada uno con toda su
 * galería resuelta, lista para pintarse a ancho completo (nunca en rejilla: el
 * dueño quiere ver las fotos sin hacer clics). Aparte de `BitacoraTab.tsx` (que
 * solo puede exportar el componente, regla `react-refresh/only-export-components`)
 * para poder testearla sin montar React — mismo patrón que
 * `pinMarkers.ts`/`routeDraw.ts` en esta carpeta.
 */

/** Una foto ABRIBLE en el visor compartido de la Bitácora. */
export interface BitacoraPhoto {
  src: string
  /**
   * Índice GLOBAL de esta foto en el visor (Lightbox) de TODO el viaje — cruza
   * días y recuerdos, así las flechas/el swipe navegan el viaje entero, no solo
   * la galería de un recuerdo suelto.
   */
  flatIndex: number
}

/**
 * Un recuerdo (o reto ya revelado) con TODA su galería resuelta: kicker de
 * lugar, título, descripción, nota de voz y fotos a ancho completo.
 */
export interface BitacoraMoment {
  momentId: string
  momentTitle: string
  date: string
  description: string | null
  /**
   * Fecha legada incrustada en `description` (issue #686, ver
   * `parseLegacyDescription` en `lib/trip.ts`), YA separada del cuerpo — p.ej.
   * `"17 de julio"`, sin el emoji roto que rompía la letra capitular. `null`
   * si el momento no lleva ese prefijo (todos los momentos con `happened_on`
   * propio, migración 0037, y los que nunca tuvieron fecha embebida).
   */
  dateLabel: string | null
  audioUrl: string | null
  /**
   * Clip corto (issue #649): si existe, se pinta como `<video controls>` con
   * `videoPoster` de portada (mismo criterio que "El clip" de `MomentSheet`).
   * No consume una entrada de `photos`: ya tiene su propio reproductor, no
   * hace falta poder verlo también a pantalla completa en el visor de fotos.
   */
  videoUrl: string | null
  /** Portada del clip (poster del `<video>`), o null sin clip/sin portada. */
  videoPoster: string | null
  /**
   * Lugar del recuerdo (país resuelto por coordenada, mismo dato que la
   * tarjeta-mapa de `MomentSheet`), para el kicker dorado. `null` sin lugar
   * resuelto todavía (o sin lugar).
   */
  placeLabel: string | null
  /** Fotos ABRIBLES en el visor (sin la portada-vídeo, ver `videoUrl`). */
  photos: BitacoraPhoto[]
}

export interface BitacoraDay {
  key: string
  label: string
  /**
   * Lugares distintos del día, únicos y en orden de aparición, para la
   * cabecera ("SALENTO · VALLE DE COCORA"). `null` si ningún recuerdo del día
   * tiene lugar resuelto.
   */
  placesLabel: string | null
  moments: BitacoraMoment[]
}

/** Entrada de un momento YA resuelto (fotos firmadas), previa al agrupado. */
export interface BitacoraMomentInput {
  momentId: string
  momentTitle: string
  date: string
  description: string | null
  /** Ver `BitacoraMoment.dateLabel` — ya resuelto por quien construye el input. */
  dateLabel: string | null
  audioUrl: string | null
  videoUrl: string | null
  placeLabel: string | null
  /** URLs firmadas, en orden de galería (la primera es la portada). */
  photos: string[]
}

/** Una foto del visor compartido, con el id de SU momento (para "Ver el
 * momento" tras cerrarlo — issue #645). */
export interface BitacoraFlatPhoto {
  src: string
  alt: string
  momentId: string
}

export interface BitacoraGrouped {
  days: BitacoraDay[]
  /** Flat de TODAS las fotos abribles del viaje (ver `BitacoraMoment.photos`),
   * en el mismo orden que sus `flatIndex` — alimenta el Lightbox compartido. */
  flatPhotos: BitacoraFlatPhoto[]
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

/**
 * Agrupa momentos YA EN ORDEN CRONOLÓGICO por día, conservando ese orden entre
 * grupos y dentro de cada día (el primer momento del día primero). Asigna el
 * `flatIndex` de cada foto abrible (para el visor) según el mismo recorrido, y
 * compone la etiqueta de lugares de cada cabecera de día.
 */
export function groupMomentsByDay(moments: BitacoraMomentInput[]): BitacoraGrouped {
  const days = new Map<string, BitacoraDay>()
  const dayOrder: string[] = []
  const flatPhotos: BitacoraFlatPhoto[] = []

  for (const m of moments) {
    const key = dayKey(m.date)
    let day = days.get(key)
    if (!day) {
      day = { key, label: dayLabel(m.date), placesLabel: null, moments: [] }
      days.set(key, day)
      dayOrder.push(key)
    }

    // La portada-vídeo (si hay clip) no entra en `photos`: ya tiene su propio
    // reproductor, no hace falta poder abrirla también en el visor de fotos.
    const hasVideo = m.videoUrl != null
    const clickable = hasVideo ? m.photos.slice(1) : m.photos
    const photos: BitacoraPhoto[] = clickable.map((src) => {
      const flatIndex = flatPhotos.length
      flatPhotos.push({ src, alt: m.momentTitle, momentId: m.momentId })
      return { src, flatIndex }
    })

    day.moments.push({
      momentId: m.momentId,
      momentTitle: m.momentTitle,
      date: m.date,
      description: m.description,
      dateLabel: m.dateLabel,
      audioUrl: m.audioUrl,
      videoUrl: m.videoUrl,
      videoPoster: hasVideo ? (m.photos[0] ?? null) : null,
      placeLabel: m.placeLabel,
      photos,
    })

    // Lugares del día (cabecera): únicos, en orden de aparición.
    if (m.placeLabel) {
      const places = day.placesLabel ? day.placesLabel.split(' · ') : []
      if (!places.includes(m.placeLabel)) {
        places.push(m.placeLabel)
        day.placesLabel = places.join(' · ')
      }
    }
  }

  return { days: dayOrder.map((k) => days.get(k) as BitacoraDay), flatPhotos }
}
