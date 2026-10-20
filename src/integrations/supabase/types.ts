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
      academic_years: {
        Row: {
          created_at: string
          ends_on: string
          id: string
          is_current: boolean
          name: string
          school_id: string
          starts_on: string
        }
        Insert: {
          created_at?: string
          ends_on: string
          id?: string
          is_current?: boolean
          name: string
          school_id: string
          starts_on: string
        }
        Update: {
          created_at?: string
          ends_on?: string
          id?: string
          is_current?: boolean
          name?: string
          school_id?: string
          starts_on?: string
        }
        Relationships: []
      }
      announcements: {
        Row: {
          audience: Database["public"]["Enums"]["audience"]
          author_name: string | null
          body: string
          class_id: string | null
          created_by: string | null
          id: string
          published_at: string
          school_id: string
          title: string
        }
        Insert: {
          audience?: Database["public"]["Enums"]["audience"]
          author_name?: string | null
          body?: string
          class_id?: string | null
          created_by?: string | null
          id?: string
          published_at?: string
          school_id: string
          title: string
        }
        Update: {
          audience?: Database["public"]["Enums"]["audience"]
          author_name?: string | null
          body?: string
          class_id?: string | null
          created_by?: string | null
          id?: string
          published_at?: string
          school_id?: string
          title?: string
        }
        Relationships: []
      }
      assessments: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          class_id: string
          created_at: string
          created_by: string | null
          due_on: string | null
          id: string
          kind: Database["public"]["Enums"]["assessment_kind"]
          max_score: number
          published_at: string | null
          school_id: string
          status: Database["public"]["Enums"]["assessment_status"]
          subject_id: string
          submitted_at: string | null
          term_id: string | null
          title: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          class_id: string
          created_at?: string
          created_by?: string | null
          due_on?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["assessment_kind"]
          max_score?: number
          published_at?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["assessment_status"]
          subject_id: string
          submitted_at?: string | null
          term_id?: string | null
          title: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          class_id?: string
          created_at?: string
          created_by?: string | null
          due_on?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["assessment_kind"]
          max_score?: number
          published_at?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["assessment_status"]
          subject_id?: string
          submitted_at?: string | null
          term_id?: string | null
          title?: string
        }
        Relationships: []
      }
      attendance_records: {
        Row: {
          id: string
          note: string | null
          recorded_by: string | null
          school_id: string
          session_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          note?: string | null
          recorded_by?: string | null
          school_id: string
          session_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          note?: string | null
          recorded_by?: string | null
          school_id?: string
          session_id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      attendance_sessions: {
        Row: {
          class_id: string
          created_at: string
          id: string
          period: string
          recorded_by: string | null
          school_id: string
          session_date: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          period?: string
          recorded_by?: string | null
          school_id: string
          session_date: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          period?: string
          recorded_by?: string | null
          school_id?: string
          session_date?: string
        }
        Relationships: []
      }
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
      classes: {
        Row: {
          academic_year_id: string
          created_at: string
          form_teacher_id: string | null
          id: string
          level: string | null
          name: string
          room: string | null
          school_id: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          form_teacher_id?: string | null
          id?: string
          level?: string | null
          name: string
          room?: string | null
          school_id: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          form_teacher_id?: string | null
          id?: string
          level?: string | null
          name?: string
          room?: string | null
          school_id?: string
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          class_id: string
          created_at: string
          created_by: string | null
          ended_on: string | null
          enrolled_on: string
          id: string
          school_id: string
          status: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          created_by?: string | null
          ended_on?: string | null
          enrolled_on?: string
          id?: string
          school_id: string
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          created_by?: string | null
          ended_on?: string | null
          enrolled_on?: string
          id?: string
          school_id?: string
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_id?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          audience: Database["public"]["Enums"]["audience"]
          category: Database["public"]["Enums"]["event_category"]
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          location: string | null
          school_id: string
          starts_at: string
          title: string
        }
        Insert: {
          audience?: Database["public"]["Enums"]["audience"]
          category?: Database["public"]["Enums"]["event_category"]
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          location?: string | null
          school_id: string
          starts_at: string
          title: string
        }
        Update: {
          audience?: Database["public"]["Enums"]["audience"]
          category?: Database["public"]["Enums"]["event_category"]
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          location?: string | null
          school_id?: string
          starts_at?: string
          title?: string
        }
        Relationships: []
      }
      guardian_links: {
        Row: {
          created_at: string
          guardian_id: string
          id: string
          relationship: string
          school_id: string
          status: Database["public"]["Enums"]["guardian_link_status"]
          student_id: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          guardian_id: string
          id?: string
          relationship?: string
          school_id: string
          status?: Database["public"]["Enums"]["guardian_link_status"]
          student_id: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          guardian_id?: string
          id?: string
          relationship?: string
          school_id?: string
          status?: Database["public"]["Enums"]["guardian_link_status"]
          student_id?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
      marks: {
        Row: {
          assessment_id: string
          comment: string | null
          entered_by: string | null
          id: string
          school_id: string
          score: number | null
          student_id: string
          updated_at: string
        }
        Insert: {
          assessment_id: string
          comment?: string | null
          entered_by?: string | null
          id?: string
          school_id: string
          score?: number | null
          student_id: string
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          comment?: string | null
          entered_by?: string | null
          id?: string
          school_id?: string
          score?: number | null
          student_id?: string
          updated_at?: string
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
          gender: string | null
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
          gender?: string | null
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
          gender?: string | null
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
      subjects: {
        Row: {
          code: string | null
          created_at: string
          id: string
          name: string
          school_id: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          name: string
          school_id: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          school_id?: string
        }
        Relationships: []
      }
      teaching_assignments: {
        Row: {
          class_id: string
          created_at: string
          id: string
          school_id: string
          subject_id: string
          teacher_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          school_id: string
          subject_id: string
          teacher_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          school_id?: string
          subject_id?: string
          teacher_id?: string
        }
        Relationships: []
      }
      terms: {
        Row: {
          academic_year_id: string
          created_at: string
          ends_on: string
          id: string
          is_current: boolean
          name: string
          school_id: string
          starts_on: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          ends_on: string
          id?: string
          is_current?: boolean
          name: string
          school_id: string
          starts_on: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          ends_on?: string
          id?: string
          is_current?: boolean
          name?: string
          school_id?: string
          starts_on?: string
        }
        Relationships: []
      }
      timetable_slots: {
        Row: {
          class_id: string
          created_at: string
          ends_at: string
          id: string
          room: string | null
          school_id: string
          starts_at: string
          subject_id: string
          teacher_id: string | null
          weekday: number
        }
        Insert: {
          class_id: string
          created_at?: string
          ends_at: string
          id?: string
          room?: string | null
          school_id: string
          starts_at: string
          subject_id: string
          teacher_id?: string | null
          weekday: number
        }
        Update: {
          class_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          room?: string | null
          school_id?: string
          starts_at?: string
          subject_id?: string
          teacher_id?: string | null
          weekday?: number
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
      enroll_student: { Args: { _class: string; _student: string }; Returns: string }
      end_enrollment: { Args: { _enrollment: string; _status: Database["public"]["Enums"]["enrollment_status"] }; Returns: undefined }
      link_guardian: { Args: { _student: string; _guardian: string; _relationship?: string }; Returns: string }
      set_guardian_link_status: { Args: { _link: string; _status: Database["public"]["Enums"]["guardian_link_status"] }; Returns: undefined }
      save_attendance: {
        Args: { _class: string; _date: string; _records: Json; _period?: string }
        Returns: string
      }
      move_assessment: {
        Args: { _assessment: string; _to: Database["public"]["Enums"]["assessment_status"]; _reason?: string }
        Returns: undefined
      }
      school_directory: {
        Args: { _school: string }
        Returns: { profile_id: string; full_name: string; gender: string | null; roles: Database["public"]["Enums"]["member_role"][] }[]
      }
      school_overview: { Args: { _school: string }; Returns: Json }
      student_standing: { Args: { _student: string }; Returns: Json }
      platform_overview: { Args: Record<PropertyKey, never>; Returns: Json }
      platform_schools: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          name: string
          slug: string
          status: Database["public"]["Enums"]["school_status"]
          created_at: string
          admins: number
          teachers: number
          students: number
          parents: number
          invited: number
          last_activity: string | null
        }[]
      }
      set_school_status: {
        Args: { _school: string; _status: Database["public"]["Enums"]["school_status"]; _reason: string }
        Returns: undefined
      }
      platform_create_school: {
        Args: { _name: string; _slug: string; _admin_name: string; _admin_email: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "teacher" | "student" | "parent"
      assessment_kind: "classwork" | "homework" | "quiz" | "test" | "exam"
      assessment_status: "draft" | "submitted" | "approved" | "published"
      attendance_status: "present" | "absent" | "late" | "excused"
      audience: "everyone" | "staff" | "students" | "parents"
      audit_action: "user_created" | "user_updated" | "user_deleted" | "user_banned" | "user_suspended" | "user_activated" | "role_changed" | "config_updated" | "login" | "logout" | "password_reset" | "permission_changed" | "school_created" | "school_updated" | "member_invited" | "invitation_accepted" | "student_enrolled" | "enrollment_changed" | "guardian_linked" | "attendance_corrected" | "results_submitted" | "results_approved" | "results_published" | "results_reopened" | "record_created" | "record_updated" | "record_deleted"
      enrollment_status: "active" | "transferred" | "withdrawn" | "completed"
      event_category: "academic" | "exam" | "sports" | "holiday" | "meeting" | "other"
      guardian_link_status: "pending" | "verified" | "revoked"
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
      assessment_kind: ["classwork", "homework", "quiz", "test", "exam"],
      assessment_status: ["draft", "submitted", "approved", "published"],
      attendance_status: ["present", "absent", "late", "excused"],
      audience: ["everyone", "staff", "students", "parents"],
      audit_action: ["user_created", "user_updated", "user_deleted", "user_banned", "user_suspended", "user_activated", "role_changed", "config_updated", "login", "logout", "password_reset", "permission_changed", "school_created", "school_updated", "member_invited", "invitation_accepted", "student_enrolled", "enrollment_changed", "guardian_linked", "attendance_corrected", "results_submitted", "results_approved", "results_published", "results_reopened", "record_created", "record_updated", "record_deleted"],
      enrollment_status: ["active", "transferred", "withdrawn", "completed"],
      event_category: ["academic", "exam", "sports", "holiday", "meeting", "other"],
      guardian_link_status: ["pending", "verified", "revoked"],
      member_role: ["school_admin", "teacher", "student", "parent", "finance_officer", "auditor"],
      membership_status: ["invited", "active", "suspended"],
      school_status: ["active", "suspended"],
      user_status: ["active", "suspended", "banned", "inactive"],
    },
  },
} as const
