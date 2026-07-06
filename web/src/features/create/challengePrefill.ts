import type { LatLng } from '../../lib/geo'

/**
 * Pre-relleno del reto cuando NACE de un recuerdo (issue de unificación: antes
 * el origen "momento guardado" abría un asistente aparte y más limitado,
 * `CreateChallengeImmersive` — eliminado). Ahora TODO reto que nace de un
 * recuerdo abre el MISMO asistente completo que un reto nuevo
 * (`CreateLocationChallenge`), con esto ya puesto: el pin en el mapa, la foto
 * (quitable, sigue siendo opcional) y el título sugerido.
 *
 * `imagePath` es la foto YA SUBIDA del recuerdo (path en Storage): si está, NO
 * se vuelve a subir (se reutiliza tal cual); su vista previa es `photoUrl`
 * (URL firmada). Desde el FAB "Reto" (sin recuerdo de origen) no se pasa nada.
 */
export interface ChallengePrefill {
  /** Lugar del recuerdo → respuesta oculta del reto (o null si el recuerdo no tenía). */
  point: LatLng | null
  /** Path en Storage de la foto del recuerdo, ya subida (se reutiliza, no se re-sube). */
  imagePath: string | null
  /** URL firmada de la foto del recuerdo para la vista previa (o null). */
  photoUrl: string | null
  /** Título del recuerdo, como propuesta de nombre del reto. */
  title: string
}
