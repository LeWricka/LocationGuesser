// Preferencias de notificaciones push POR TIPO (sección "Notificaciones" del
// perfil). Contrato con el backend (PR en paralelo sobre `supabase/**`):
// `profiles.push_prefs` es un jsonb `{ [kind]: boolean }` donde la CLAVE
// AUSENTE significa activada (`true`) — el backend filtra al enviar. Esta lib
// es el punto único de acceso: la UI no construye el objeto a mano.
//
// TOLERANTE A "COLUMNA AÚN NO EXISTE": mientras la migración del PR paralelo no
// esté aplicada en prod, `profile.push_prefs` llega `undefined` (no `null`) —
// se trata igual que "sin preferencias", nunca rompe.

import { supabase } from './supabase'
import type { PushPrefs } from './database.types'

/** Tipos de aviso que el usuario puede activar/desactivar por separado. */
export type PushKind = 'created' | 'memory' | 'closed' | 'trip_closed'

/**
 * ¿Está activado este tipo de aviso? La clave AUSENTE (o `prefs` nulo/undefined,
 * p.ej. columna aún no migrada) cuenta como activada — el opt-out es explícito.
 */
export function isPushKindEnabled(prefs: PushPrefs | null | undefined, kind: PushKind): boolean {
  return prefs?.[kind] ?? true
}

/**
 * Persiste la preferencia de un tipo de aviso, FUSIONANDO con las demás claves
 * ya guardadas (nunca pisa el jsonb entero: un `update` con solo `{ [kind]:
 * enabled }` borraría las preferencias de los otros tipos). `currentPrefs` es
 * el jsonb ya cargado en el contexto de sesión/perfil — se pasa en vez de leer
 * de BD de nuevo para no gastar un round-trip extra en cada toggle.
 * Devuelve el objeto COMPLETO ya persistido, para que la UI (optimista) pueda
 * resincronizar su estado local si quiere.
 */
export async function setPushPref(
  userId: string,
  kind: PushKind,
  enabled: boolean,
  currentPrefs?: PushPrefs | null,
): Promise<PushPrefs> {
  const next: PushPrefs = { ...(currentPrefs ?? {}), [kind]: enabled }
  const { error } = await supabase.from('profiles').update({ push_prefs: next }).eq('id', userId)
  if (error) throw error
  return next
}
