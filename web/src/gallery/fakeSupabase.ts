// Cliente Supabase FALSO para la galería. Reemplaza a `lib/supabase` vía alias de
// Vite SOLO en el entry de galería (ver vite.config.ts, gateado por GALLERY=1), de
// modo que TODAS las funciones de `lib/**` (getGroup, getGroupChallenges, myGroups,
// signedImageUrl, submit_vote, …) reciben datos sembrados sin tocar la red.
//
// No reimplementa PostgREST entero: solo las formas de consulta que usan las
// pantallas de la galería (.from(tabla).select().eq().in().order().maybeSingle(),
// upsert/insert/update/delete no-op, .rpc(nombre), .storage, .channel/.auth). El
// filtrado es el mínimo necesario (eq/in) para que el "mundo" sembrado se sirva
// correcto y determinista. Si una pantalla nueva pide una forma no cubierta, se
// añade aquí (no en features/**).

import {
  ANSWERS,
  CHALLENGES,
  GROUP,
  isEmptyWorld,
  ME_ID,
  MEMBERS,
  MOMENT_IMAGES,
  NAME_BY_USER,
  NUMBER_ANSWERS,
  PHOTO_LABELS,
  PROFILES,
  VOTES,
} from './fixtures'

type Row = Record<string, unknown>
interface QueryResult<T> {
  data: T
  error: { message: string } | null
}

// Devuelve TODAS las filas de una tabla sembrada (sin recortar columnas: el
// `.select(cols)` se ignora salvo para detectar embeds, igual que en una BD donde
// pedir menos columnas no cambia el contenido de las que sí pides).
function rowsFor(table: string): Row[] {
  switch (table) {
    case 'groups':
      return [GROUP as unknown as Row]
    case 'challenges':
      return CHALLENGES as unknown as Row[]
    case 'votes':
      return VOTES as unknown as Row[]
    case 'profiles':
      return PROFILES as unknown as Row[]
    case 'group_members':
      // Mundo vacío (home recién llegada): sin membresías → myGroups() = [].
      if (isEmptyWorld()) return []
      return MEMBERS.map((m) => ({
        group_id: GROUP.id,
        user_id: m.userId,
        role: m.role,
        joined_at: GROUP.created_at,
        // Embed que pide `myGroups`: group_members → groups.
        groups: {
          id: GROUP.id,
          name: GROUP.name,
          created_by: GROUP.created_by,
          created_at: GROUP.created_at,
          closed_at: GROUP.closed_at,
          starts_on: GROUP.starts_on,
          ends_on: GROUP.ends_on,
          cover_image_path: GROUP.cover_image_path,
        },
      }))
    case 'challenge_answers':
      // Respuestas (lat/lng o cifra) SOLO de los retos cerrados (anti-spoiler),
      // igual que la RLS de challenge_answers en prod: los activos no aparecen.
      return CHALLENGES.filter((c) => ANSWERS[c.id] || NUMBER_ANSWERS[c.id] != null).map((c) => ({
        challenge_id: c.id,
        lat: ANSWERS[c.id]?.lat ?? null,
        lng: ANSWERS[c.id]?.lng ?? null,
        answer_number: NUMBER_ANSWERS[c.id] ?? null,
      }))
    case 'moment_images':
      // Galería de fotos del momento: filas sembradas (varias para el recuerdo del
      // ramen). El filtro por challenge_id lo aplica el builder (eq).
      return MOMENT_IMAGES as unknown as Row[]
    default:
      return []
  }
}

interface Filter {
  kind: 'eq' | 'in'
  column: string
  value: unknown
}

// Builder encadenable y "thenable": se resuelve al hacer await sobre él (como el
// builder real de supabase-js). Aplica los filtros eq/in acumulados sobre las
// filas sembradas de la tabla.
class FakeQuery<T = Row[]> implements PromiseLike<QueryResult<T>> {
  private filters: Filter[] = []
  private orderCol: string | null = null
  private orderAsc = true
  private mode: 'many' | 'maybeSingle' | 'single' = 'many'
  // countVotes pide `.select('id', { count: 'exact', head: true })`: no quiere
  // filas, solo el número. Lo recordamos para resolver a `{ count }` en vez de data.
  private headCount = false
  private table: string

  constructor(table: string) {
    this.table = table
  }

  select(_columns?: string, opts?: { count?: string; head?: boolean }): this {
    if (opts?.head) this.headCount = true
    void _columns
    return this
  }
  insert(): this {
    return this
  }
  update(): this {
    return this
  }
  upsert(): this {
    return this
  }
  delete(): this {
    return this
  }
  eq(column: string, value: unknown): this {
    this.filters.push({ kind: 'eq', column, value })
    return this
  }
  in(column: string, value: unknown[]): this {
    this.filters.push({ kind: 'in', column, value })
    return this
  }
  order(column: string, opts?: { ascending?: boolean }): this {
    this.orderCol = column
    this.orderAsc = opts?.ascending ?? true
    return this
  }
  maybeSingle(): FakeQuery<Row | null> {
    this.mode = 'maybeSingle'
    return this as unknown as FakeQuery<Row | null>
  }
  single(): FakeQuery<Row | null> {
    this.mode = 'single'
    return this as unknown as FakeQuery<Row | null>
  }

