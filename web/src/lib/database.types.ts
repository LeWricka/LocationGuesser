// Tipos del esquema (formato compatible con `supabase gen types typescript`).
// Mantener en sync con supabase/migrations. Tras hacer `supabase link`, se
// pueden regenerar: `npx supabase gen types typescript --linked > src/lib/database.types.ts`.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

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
        Row: { id: string; name: string | null; created_by: string | null; created_at: string }
        Insert: {
          id: string
          name?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string | null
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
          created_by?: string
          created_at?: string
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
    Functions: Record<string, never>
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
