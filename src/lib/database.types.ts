export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      chat_messages: {
        Row: {
          card: Json | null
          created_at: string
          id: string
          text: string | null
          user_id: string
          who: string | null
        }
        Insert: {
          card?: Json | null
          created_at?: string
          id?: string
          text?: string | null
          user_id: string
          who?: string | null
        }
        Update: {
          card?: Json | null
          created_at?: string
          id?: string
          text?: string | null
          user_id?: string
          who?: string | null
        }
        Relationships: []
      }
      devices: {
        Row: {
          created_at: string
          fitted_at: string | null
          id: string
          last_replacement: string | null
          lifespan_nights: number | null
          strap_position: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          fitted_at?: string | null
          id?: string
          last_replacement?: string | null
          lifespan_nights?: number | null
          strap_position?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          fitted_at?: string | null
          id?: string
          last_replacement?: string | null
          lifespan_nights?: number | null
          strap_position?: number | null
          user_id?: string
        }
        Relationships: []
      }
      nights: {
        Row: {
          alcohol: boolean
          awake_min: number | null
          created_at: string
          date: string
          deep_min: number | null
          duration_min: number | null
          efficiency: number | null
          ended_at: string | null
          hrv: number | null
          id: string
          light_min: number | null
          longest_quiet_min: number | null
          partner_slept_through: boolean | null
          peak_db: number | null
          position_snores: Json | null
          positions: Json | null
          rem_min: number | null
          resting_hr: number | null
          session_id: string | null
          snore_time_pct: number | null
          snores_by_hour: Json | null
          source: string
          started_at: string | null
          total_snores: number | null
          type_nasal: number | null
          type_palatal: number | null
          type_tongue: number | null
          user_id: string
        }
        Insert: {
          alcohol?: boolean
          awake_min?: number | null
          created_at?: string
          date: string
          deep_min?: number | null
          duration_min?: number | null
          efficiency?: number | null
          ended_at?: string | null
          hrv?: number | null
          id?: string
          light_min?: number | null
          longest_quiet_min?: number | null
          partner_slept_through?: boolean | null
          peak_db?: number | null
          position_snores?: Json | null
          positions?: Json | null
          rem_min?: number | null
          resting_hr?: number | null
          session_id?: string | null
          snore_time_pct?: number | null
          snores_by_hour?: Json | null
          source?: string
          started_at?: string | null
          total_snores?: number | null
          type_nasal?: number | null
          type_palatal?: number | null
          type_tongue?: number | null
          user_id: string
        }
        Update: {
          alcohol?: boolean
          awake_min?: number | null
          created_at?: string
          date?: string
          deep_min?: number | null
          duration_min?: number | null
          efficiency?: number | null
          ended_at?: string | null
          hrv?: number | null
          id?: string
          light_min?: number | null
          longest_quiet_min?: number | null
          partner_slept_through?: boolean | null
          peak_db?: number | null
          position_snores?: Json | null
          positions?: Json | null
          rem_min?: number | null
          resting_hr?: number | null
          session_id?: string | null
          snore_time_pct?: number | null
          snores_by_hour?: Json | null
          source?: string
          started_at?: string | null
          total_snores?: number | null
          type_nasal?: number | null
          type_palatal?: number | null
          type_tongue?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nights_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sleep_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          age_range: string | null
          bmi_range: string | null
          created_at: string
          id: string
          name: string | null
          onboarding: Json
          partner_name: string | null
          partner_notify_morning: boolean
          partner_relation: string | null
          sex: string | null
          ship_to: string | null
          ui_theme: string
          updated_at: string | null
        }
        Insert: {
          age_range?: string | null
          bmi_range?: string | null
          created_at?: string
          id: string
          name?: string | null
          onboarding?: Json
          partner_name?: string | null
          partner_notify_morning?: boolean
          partner_relation?: string | null
          sex?: string | null
          ship_to?: string | null
          ui_theme?: string
          updated_at?: string | null
        }
        Update: {
          age_range?: string | null
          bmi_range?: string | null
          created_at?: string
          id?: string
          name?: string | null
          onboarding?: Json
          partner_name?: string | null
          partner_notify_morning?: boolean
          partner_relation?: string | null
          sex?: string | null
          ship_to?: string | null
          ui_theme?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      recommendations: {
        Row: {
          created_at: string
          emphasis: string | null
          icon_kind: string | null
          id: string
          name: string | null
          price: string | null
          price_subtext: string | null
          quote: string | null
          recommended_on: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          emphasis?: string | null
          icon_kind?: string | null
          id?: string
          name?: string | null
          price?: string | null
          price_subtext?: string | null
          quote?: string | null
          recommended_on?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          emphasis?: string | null
          icon_kind?: string | null
          id?: string
          name?: string | null
          price?: string | null
          price_subtext?: string | null
          quote?: string | null
          recommended_on?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sleep_sessions: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          source: string
          started_at: string
          status: string
          strap_position: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          source?: string
          started_at: string
          status?: string
          strap_position?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          source?: string
          started_at?: string
          status?: string
          strap_position?: number | null
          user_id?: string
        }
        Relationships: []
      }
      snore_events: {
        Row: {
          band_nasal: number | null
          band_palatal: number | null
          band_tongue: number | null
          created_at: string
          duration_ms: number | null
          id: number
          peak_db: number | null
          session_id: string
          ts: string
          user_id: string
        }
        Insert: {
          band_nasal?: number | null
          band_palatal?: number | null
          band_tongue?: number | null
          created_at?: string
          duration_ms?: number | null
          id?: never
          peak_db?: number | null
          session_id: string
          ts: string
          user_id: string
        }
        Update: {
          band_nasal?: number | null
          band_palatal?: number | null
          band_tongue?: number | null
          created_at?: string
          duration_ms?: number | null
          id?: never
          peak_db?: number | null
          session_id?: string
          ts?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "snore_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sleep_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
