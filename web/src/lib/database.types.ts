// Tipos del esquema (formato compatible con `supabase gen types typescript`).
// Mantener en sync con supabase/migrations. Tras hacer `supabase link`, se
// pueden regenerar: `npx supabase gen types typescript --linked > src/lib/database.types.ts`.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

/**
 * Premios del grupo por POSICIÓN en la clasificación general. Cada puesto es
 * opcional: solo aparece la clave si el dueño definió ese premio (un grupo puede
 * premiar solo el 1º y el último, por ejemplo). Se persiste como jsonb en
 * `groups.prizes`. `last` = el último puesto de la clasificación.
 */
export interface GroupPrizes {
  first?: string
  second?: string
  third?: string
  last?: string
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string
          avatar_url: string | null
          created_at: string
        }
        Insert: {
          id: string
          display_name: string
          avatar_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          display_name?: string
          avatar_url?: string | null
          created_at?: string
        }
        Relationships: []
      }
      group_members: {
        Row: {
          group_id: string
          user_id: string
          role: string
          joined_at: string
        }
        Insert: {
          group_id: string
          user_id: string
          role?: string
          joined_at?: string
        }
        Update: {
          group_id?: string
          user_id?: string
          role?: string
          joined_at?: string
        }
        Relationships: []
      }
      groups: {
        Row: {
          id: string
          name: string | null
          prizes: GroupPrizes | null
          created_by: string | null
          created_at: string
          // Fin de temporada: null = grupo activo; con fecha = cerrado/archivado
          // (solo-lectura). Migración 0019.
          closed_at: string | null
          // Datos del viaje (contenido editorial opcional, null = sin dato). Migración 0027.
          // Rango de fechas de calendario (sin hora/zona): 'YYYY-MM-DD'.
          starts_on: string | null
          ends_on: string | null
          // De qué va y con quién (texto libre). `companions` NO es membresía:
          // es solo informativo (los miembros reales entran por el enlace).
          description: string | null
          companions: string | null
          // Portada del viaje: path en Storage (como challenges.image_path).
          cover_image_path: string | null
        }
        Insert: {
          id: string
          name?: string | null
          prizes?: GroupPrizes | null
          created_by?: string | null
          created_at?: string
          closed_at?: string | null
          starts_on?: string | null
          ends_on?: string | null
          description?: string | null
          companions?: string | null
          cover_image_path?: string | null
        }
        Update: {
          id?: string
          name?: string | null
          prizes?: GroupPrizes | null
          created_by?: string | null
          created_at?: string
          closed_at?: string | null
          starts_on?: string | null
          ends_on?: string | null
          description?: string | null
          companions?: string | null
          cover_image_path?: string | null
        }
        Relationships: []
      }
      challenges: {
        Row: {
          id: string
          group_id: string
          title: string
          // Descripción del día (texto libre opcional, null = sin texto). Migración 0021.
          description: string | null
          // ¿Es un RETO (lleva capa de juego) o un RECUERDO puro? Migración 0022.
          // Default true en BD = los existentes siguen siendo retos (cero regresión).
          is_challenge: boolean
          lat: number
          lng: number
          // Lugar VISIBLE del momento (no es spoiler): se sirve siempre. Para un
          // RECUERDO es su sitio en el mapa; para un RETO la respuesta oculta sigue
          // en lat/lng → challenge_answers. Nullable (un recuerdo puede no tener
          // lugar). Migración 0022.
          place_lat: number | null
          place_lng: number | null
          image_path: string | null
          // Nota de voz opcional (≤60s), path en Storage (bucket images, prefijo
          // audio/<uuid>.<ext>). No es spoiler (como image_path): se sirve siempre.
          // Null = sin nota de voz. Migración 0035.
          audio_path: string | null
          // Clip de vídeo corto opcional (v1: uno solo, ≤15s, ≤40MB), path en
          // Storage (bucket images, prefijo video/<uuid>.<ext>). SOLO para
          // recuerdos: a diferencia de image_path/audio_path, NUNCA se sirve al
          // jugar un reto (ver CHALLENGE_COLUMNS_NO_ANSWER en challenges.ts) — un
          // MP4 puede llevar su propio GPS en los metadatos del contenedor.
          // Null = sin clip. Migración 0036.
          video_path: string | null
          sv_pano_id: string | null
          sv_heading: number | null
          sv_pitch: number | null
          guess_seconds: number | null
          // Nullable desde 0022: un RECUERDO no caduca (solo los retos tienen plazo).
          deadline_at: string | null
          photo_is_hint: boolean
          // Candados de exploración del Street View (false = permitido). Migración 0013.
          sv_lock_move: boolean
          sv_lock_rotate: boolean
          // PRECISIÓN del reto: calibra la D de la puntuación 5000·e^(−km/D).
          // mundo=2000km (default = comportamiento histórico), pais/ciudad/barrio
          // cada vez más estrictos. Migración 0028.
          score_scale: 'mundo' | 'pais' | 'ciudad' | 'barrio'
          // TIPO de reto: location (¿Dónde es?, default histórico) o number
          // (¿Cuánto?, adivinar una cifra). No es spoiler. Migración 0029.
          challenge_kind: 'location' | 'number'
          // Metadatos VISIBLES del reto de número (no spoiler; se sirven al jugar).
          // La pregunta ("¿cuánto costó?"), la unidad (€/km/kg…, ≤8), los decimales
          // a mostrar (0–4) y lo estricto del conteo. Migración 0029.
          number_question: string | null
          number_unit: string | null
          number_decimals: number
          number_tolerance: 'indulgente' | 'normal' | 'estricto'
          // OJO: `answer_number_src` (la cifra correcta de origen) NO se expone aquí:
          // su privilegio de columna está REVOCADO (anti-spoiler, 0029), igual que
          // lat/lng. La respuesta vive oculta en challenge_answers.answer_number.
          // LA VELOCIDAD PUNTÚA (0034, issue #628): en el reto de LUGAR, responder
          // rápido suma y tarde resta, solo con límite por jugada (guess_seconds no
          // null). Default true (ON). No es spoiler.
          time_scoring: boolean
          // Fecha ELEGIDA por el dueño (sin hora/huso): cuándo OCURRIÓ el momento, no
          // cuándo se subió (`created_at`). Null = legado o sin fecha propia, cae a
          // `created_at` como proxy (ver `Moment.date`, lib/trip.ts). No es spoiler:
          // se sirve siempre. Migración 0037 (#566).
          happened_on: string | null
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          group_id: string
          title: string
          description?: string | null
          // Default true en BD: omitirlo crea un reto (compat con createChallenge).
          is_challenge?: boolean
          lat?: number
          lng?: number
          place_lat?: number | null
          place_lng?: number | null
          image_path?: string | null
          // Nota de voz opcional (0035); omitirla deja el momento sin nota.
          audio_path?: string | null
          // Clip de vídeo corto opcional (0036); omitirlo deja el momento sin clip.
          video_path?: string | null
          sv_pano_id?: string | null
          sv_heading?: number | null
          sv_pitch?: number | null
          guess_seconds?: number | null
          deadline_at?: string | null
          photo_is_hint?: boolean
          sv_lock_move?: boolean
          sv_lock_rotate?: boolean
          // Default 'mundo' en BD: omitirlo crea un reto con el scoring histórico.
          score_scale?: 'mundo' | 'pais' | 'ciudad' | 'barrio'
          // Reto de número (0029). Default 'location' en BD: omitirlo crea un reto
          // de lugar (compat con createChallenge/createMoment).
          challenge_kind?: 'location' | 'number'
          number_question?: string | null
          number_unit?: string | null
          number_decimals?: number
          number_tolerance?: 'indulgente' | 'normal' | 'estricto'
          // ENTRADA de la cifra correcta (spoiler): se ESCRIBE pero NO se lee (su
          // privilegio de SELECT está revocado). El trigger la copia a
          // challenge_answers.answer_number. Migración 0029.
          answer_number_src?: number | null
          // Default true en BD: omitirlo crea un reto con la velocidad activada
          // (comportamiento por defecto del issue #628). Migración 0034.
          time_scoring?: boolean
          // Fecha ELEGIDA por el dueño (0037, #566); omitirla deja happened_on null
          // (el diario cae a created_at como proxy).
          happened_on?: string | null
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          group_id?: string
          title?: string
          description?: string | null
          is_challenge?: boolean
          lat?: number
          lng?: number
          place_lat?: number | null
          place_lng?: number | null
          image_path?: string | null
          // Nota de voz opcional (0035); null la quita.
          audio_path?: string | null
          // Clip de vídeo corto opcional (0036); null lo quita.
          video_path?: string | null
          sv_pano_id?: string | null
          sv_heading?: number | null
          sv_pitch?: number | null
          guess_seconds?: number | null
          deadline_at?: string | null
          photo_is_hint?: boolean
          sv_lock_move?: boolean
          sv_lock_rotate?: boolean
          score_scale?: 'mundo' | 'pais' | 'ciudad' | 'barrio'
          // Reto de número (0029).
          challenge_kind?: 'location' | 'number'
          number_question?: string | null
          number_unit?: string | null
          number_decimals?: number
          number_tolerance?: 'indulgente' | 'normal' | 'estricto'
          // Spoiler: se escribe, no se lee (privilegio de SELECT revocado). 0029.
          answer_number_src?: number | null
          // La velocidad puntúa (0034, issue #628).
          time_scoring?: boolean
          // Fecha ELEGIDA por el dueño (0037, #566); null la limpia (cae a created_at).
          happened_on?: string | null
          created_by?: string
          created_at?: string
        }
        Relationships: []
      }
      moment_images: {
        // Galería de fotos de un MOMENTO (recuerdo): N filas por momento. La
        // PORTADA es la de menor `sort_order` y se espeja en `challenges.image_path`.
        // Migración 0023. RLS: SELECT miembro del grupo; INSERT/UPDATE/DELETE dueño.
        Row: {
          id: string
          challenge_id: string
          image_path: string
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          challenge_id: string
          image_path: string
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          challenge_id?: string
          image_path?: string
          sort_order?: number
          created_at?: string
        }
        Relationships: []
      }
      challenge_answers: {
        // La respuesta OCULTA del reto, gobernada por RLS aparte de `challenges`:
        // legible solo si el reto está cerrado o el usuario ya votó (migración 0010).
        // Una fila es O de lugar (lat/lng) O de número (answer_number): constraint
        // XOR por tipo (0029). Por eso lat/lng pasan a nullable.
        Row: {
          challenge_id: string
          lat: number | null
          lng: number | null
          // Reto de número: la cifra correcta (null en retos de lugar). Migración 0029.
          answer_number: number | null
        }
        Insert: {
          challenge_id: string
          lat?: number | null
          lng?: number | null
          answer_number?: number | null
        }
        Update: {
          challenge_id?: string
          lat?: number | null
          lng?: number | null
          answer_number?: number | null
        }
        Relationships: []
      }
      votes: {
        Row: {
          id: string
          group_id: string
          challenge_id: string
          user_id: string
          // null en un voto de timeout (jugó pero no marcó → 0 puntos, sin pin).
          guess_lat: number | null
          guess_lng: number | null
          distance_km: number | null
          // Reto de número: la cifra adivinada y el error absoluto |guess − respuesta|
          // (null en votos de lugar o timeout). `points` es compartido. Migración 0029.
          guess_number: number | null
          abs_error: number | null
          points: number
          // El jugador cambió de pestaña/app durante la jugada (anti-trampa). Migración 0015.
          left_app: boolean
          // Segundos que tardó el jugador en votar (null en histórico previo). Migración 0016.
          elapsed_seconds: number | null
          // Instante en que el servidor registró el arranque (RPC start_play),
          // copiado aquí al confirmar el voto. Null = sin arranque registrado
          // (legacy, reto sin límite, o start_play falló). Migración 0034 (#628).
          play_started_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          group_id: string
          challenge_id: string
          user_id: string
          guess_lat?: number | null
          guess_lng?: number | null
          distance_km?: number | null
          guess_number?: number | null
          abs_error?: number | null
          points: number
          left_app?: boolean
          elapsed_seconds?: number | null
          play_started_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          group_id?: string
          challenge_id?: string
          user_id?: string
          guess_lat?: number | null
          guess_lng?: number | null
          distance_km?: number | null
          guess_number?: number | null
          abs_error?: number | null
          points?: number
          left_app?: boolean
          elapsed_seconds?: number | null
          play_started_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        // Suscripciones Web Push (una por dispositivo/navegador). RLS: cada
        // usuario gestiona solo las suyas (user_id = auth.uid()). Migración 0014.
        Row: {
          id: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          endpoint?: string
          p256dh?: string
          auth?: string
          created_at?: string
        }
        Relationships: []
      }
      group_invites: {
        // Enlaces de invitación de UN SOLO USO que ascienden directamente a un
        // rol (hoy solo 'owner') al canjearse, vía la RPC `redeem_owner_invite`.
        // RLS: INSERT/SELECT solo dueños del grupo; sin SELECT público (el
        // token no se enumera). Migración 0038.
        Row: {
          token: string
          group_id: string
          role: string
          created_by: string
          created_at: string
          expires_at: string
          used_by: string | null
          used_at: string | null
        }
        Insert: {
          token?: string
          group_id: string
          role: string
          created_by: string
          created_at?: string
          expires_at?: string
          used_by?: string | null
          used_at?: string | null
        }
        Update: {
          token?: string
          group_id?: string
          role?: string
          created_by?: string
          created_at?: string
          expires_at?: string
          used_by?: string | null
          used_at?: string | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      // RPC con autoridad de servidor: recibe la adivinanza (lat/lng null = voto de
      // timeout), calcula distancia y puntos server-side contra la respuesta real y
      // devuelve el revelado. Migración 0010. Devuelve un array de una fila.
      submit_vote: {
        Args: {
          p_challenge_id: string
          p_lat: number | null
          p_lng: number | null
          // El jugador salió de la app durante la jugada (anti-trampa). Migración 0015.
          // Opcional con default false: clientes antiguos siguen funcionando.
          p_left_app?: boolean
          // Segundos que tardó el jugador en votar. Opcional (default null). Migración 0016.
          p_elapsed_seconds?: number | null
        }
        Returns: {
          distance_km: number | null
          points: number
          answer_lat: number | null
          answer_lng: number | null
          // Factor de velocidad REALMENTE aplicado (1 = no aplicó: 'Libre',
          // time_scoring=false, legacy o sin arranque registrado). Migración 0034
          // (#628); ver `speedFactor` en lib/geo.ts.
          speed_factor: number
        }[]
      }
      // Registra el arranque de la jugada (issue #628): lo llama el cliente al
      // pulsar Empezar, justo antes de la cuenta atrás. NO re-armable (ON CONFLICT
      // DO NOTHING server-side): una segunda llamada para el mismo (reto, jugador)
      // no reinicia el cronómetro. Best-effort: si falla, `submit_vote` aplica
      // factor 1 (degradación honesta). Migración 0034.
      start_play: {
        Args: { p_challenge_id: string }
        Returns: undefined
      }
      // RPC HERMANA de submit_vote para el reto de NÚMERO (¿Cuánto?): recibe la cifra
      // adivinada (p_guess null = voto de timeout), calcula el error relativo y los
      // puntos server-side contra la respuesta oculta y devuelve el revelado. Mismas
      // reglas anti-trampa. Migración 0029. Devuelve un array de una fila.
      submit_number_vote: {
        Args: {
          p_challenge_id: string
          p_guess: number | null
          p_left_app?: boolean
          p_elapsed_seconds?: number | null
        }
        Returns: {
          abs_error: number | null
          rel_error: number | null
          points: number
          answer_number: number | null
        }[]
      }
      // Cerrar la temporada del grupo (closed_at = now). Solo el dueño; SECURITY
      // DEFINER comprueba propiedad. Idempotente. Migración 0019.
      close_group: {
        Args: { p_group_id: string }
        Returns: undefined
      }
      // Reabrir la temporada del grupo (closed_at = null). Solo el dueño.
      // Migración 0019.
      reopen_group: {
        Args: { p_group_id: string }
        Returns: undefined
      }
      // ¿La sesión actual es admin? (allowlist por email del JWT). Migración 0016.
      is_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
      // Resumen por grupo para la vista de admin (excluye grupos de cuentas de
      // prueba). SECURITY DEFINER + comprobación is_admin(). Migración 0016,
      // ampliada en 0018 (engagement, distancia, tiempos, salir-de-app, etc.).
      admin_groups: {
        Args: Record<string, never>
        Returns: {
          group_id: string
          name: string | null
          owner_email: string | null
          created_at: string
          member_count: number
          challenge_count: number
          vote_count: number
          participant_count: number
          // % de miembros que han votado al menos una vez (null si sin miembros).
          active_member_pct: number | null
          // Miembros del grupo que nunca han votado en él.
          lurker_count: number
          // Votos emitidos / votos posibles (miembros × retos), en % (null si denom 0).
          coverage_pct: number | null
          avg_distance_km: number | null
          // display_name del jugador con más puntos totales (null si no hay votos).
          top_player: string | null
          // Última actividad (último reto o voto). Null si no hay ninguno.
          last_activity_at: string | null
          // Actividad en los últimos 14 días.
          is_active: boolean
          // Cadencia propia del grupo: días entre retos (null si <2 retos).
          avg_days_between_challenges: number | null
          left_app_count: number
          left_app_pct: number | null
          // Votos sin pin (jugó sin marcar).
          timeout_count: number
          median_response_seconds: number | null
          median_time_consumed_pct: number | null
        }[]
      }
      // Resumen por reto de un grupo para la vista de admin (incluye la respuesta
      // lat/lng, que el admin puede ver). Migración 0016, ampliada en 0018
      // (no votantes, dispersión, mejor/peor jugador, tipo, autor, estado, etc.).
      admin_group_challenges: {
        Args: {
          p_group_id: string
        }
        Returns: {
          challenge_id: string
          title: string
          created_at: string
          deadline_at: string
          guess_seconds: number | null
          has_image: boolean
          lat: number
          lng: number
          vote_count: number
          // % votantes / miembros del grupo (null si el grupo no tiene miembros).
          participation_pct: number | null
          avg_distance_km: number | null
          avg_points: number | null
          avg_elapsed_seconds: number | null
          avg_time_consumed_pct: number | null
          // Miembros que NO votaron este reto.
          non_voter_count: number
          // Votos sin pin (jugó sin marcar).
          timeout_count: number
          // Dispersión de distancias (solo votos con pin).
          min_distance_km: number | null
          median_distance_km: number | null
          max_distance_km: number | null
          max_points: number | null
          // display_name del voto más cercano / más lejano (null si no hay votos con pin).
          best_player: string | null
          worst_player: string | null
          median_elapsed_seconds: number | null
          median_time_consumed_pct: number | null
          // 'foto_sv' | 'foto' | 'sv' | 'ninguno' según los medios del reto.
          kind: string
          // display_name del creador (null si no hay perfil).
          author: string | null
          // 'practica' | 'cerrado' | 'abierto'.
          status: string
          left_app_count: number
        }[]
      }
      // Agregados globales para la vista de admin (solo grupos reales). Devuelve
      // una única fila. Migración 0016, ampliada en 0018 (salir-de-app, timeouts,
      // mediana de respuesta).
      admin_analytics: {
        Args: Record<string, never>
        Returns: {
          groups_count: number
          challenges_count: number
          participants_count: number
          votes_count: number
          avg_challenges_per_group: number | null
          avg_days_between_challenges: number | null
          avg_votes_per_challenge: number | null
          avg_participation_pct: number | null
          avg_response_seconds: number | null
          avg_time_consumed_pct: number | null
          // % global de votos con salida de la app (null si no hay votos).
          avg_left_app_pct: number | null
          // % global de timeouts (votos sin pin) (null si no hay votos).
          timeout_pct: number | null
          // Mediana global del tiempo de respuesta (segundos).
          median_response_seconds: number | null
        }[]
      }
      // Canjea un enlace de co-dueño (issue #707): valida el token (existe, no
      // usado, no caducado) y asciende — o da de alta — a `auth.uid()` como
      // 'owner' del grupo del token. SECURITY DEFINER, un solo uso. Devuelve el
      // group_id para navegar. Migración 0038.
      redeem_owner_invite: {
        Args: { invite_token: string }
        Returns: string
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

// Atajos de dominio para uso en la app.
export type Profile = Database['public']['Tables']['profiles']['Row']
export type GroupMember = Database['public']['Tables']['group_members']['Row']
export type Group = Database['public']['Tables']['groups']['Row']
export type Challenge = Database['public']['Tables']['challenges']['Row']
export type Vote = Database['public']['Tables']['votes']['Row']
export type ChallengeAnswer = Database['public']['Tables']['challenge_answers']['Row']
export type PushSubscriptionRow = Database['public']['Tables']['push_subscriptions']['Row']
export type GroupInvite = Database['public']['Tables']['group_invites']['Row']
/** Una fila del retorno de la RPC `submit_vote` (revelado al votar). */
export type SubmitVoteResult = Database['public']['Functions']['submit_vote']['Returns'][number]
/** Una fila del retorno de la RPC `submit_number_vote` (revelado del reto de número). */
export type SubmitNumberVoteResult =
  Database['public']['Functions']['submit_number_vote']['Returns'][number]
