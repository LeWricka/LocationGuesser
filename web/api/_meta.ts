// Resolución de metadatos para la previsualización (OG) de un viaje/reto, en el
// SERVIDOR (funciones de Vercel). Lee de Supabase por REST con el SERVICE ROLE
// (env var en Vercel, NUNCA en el repo): salta la RLS (ver migración 0025), así
// que un crawler anónimo —que no tiene sesión ni membresía— puede recibir igual
// el título, el autor y una URL FIRMADA de la portada para pintar la tarjeta.
//
// No usamos el cliente tipado de src/lib (es navegador-only y arrastra
// import.meta.env de Vite); aquí vamos con fetch a la REST API de Supabase, que
// es lo único que necesitamos en el edge/serverless.

export type ShareKind = 'trip' | 'challenge'

export interface ShareMeta {
  kind: ShareKind
  /** Código (id de grupo o de reto) tal cual viene en la ruta limpia. */
  code: string
  /** id de grupo (para construir el hash de destino del cliente). */
  groupId: string
  /** id de reto, solo en `challenge`. */
  challengeId?: string
  /** Título a mostrar (nombre del viaje o título del reto). */
  title: string
  /** Nombre de quien comparte (display_name del dueño/creador), o null. */
  authorName: string | null
  /** Ruta de la portada en el bucket privado `images`, o null si no hay foto. */
  coverPath: string | null
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

function restHeaders(): Record<string, string> {
  return {
    apikey: SERVICE_ROLE,
    Authorization: `Bearer ${SERVICE_ROLE}`,
    'Content-Type': 'application/json',
  }
}

/** ¿Hay credenciales de servidor configuradas? Sin ellas servimos metas genéricas. */
export function hasServerCreds(): boolean {
  return Boolean(SUPABASE_URL && SERVICE_ROLE)
}

async function rest<T>(path: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: restHeaders() })
  if (!res.ok) return []
  return (await res.json()) as T[]
}

async function displayName(userId: string | null): Promise<string | null> {
  if (!userId) return null
  const rows = await rest<{ display_name: string | null }>(
    `profiles?id=eq.${encodeURIComponent(userId)}&select=display_name`,
  )
  return rows[0]?.display_name ?? null
}

/** Portada de un viaje: la foto del reto/recuerdo más reciente con imagen. */
async function tripCover(groupId: string): Promise<string | null> {
  const rows = await rest<{ image_path: string | null }>(
    `challenges?group_id=eq.${encodeURIComponent(groupId)}&image_path=not.is.null&select=image_path&order=created_at.desc&limit=1`,
  )
  return rows[0]?.image_path ?? null
}

/** Resuelve los metadatos de un viaje (grupo) por su código. Null si no existe. */
export async function resolveTripMeta(code: string): Promise<ShareMeta | null> {
  if (!hasServerCreds()) return null
  const rows = await rest<{ id: string; name: string | null; created_by: string | null }>(
    `groups?id=eq.${encodeURIComponent(code)}&select=id,name,created_by&limit=1`,
  )
  const group = rows[0]
  if (!group) return null
  const [authorName, coverPath] = await Promise.all([
    displayName(group.created_by),
    tripCover(group.id),
  ])
  return {
    kind: 'trip',
    code,
    groupId: group.id,
    title: group.name?.trim() || 'Un viaje en Lugares',
    authorName,
    coverPath,
  }
}

/** Resuelve los metadatos de un reto por su código (id). Null si no existe. */
export async function resolveChallengeMeta(code: string): Promise<ShareMeta | null> {
  if (!hasServerCreds()) return null
  const rows = await rest<{
    id: string
    group_id: string
    title: string | null
    image_path: string | null
    created_by: string | null
  }>(
    `challenges?id=eq.${encodeURIComponent(code)}&select=id,group_id,title,image_path,created_by&limit=1`,
  )
  const ch = rows[0]
  if (!ch) return null
  const authorName = await displayName(ch.created_by)
  return {
    kind: 'challenge',
    code,
    groupId: ch.group_id,
    challengeId: ch.id,
    title: ch.title?.trim() || '¿Dónde es esta foto?',
    authorName,
    coverPath: ch.image_path,
  }
}

/** Resuelve metadatos según el tipo. */
export function resolveMeta(kind: ShareKind, code: string): Promise<ShareMeta | null> {
  return kind === 'trip' ? resolveTripMeta(code) : resolveChallengeMeta(code)
}

/**
 * URL FIRMADA (temporal) de una imagen del bucket privado `images`, generada con
 * el service role (la firma no requiere membresía). La usa la función OG para
 * descargar la portada y componerla. Null si no se puede firmar.
 */
export async function signedCoverUrl(path: string, expiresIn = 3600): Promise<string | null> {
  if (!hasServerCreds()) return null
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/images/${encodeURI(path)}`, {
    method: 'POST',
    headers: restHeaders(),
    body: JSON.stringify({ expiresIn }),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { signedURL?: string }
  if (!data.signedURL) return null
  // signedURL viene como ruta relativa (`/object/sign/...`): la hacemos absoluta.
  return `${SUPABASE_URL}/storage/v1${data.signedURL}`
}

// ── Copy de la tarjeta OG (mismo tono que la maqueta compartir.html) ──────────

export function ogHeadline(meta: ShareMeta): string {
  if (meta.kind === 'challenge') {
    return meta.authorName
      ? `${meta.authorName} te reta: ¿dónde es esta foto?`
      : '¿Dónde es esta foto?'
  }
  return meta.authorName
    ? `Vive el viaje de ${meta.authorName} en el mapa`
    : 'Vive este viaje en el mapa'
}

export function ogDescription(meta: ShareMeta): string {
  return meta.kind === 'challenge'
    ? 'Clava el punto en el mapa antes de que acabe la cuenta atrás.'
    : 'Mira cada parada y adivina dónde estaba. Sin instalar nada.'
}

export function ogEyebrow(meta: ShareMeta): string {
  if (meta.kind === 'challenge') {
    return meta.authorName ? `Un reto de ${meta.authorName}` : 'Un reto en Lugares'
  }
  return meta.authorName ? `Un viaje de ${meta.authorName}` : 'Un viaje en Lugares'
}
