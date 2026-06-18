// ============================================================================
// AUTO-GENERATED from the Supabase schema. Do not edit by hand.
//
// Regenerate with:
//   (via the Supabase MCP)  generate_typescript_types(project_id=...)
// ============================================================================

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
  public: {
    Tables: {
      church_config: {
        Row: {
          cms_kind: string
          created_at: string
          id: string
          links: Json
          name: string
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          cms_kind?: string
          created_at?: string
          id?: string
          links?: Json
          name: string
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          cms_kind?: string
          created_at?: string
          id?: string
          links?: Json
          name?: string
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      communications: {
        Row: {
          approved_by: string | null
          channel: Database["public"]["Enums"]["communication_channel"]
          content_summary: string | null
          created_at: string
          id: string
          payload: Json
          person_pco_id: string
          response: string | null
          sent_at: string | null
          template_used: string | null
        }
        Insert: {
          approved_by?: string | null
          channel: Database["public"]["Enums"]["communication_channel"]
          content_summary?: string | null
          created_at?: string
          id?: string
          payload?: Json
          person_pco_id: string
          response?: string | null
          sent_at?: string | null
          template_used?: string | null
        }
        Update: {
          approved_by?: string | null
          channel?: Database["public"]["Enums"]["communication_channel"]
          content_summary?: string | null
          created_at?: string
          id?: string
          payload?: Json
          person_pco_id?: string
          response?: string | null
          sent_at?: string | null
          template_used?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communications_person_pco_id_fkey"
            columns: ["person_pco_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["pco_id"]
          },
        ]
      }
      emails: {
        Row: {
          address: string
          blocked: boolean
          created_at: string
          is_primary: boolean
          location: string | null
          pco_id: string
          person_pco_id: string
          updated_at: string
        }
        Insert: {
          address: string
          blocked?: boolean
          created_at?: string
          is_primary?: boolean
          location?: string | null
          pco_id: string
          person_pco_id: string
          updated_at?: string
        }
        Update: {
          address?: string
          blocked?: boolean
          created_at?: string
          is_primary?: boolean
          location?: string | null
          pco_id?: string
          person_pco_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "emails_person_pco_id_fkey"
            columns: ["person_pco_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["pco_id"]
          },
        ]
      }
      engagement_signals: {
        Row: {
          id: string
          kind: Database["public"]["Enums"]["engagement_signal_kind"]
          observed_at: string
          occurred_at: string
          payload: Json
          person_pco_id: string
          source_pco_id: string | null
        }
        Insert: {
          id?: string
          kind: Database["public"]["Enums"]["engagement_signal_kind"]
          observed_at?: string
          occurred_at: string
          payload?: Json
          person_pco_id: string
          source_pco_id?: string | null
        }
        Update: {
          id?: string
          kind?: Database["public"]["Enums"]["engagement_signal_kind"]
          observed_at?: string
          occurred_at?: string
          payload?: Json
          person_pco_id?: string
          source_pco_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engagement_signals_person_pco_id_fkey"
            columns: ["person_pco_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["pco_id"]
          },
        ]
      }
      followup_queue: {
        Row: {
          created_at: string
          due_at: string
          id: string
          payload: Json
          person_pco_id: string
          status: Database["public"]["Enums"]["followup_status"]
          trigger_signal_id: string | null
          updated_at: string
          workflow: string
        }
        Insert: {
          created_at?: string
          due_at?: string
          id?: string
          payload?: Json
          person_pco_id: string
          status?: Database["public"]["Enums"]["followup_status"]
          trigger_signal_id?: string | null
          updated_at?: string
          workflow: string
        }
        Update: {
          created_at?: string
          due_at?: string
          id?: string
          payload?: Json
          person_pco_id?: string
          status?: Database["public"]["Enums"]["followup_status"]
          trigger_signal_id?: string | null
          updated_at?: string
          workflow?: string
        }
        Relationships: [
          {
            foreignKeyName: "followup_queue_person_pco_id_fkey"
            columns: ["person_pco_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["pco_id"]
          },
          {
            foreignKeyName: "followup_queue_trigger_signal_id_fkey"
            columns: ["trigger_signal_id"]
            isOneToOne: false
            referencedRelation: "engagement_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_journeys: {
        Row: {
          assigned_connections_volunteer_id: string | null
          assigned_lay_volunteer_id: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          enrolled_at: string
          enrollment_kind: Database["public"]["Enums"]["engagement_signal_kind"]
          enrollment_signal_id: string | null
          id: string
          notes: string | null
          person_pco_id: string
          returned_at: string | null
          status: Database["public"]["Enums"]["journey_status"]
          updated_at: string
          workflow_version: string
        }
        Insert: {
          assigned_connections_volunteer_id?: string | null
          assigned_lay_volunteer_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          enrolled_at?: string
          enrollment_kind: Database["public"]["Enums"]["engagement_signal_kind"]
          enrollment_signal_id?: string | null
          id?: string
          notes?: string | null
          person_pco_id: string
          returned_at?: string | null
          status?: Database["public"]["Enums"]["journey_status"]
          updated_at?: string
          workflow_version?: string
        }
        Update: {
          assigned_connections_volunteer_id?: string | null
          assigned_lay_volunteer_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          enrolled_at?: string
          enrollment_kind?: Database["public"]["Enums"]["engagement_signal_kind"]
          enrollment_signal_id?: string | null
          id?: string
          notes?: string | null
          person_pco_id?: string
          returned_at?: string | null
          status?: Database["public"]["Enums"]["journey_status"]
          updated_at?: string
          workflow_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_journeys_assigned_connections_volunteer_id_fkey"
            columns: ["assigned_connections_volunteer_id"]
            isOneToOne: false
            referencedRelation: "volunteers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_journeys_assigned_lay_volunteer_id_fkey"
            columns: ["assigned_lay_volunteer_id"]
            isOneToOne: false
            referencedRelation: "volunteers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_journeys_enrollment_signal_id_fkey"
            columns: ["enrollment_signal_id"]
            isOneToOne: false
            referencedRelation: "engagement_signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_journeys_person_pco_id_fkey"
            columns: ["person_pco_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["pco_id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          member_count: number | null
          name: string | null
          pco_id: string
          primary_contact_pco_id: string | null
          raw_attributes: Json
          synced_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          member_count?: number | null
          name?: string | null
          pco_id: string
          primary_contact_pco_id?: string | null
          raw_attributes?: Json
          synced_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          member_count?: number | null
          name?: string | null
          pco_id?: string
          primary_contact_pco_id?: string | null
          raw_attributes?: Json
          synced_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      inbound_responses: {
        Row: {
          auto_reply_body: string | null
          auto_reply_sent: boolean
          body_raw: string
          callback_due_at: string
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          from_phone: string
          id: string
          intent: string
          keyword: string
          message_sid: string
          meta: Json
          notes: string | null
          person_pco_id: string | null
          processing_started_at: string | null
          received_at: string
          status: string
          to_phone: string
          updated_at: string
        }
        Insert: {
          auto_reply_body?: string | null
          auto_reply_sent?: boolean
          body_raw: string
          callback_due_at: string
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          from_phone: string
          id?: string
          intent: string
          keyword: string
          message_sid: string
          meta?: Json
          notes?: string | null
          person_pco_id?: string | null
          processing_started_at?: string | null
          received_at?: string
          status?: string
          to_phone: string
          updated_at?: string
        }
        Update: {
          auto_reply_body?: string | null
          auto_reply_sent?: boolean
          body_raw?: string
          callback_due_at?: string
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          from_phone?: string
          id?: string
          intent?: string
          keyword?: string
          message_sid?: string
          meta?: Json
          notes?: string | null
          person_pco_id?: string | null
          processing_started_at?: string | null
          received_at?: string
          status?: string
          to_phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_responses_person_pco_id_fkey"
            columns: ["person_pco_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["pco_id"]
          },
        ]
      }
      pastoral_flags: {
        Row: {
          assigned_to: string | null
          id: string
          notes: string | null
          person_pco_id: string
          raised_at: string
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          assigned_to?: string | null
          id?: string
          notes?: string | null
          person_pco_id: string
          raised_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          assigned_to?: string | null
          id?: string
          notes?: string | null
          person_pco_id?: string
          raised_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pastoral_flags_person_pco_id_fkey"
            columns: ["person_pco_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["pco_id"]
          },
        ]
      }
      people: {
        Row: {
          birthdate: string | null
          created_at: string
          current_stage: Database["public"]["Enums"]["lifecycle_stage"]
          first_name: string | null
          first_visit_date: string | null
          household_pco_id: string | null
          is_child: boolean | null
          last_name: string | null
          last_seen_date: string | null
          membership: string | null
          pco_created_at: string
          pco_id: string
          pco_updated_at: string | null
          precious_cargo_refs: string[]
          preferred_name: string | null
          raw_attributes: Json
          stage_entered_at: string
          stage_health: Database["public"]["Enums"]["stage_health"]
          status: string | null
          synced_at: string
          updated_at: string
        }
        Insert: {
          birthdate?: string | null
          created_at?: string
          current_stage?: Database["public"]["Enums"]["lifecycle_stage"]
          first_name?: string | null
          first_visit_date?: string | null
          household_pco_id?: string | null
          is_child?: boolean | null
          last_name?: string | null
          last_seen_date?: string | null
          membership?: string | null
          pco_created_at: string
          pco_id: string
          pco_updated_at?: string | null
          precious_cargo_refs?: string[]
          preferred_name?: string | null
          raw_attributes?: Json
          stage_entered_at?: string
          stage_health?: Database["public"]["Enums"]["stage_health"]
          status?: string | null
          synced_at?: string
          updated_at?: string
        }
        Update: {
          birthdate?: string | null
          created_at?: string
          current_stage?: Database["public"]["Enums"]["lifecycle_stage"]
          first_name?: string | null
          first_visit_date?: string | null
          household_pco_id?: string | null
          is_child?: boolean | null
          last_name?: string | null
          last_seen_date?: string | null
          membership?: string | null
          pco_created_at?: string
          pco_id?: string
          pco_updated_at?: string | null
          precious_cargo_refs?: string[]
          preferred_name?: string | null
          raw_attributes?: Json
          stage_entered_at?: string
          stage_health?: Database["public"]["Enums"]["stage_health"]
          status?: string | null
          synced_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_household_pco_id_fkey"
            columns: ["household_pco_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["pco_id"]
          },
        ]
      }
      phone_numbers: {
        Row: {
          carrier: string | null
          created_at: string
          is_primary: boolean
          location: string | null
          number: string
          pco_id: string
          person_pco_id: string
          updated_at: string
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          is_primary?: boolean
          location?: string | null
          number: string
          pco_id: string
          person_pco_id: string
          updated_at?: string
        }
        Update: {
          carrier?: string | null
          created_at?: string
          is_primary?: boolean
          location?: string | null
          number?: string
          pco_id?: string
          person_pco_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "phone_numbers_person_pco_id_fkey"
            columns: ["person_pco_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["pco_id"]
          },
        ]
      }
      poll_watermarks: {
        Row: {
          last_seen_at: string
          last_seen_id: string | null
          poll_completed_at: string
          poll_started_at: string
          records_processed: number
          resource: string
          source: string
        }
        Insert: {
          last_seen_at: string
          last_seen_id?: string | null
          poll_completed_at?: string
          poll_started_at?: string
          records_processed?: number
          resource: string
          source: string
        }
        Update: {
          last_seen_at?: string
          last_seen_id?: string | null
          poll_completed_at?: string
          poll_started_at?: string
          records_processed?: number
          resource?: string
          source?: string
        }
        Relationships: []
      }
      prayer_requests: {
        Row: {
          acknowledged_at: string | null
          acknowledgment_text: string | null
          assigned_to: string | null
          captured_at: string
          channel: string
          content: string
          created_at: string
          escalated_at: string | null
          id: string
          pcpoc_responded_at: string | null
          pcpoc_response_notes: string | null
          person_pco_id: string
          source_signal_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledgment_text?: string | null
          assigned_to?: string | null
          captured_at?: string
          channel: string
          content: string
          created_at?: string
          escalated_at?: string | null
          id?: string
          pcpoc_responded_at?: string | null
          pcpoc_response_notes?: string | null
          person_pco_id: string
          source_signal_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledgment_text?: string | null
          assigned_to?: string | null
          captured_at?: string
          channel?: string
          content?: string
          created_at?: string
          escalated_at?: string | null
          id?: string
          pcpoc_responded_at?: string | null
          pcpoc_response_notes?: string | null
          person_pco_id?: string
          source_signal_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prayer_requests_person_pco_id_fkey"
            columns: ["person_pco_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["pco_id"]
          },
          {
            foreignKeyName: "prayer_requests_source_signal_id_fkey"
            columns: ["source_signal_id"]
            isOneToOne: false
            referencedRelation: "engagement_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          is_default_pcpoc: boolean
          notes: string | null
          pastoral_care: boolean
          pcpoc_alert_recipient: boolean
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          is_default_pcpoc?: boolean
          notes?: string | null
          pastoral_care?: boolean
          pcpoc_alert_recipient?: boolean
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          is_default_pcpoc?: boolean
          notes?: string | null
          pastoral_care?: boolean
          pcpoc_alert_recipient?: boolean
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      stage_transitions: {
        Row: {
          approved_by: string | null
          from_stage: Database["public"]["Enums"]["lifecycle_stage"] | null
          id: string
          occurred_at: string
          person_pco_id: string
          to_stage: Database["public"]["Enums"]["lifecycle_stage"]
          trigger: string
        }
        Insert: {
          approved_by?: string | null
          from_stage?: Database["public"]["Enums"]["lifecycle_stage"] | null
          id?: string
          occurred_at?: string
          person_pco_id: string
          to_stage: Database["public"]["Enums"]["lifecycle_stage"]
          trigger: string
        }
        Update: {
          approved_by?: string | null
          from_stage?: Database["public"]["Enums"]["lifecycle_stage"] | null
          id?: string
          occurred_at?: string
          person_pco_id?: string
          to_stage?: Database["public"]["Enums"]["lifecycle_stage"]
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_transitions_person_pco_id_fkey"
            columns: ["person_pco_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["pco_id"]
          },
        ]
      }
      touches: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          due_at: string
          held_pending_data_at: string | null
          held_pending_data_reason: string | null
          id: string
          is_contextual_reference: boolean
          is_recovery: boolean
          journey_id: string
          kind: Database["public"]["Enums"]["touch_kind"]
          notes: string | null
          owner_role: Database["public"]["Enums"]["touch_owner_role"]
          owner_user_id: string | null
          payload: Json
          scheduled_for: string
          status: Database["public"]["Enums"]["touch_status"]
          touch_number: number
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          due_at: string
          held_pending_data_at?: string | null
          held_pending_data_reason?: string | null
          id?: string
          is_contextual_reference?: boolean
          is_recovery?: boolean
          journey_id: string
          kind: Database["public"]["Enums"]["touch_kind"]
          notes?: string | null
          owner_role: Database["public"]["Enums"]["touch_owner_role"]
          owner_user_id?: string | null
          payload?: Json
          scheduled_for: string
          status?: Database["public"]["Enums"]["touch_status"]
          touch_number: number
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          due_at?: string
          held_pending_data_at?: string | null
          held_pending_data_reason?: string | null
          id?: string
          is_contextual_reference?: boolean
          is_recovery?: boolean
          journey_id?: string
          kind?: Database["public"]["Enums"]["touch_kind"]
          notes?: string | null
          owner_role?: Database["public"]["Enums"]["touch_owner_role"]
          owner_user_id?: string | null
          payload?: Json
          scheduled_for?: string
          status?: Database["public"]["Enums"]["touch_status"]
          touch_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "touches_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "guest_journeys"
            referencedColumns: ["id"]
          },
        ]
      }
      volunteers: {
        Row: {
          created_at: string
          current_load: number
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          person_pco_id: string | null
          role: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          current_load?: number
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          person_pco_id?: string | null
          role: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          current_load?: number
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          person_pco_id?: string | null
          role?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "volunteers_person_pco_id_fkey"
            columns: ["person_pco_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["pco_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_email: { Args: never; Returns: string }
      is_pastoral_care: { Args: never; Returns: boolean }
      is_pcpoc_alert_recipient: { Args: never; Returns: boolean }
    }
    Enums: {
      communication_channel: "email" | "sms" | "personal_contact"
      engagement_signal_kind:
        | "connect_card"
        | "first_giving"
        | "child_checkin"
        | "prayer_request"
        | "service_attendance"
        | "broadcast_response"
      followup_status:
        | "pending"
        | "drafting"
        | "awaiting_approval"
        | "sent"
        | "held"
        | "overridden"
      journey_status: "active" | "returned" | "completed" | "cancelled"
      lifecycle_stage: "guest" | "connected" | "grouped" | "serving" | "leader"
      stage_health: "active" | "at_risk" | "inactive"
      touch_kind:
        | "sms"
        | "email"
        | "handwritten_card"
        | "phone_call"
        | "event_invite"
      touch_owner_role:
        | "connections_volunteer"
        | "senior_pastor"
        | "connections_pastor"
        | "lay_volunteer"
        | "matched_leader"
      touch_status:
        | "pending"
        | "drafting"
        | "awaiting_action"
        | "completed"
        | "missed"
        | "na"
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
      communication_channel: ["email", "sms", "personal_contact"],
      engagement_signal_kind: [
        "connect_card",
        "first_giving",
        "child_checkin",
        "prayer_request",
        "service_attendance",
        "broadcast_response",
      ],
      followup_status: [
        "pending",
        "drafting",
        "awaiting_approval",
        "sent",
        "held",
        "overridden",
      ],
      journey_status: ["active", "returned", "completed", "cancelled"],
      lifecycle_stage: ["guest", "connected", "grouped", "serving", "leader"],
      stage_health: ["active", "at_risk", "inactive"],
      touch_kind: [
        "sms",
        "email",
        "handwritten_card",
        "phone_call",
        "event_invite",
      ],
      touch_owner_role: [
        "connections_volunteer",
        "senior_pastor",
        "connections_pastor",
        "lay_volunteer",
        "matched_leader",
      ],
      touch_status: [
        "pending",
        "drafting",
        "awaiting_action",
        "completed",
        "missed",
        "na",
      ],
    },
  },
} as const
