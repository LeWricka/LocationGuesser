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
        }
        Insert: {
          id: string
          name?: string | null
          prizes?: GroupPrizes | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string | null
          prizes?: GroupPrizes | null
          created_by?: string | null
          created_at?: string
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
        }
        Returns: {
          distance_km: number | null
          points: number
          answer_lat: number | null
          answer_lng: number | null
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
