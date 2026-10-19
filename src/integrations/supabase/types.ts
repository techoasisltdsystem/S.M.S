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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id: string | null
          actor_name: string | null
          actor_role: string | null
          actor_user_id: string | null
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          school_id: string | null
          target_id: string | null
          target_name: string | null
          target_type: string
          user_agent: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          school_id?: string | null
          target_id?: string | null
          target_name?: string | null
          target_type: string
          user_agent?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          school_id?: string | null
          target_id?: string | null
          target_name?: string | null
          target_type?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      campuses: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name: string
          school_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          school_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          school_id?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          avatar_url: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          emergency_contact: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          school_id: string
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          emergency_contact?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          emergency_contact?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          permission: string
          role: Database["public"]["Enums"]["member_role"]
        }
        Insert: {
          permission: string
          role: Database["public"]["Enums"]["member_role"]
        }
        Update: {
          permission?: string
          role?: Database["public"]["Enums"]["member_role"]
        }
        Relationships: []
      }
      school_config: {
        Row: {
          academic_year_format: string | null
          banner_url: string | null
          country: string | null
          created_at: string
          currency: string | null
          email: string | null
          grading_system: string | null
          id: string
          logo_url: string | null
          phone_number: string | null
          primary_color: string | null
          school_address: string | null
          school_id: string
          school_name: string
          school_type: string | null
          setup_completed: boolean | null
          tagline: string | null
          updated_at: string
        }
        Insert: {
          academic_year_format?: string | null
          banner_url?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          email?: string | null
          grading_system?: string | null
          id?: string
          logo_url?: string | null
          phone_number?: string | null
          primary_color?: string | null
          school_address?: string | null
          school_id: string
          school_name?: string
          school_type?: string | null
          setup_completed?: boolean | null
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          academic_year_format?: string | null
          banner_url?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          email?: string | null
          grading_system?: string | null
          id?: string
          logo_url?: string | null
          phone_number?: string | null
          primary_color?: string | null
          school_address?: string | null
          school_id?: string
          school_name?: string
          school_type?: string | null
          setup_completed?: boolean | null
          tagline?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      school_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          id: string
          membership_id: string
          revoked_at: string | null
          school_id: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          expires_at: string
          id?: string
          membership_id: string
          revoked_at?: string | null
          school_id: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          membership_id?: string
          revoked_at?: string | null
          school_id?: string
          token_hash?: string
        }
        Relationships: []
      }
      school_memberships: {
        Row: {
          campus_id: string | null
          created_at: string
          created_by: string | null
          id: string
          profile_id: string
          role: Database["public"]["Enums"]["member_role"]
          school_id: string
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
        }
        Insert: {
          campus_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          profile_id: string
          role: Database["public"]["Enums"]["member_role"]
          school_id: string
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
        }
        Update: {
          campus_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          school_id?: string
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
        }
        Relationships: []
      }
      schools: {
        Row: {
          country: string
          created_at: string
          currency: string
          id: string
          name: string
          slug: string
          status: Database["public"]["Enums"]["school_status"]
          timezone: string
          updated_at: string
        }
        Insert: {
          country?: string
          created_at?: string
          currency?: string
          id?: string
          name: string
          slug: string
          status?: Database["public"]["Enums"]["school_status"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          country?: string
          created_at?: string
          currency?: string
          id?: string
          name?: string
          slug?: string
          status?: Database["public"]["Enums"]["school_status"]
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { _token: string }; Returns: Json }
      invite_member: {
        Args: { _school: string; _full_name: string; _email: string; _role: Database["public"]["Enums"]["member_role"] }
        Returns: Json
      }
      has_permission: { Args: { _school: string; _permission: string }; Returns: boolean }
      is_member: { Args: { _school: string }; Returns: boolean }
      is_platform_admin: { Args: Record<PropertyKey, never>; Returns: boolean }
      log_session_event: { Args: { _school: string; _action: string }; Returns: undefined }
      my_memberships: {
        Args: Record<PropertyKey, never>
        Returns: {
          school_id: string
          school_name: string
          school_status: Database["public"]["Enums"]["school_status"]
          profile_id: string
          full_name: string
          email: string | null
          avatar_url: string | null
          role: Database["public"]["Enums"]["member_role"]
          permissions: string[]
        }[]
      }
      local_login: { Args: { _email: string; _password: string }; Returns: Json }
      local_logout: { Args: Record<PropertyKey, never>; Returns: undefined }
      local_accept_invitation: { Args: { _token: string; _password: string }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "teacher" | "student" | "parent"
      audit_action: "user_created" | "user_updated" | "user_deleted" | "user_banned" | "user_suspended" | "user_activated" | "role_changed" | "config_updated" | "login" | "logout" | "password_reset" | "permission_changed" | "school_created" | "school_updated" | "member_invited" | "invitation_accepted"
      member_role: "school_admin" | "teacher" | "student" | "parent" | "finance_officer" | "auditor"
      membership_status: "invited" | "active" | "suspended"
      school_status: "active" | "suspended"
      user_status: "active" | "suspended" | "banned" | "inactive"
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
  public: {
    Enums: {
      app_role: ["admin", "teacher", "student", "parent"],
      audit_action: ["user_created", "user_updated", "user_deleted", "user_banned", "user_suspended", "user_activated", "role_changed", "config_updated", "login", "logout", "password_reset", "permission_changed", "school_created", "school_updated", "member_invited", "invitation_accepted"],
      member_role: ["school_admin", "teacher", "student", "parent", "finance_officer", "auditor"],
      membership_status: ["invited", "active", "suspended"],
      school_status: ["active", "suspended"],
      user_status: ["active", "suspended", "banned", "inactive"],
    },
  },
} as const
