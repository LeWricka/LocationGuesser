// Tipos del esquema (formato compatible con `supabase gen types typescript`).
// Mantener en sync con supabase/migrations. Tras hacer `supabase link`, se
// pueden regenerar: `npx supabase gen types typescript --linked > src/lib/database.types.ts`.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      groups: {
        Row: { id: string; created_at: string }
        Insert: { id: string; created_at?: string }
        Update: { id?: string; created_at?: string }
        Relationships: []
      }
      players: {
        Row: {
          id: string
          group_id: string
          name: string
          client_id: string
          pin_hash: string
          created_at: string
        }
        Insert: {
          id?: string
          group_id: string
          name: string
          client_id: string
          pin_hash: string
          created_at?: string
        }
        Update: {
          id?: string
          group_id?: string
          name?: string
          client_id?: string
          pin_hash?: string
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
          player_name: string
          guess_lat: number
          guess_lng: number
          distance_km: number
          points: number
          created_at: string
        }
        Insert: {
          id?: string
          group_id: string
          challenge_id: string
          player_name: string
          guess_lat: number
          guess_lng: number
          distance_km: number
          points: number
          created_at?: string
        }
        Update: {
          id?: string
          group_id?: string
          challenge_id?: string
          player_name?: string
          guess_lat?: number
          guess_lng?: number
          distance_km?: number
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
export type Group = Database['public']['Tables']['groups']['Row']
export type Player = Database['public']['Tables']['players']['Row']
export type Challenge = Database['public']['Tables']['challenges']['Row']
export type Vote = Database['public']['Tables']['votes']['Row']
