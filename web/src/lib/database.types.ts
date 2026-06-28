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
        }
        Insert: {
          id: string
          name?: string | null
          prizes?: GroupPrizes | null
          created_by?: string | null
          created_at?: string
          closed_at?: string | null
        }
        Update: {
          id?: string
          name?: string | null
          prizes?: GroupPrizes | null
          created_by?: string | null
          created_at?: string
          closed_at?: string | null
        }
        Relationships: []
      }
      challenges: {
        Row: {
          id: string
          group_id: string
          title: string
          lat: number
          lng: number
          image_path: string | null
          sv_pano_id: string | null
          sv_heading: number | null
          sv_pitch: number | null
          guess_seconds: number | null
          deadline_at: string
          photo_is_hint: boolean
          // Candados de exploración del Street View (false = permitido). Migración 0013.
          sv_lock_move: boolean
          sv_lock_rotate: boolean
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          group_id: string
          title: string
          lat: number
          lng: number
          image_path?: string | null
          sv_pano_id?: string | null
          sv_heading?: number | null
          sv_pitch?: number | null
          guess_seconds?: number | null
          deadline_at: string
          photo_is_hint?: boolean
          sv_lock_move?: boolean
          sv_lock_rotate?: boolean
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          group_id?: string
          title?: string
          lat?: number
          lng?: number
          image_path?: string | null
          sv_pano_id?: string | null
          sv_heading?: number | null
          sv_pitch?: number | null
          guess_seconds?: number | null
          deadline_at?: string
          photo_is_hint?: boolean
          sv_lock_move?: boolean
          sv_lock_rotate?: boolean
          created_by?: string
          created_at?: string
        }
        Relationships: []
      }
      challenge_answers: {
        // La respuesta del reto (lat/lng), gobernada por RLS aparte de `challenges`:
        // legible solo si el reto está cerrado o el usuario ya votó (migración 0010).
        Row: {
          challenge_id: string
          lat: number
          lng: number
        }
        Insert: {
          challenge_id: string
          lat: number
          lng: number
        }
        Update: {
          challenge_id?: string
          lat?: number
          lng?: number
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
          points: number
          // El jugador cambió de pestaña/app durante la jugada (anti-trampa). Migración 0015.
          left_app: boolean
          // Segundos que tardó el jugador en votar (null en histórico previo). Migración 0016.
          elapsed_seconds: number | null
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
          points: number
          left_app?: boolean
          elapsed_seconds?: number | null
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
          points?: number
          left_app?: boolean
          elapsed_seconds?: number | null
          created_at?: string
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
/** Una fila del retorno de la RPC `submit_vote` (revelado al votar). */
export type SubmitVoteResult = Database['public']['Functions']['submit_vote']['Returns'][number]