  private resolveRows(): Row[] {
    let rows = rowsFor(this.table)
    for (const f of this.filters) {
      rows =
        f.kind === 'eq'
          ? rows.filter((r) => r[f.column] === f.value)
          : rows.filter((r) => (f.value as unknown[]).includes(r[f.column]))
    }
    if (this.orderCol) {
      const col = this.orderCol
      rows = [...rows].sort((a, b) => {
        const av = String(a[col] ?? '')
        const bv = String(b[col] ?? '')
        return this.orderAsc ? av.localeCompare(bv) : bv.localeCompare(av)
      })
    }
    return rows
  }

  then<R1 = QueryResult<T>, R2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    const rows = this.resolveRows()
    let result: QueryResult<T>
    if (this.headCount) {
      result = { data: null, count: rows.length, error: null } as unknown as QueryResult<T>
    } else {
      const data = this.mode === 'many' ? rows : ((rows[0] ?? null) as unknown)
      result = { data, error: null } as unknown as QueryResult<T>
    }
    return Promise.resolve(result).then(onfulfilled, onrejected)
  }
}

// ── RPCs: respuestas deterministas para las que tocan las pantallas ──────────
function fakeRpc(name: string, args?: Row): Promise<QueryResult<unknown>> {
  if (name === 'submit_vote' || name === 'submit_number_vote') {
    // El servidor es la autoridad del scoring; en la galería devolvemos un
    // resultado fijo y plausible para que ResultCard/el reveal se pinten.
    const kind = name === 'submit_number_vote'
    const data = {
      points: kind ? 4600 : 4880,
      distance_km: kind ? null : 1.2,
      abs_error: kind ? 15 : null,
      rel_error: kind ? 0.05 : null,
      answer_lat: 35.0095,
      answer_lng: 135.6716,
      answer_number: kind ? 285 : null,
      rank_position: 1,
      rank_total: MEMBERS.length,
    }
    return Promise.resolve({ data, error: null })
  }
  void args
  return Promise.resolve({ data: null, error: null })
}

// ── Storage falso: firma cada path a un SVG data-URI con la etiqueta de la foto,
// así las imágenes se pintan sin red ni bucket. ──────────────────────────────
function photoDataUri(path: string): string {
  const label = PHOTO_LABELS[path] ?? path
  // La etiqueta de la foto stub representa el SUJETO de la imagen (una foto real no
  // lleva texto). La colocamos en el TERCIO SUPERIOR, no en el centro: así no cae en
  // la franja del pie donde el overlay pinta el nombre del lugar y la pregunta, y las
  // capturas de la galería reflejan la maqueta real (el texto del overlay se lee sin
  // un rótulo fantasma detrás).
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2f4a63"/><stop offset="1" stop-color="#16222e"/>
    </linearGradient></defs>
    <rect width="800" height="1000" fill="url(#g)"/>
    <text x="400" y="300" fill="#f6f7f9" font-family="Georgia, serif" font-size="52" text-anchor="middle" opacity="0.72">${label}</text>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const fakeStorage = {
  from() {
    return {
      createSignedUrl(path: string) {
        return Promise.resolve({ data: { signedUrl: photoDataUri(path) }, error: null })
      },
      getPublicUrl(path: string) {
        return { data: { publicUrl: photoDataUri(path) } }
      },
      upload(path: string) {
        return Promise.resolve({ data: { path }, error: null })
      },
    }
  },
}

// ── Auth + Realtime falsos: la sesión la inyecta FakeSession; aquí solo evitamos
// que getSession/onAuthStateChange/channel rompan al montar. ──────────────────
const fakeAuth = {
  getSession() {
    return Promise.resolve({ data: { session: null }, error: null })
  },
  getUser() {
    return Promise.resolve({ data: { user: null }, error: null })
  },
  onAuthStateChange() {
    return { data: { subscription: { unsubscribe() {} } } }
  },
  signOut() {
    return Promise.resolve({ error: null })
  },
  signInWithOtp() {
    return Promise.resolve({ data: {}, error: null })
  },
  verifyOtp() {
    return Promise.resolve({ data: {}, error: null })
  },
}

function fakeChannel() {
  const channel = {
    on() {
      return channel
    },
    subscribe() {
      return channel
    },
  }
  return channel
}

export const supabase = {
  from(table: string) {
    return new FakeQuery(table)
  },
  rpc(name: string, args?: Row) {
    return fakeRpc(name, args)
  },
  storage: fakeStorage,
  auth: fakeAuth,
  channel() {
    return fakeChannel()
  },
  removeChannel() {},
  functions: {
    invoke() {
      return Promise.resolve({ data: null, error: null })
    },
  },
} as const

// Helpers expuestos por si algún caso quiere leer respuestas directamente.
export { ANSWERS, NUMBER_ANSWERS, NAME_BY_USER, ME_ID }
