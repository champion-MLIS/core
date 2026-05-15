// ============================================================================
// AUTO-GENERATED from the Supabase schema. Do not edit by hand.
//
// Regenerate with:
//   (via the Supabase MCP)  generate_typescript_types(project_id=...)
//   (via the CLI)           npx supabase gen types typescript --project-id ...
//
// Source migrations:
//   - init_core_schema
//   - lock_down_with_rls
//   - index_followup_trigger_signal
//   - guest_journey_schema
// ============================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      church_config: {
        Row: {
          cms_kind: string;
          created_at: string;
          id: string;
          links: Json;
          name: string;
          slug: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          cms_kind?: string;
          created_at?: string;
          id?: string;
          links?: Json;
          name: string;
          slug: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          cms_kind?: string;
          created_at?: string;
          id?: string;
          links?: Json;
          name?: string;
          slug?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      communications: {
        Row: {
          approved_by: string | null;
          channel: Database['public']['Enums']['communication_channel'];
          content_summary: string | null;
          created_at: string;
          id: string;
          payload: Json;
          person_pco_id: string;
          response: string | null;
          sent_at: string | null;
          template_used: string | null;
        };
        Insert: {
          approved_by?: string | null;
          channel: Database['public']['Enums']['communication_channel'];
          content_summary?: string | null;
          created_at?: string;
          id?: string;
          payload?: Json;
          person_pco_id: string;
          response?: string | null;
          sent_at?: string | null;
          template_used?: string | null;
        };
        Update: {
          approved_by?: string | null;
          channel?: Database['public']['Enums']['communication_channel'];
          content_summary?: string | null;
          created_at?: string;
          id?: string;
          payload?: Json;
          person_pco_id?: string;
          response?: string | null;
          sent_at?: string | null;
          template_used?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'communications_person_pco_id_fkey';
            columns: ['person_pco_id'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['pco_id'];
          },
        ];
      };
      emails: {
        Row: {
          address: string;
          blocked: boolean;
          created_at: string;
          is_primary: boolean;
          location: string | null;
          pco_id: string;
          person_pco_id: string;
          updated_at: string;
        };
        Insert: {
          address: string;
          blocked?: boolean;
          created_at?: string;
          is_primary?: boolean;
          location?: string | null;
          pco_id: string;
          person_pco_id: string;
          updated_at?: string;
        };
        Update: {
          address?: string;
          blocked?: boolean;
          created_at?: string;
          is_primary?: boolean;
          location?: string | null;
          pco_id?: string;
          person_pco_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'emails_person_pco_id_fkey';
            columns: ['person_pco_id'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['pco_id'];
          },
        ];
      };
      engagement_signals: {
        Row: {
          id: string;
          kind: Database['public']['Enums']['engagement_signal_kind'];
          observed_at: string;
          occurred_at: string;
          payload: Json;
          person_pco_id: string;
          source_pco_id: string | null;
        };
        Insert: {
          id?: string;
          kind: Database['public']['Enums']['engagement_signal_kind'];
          observed_at?: string;
          occurred_at: string;
          payload?: Json;
          person_pco_id: string;
          source_pco_id?: string | null;
        };
        Update: {
          id?: string;
          kind?: Database['public']['Enums']['engagement_signal_kind'];
          observed_at?: string;
          occurred_at?: string;
          payload?: Json;
          person_pco_id?: string;
          source_pco_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'engagement_signals_person_pco_id_fkey';
            columns: ['person_pco_id'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['pco_id'];
          },
        ];
      };
      followup_queue: {
        Row: {
          created_at: string;
          due_at: string;
          id: string;
          payload: Json;
          person_pco_id: string;
          status: Database['public']['Enums']['followup_status'];
          trigger_signal_id: string | null;
          updated_at: string;
          workflow: string;
        };
        Insert: {
          created_at?: string;
          due_at?: string;
          id?: string;
          payload?: Json;
          person_pco_id: string;
          status?: Database['public']['Enums']['followup_status'];
          trigger_signal_id?: string | null;
          updated_at?: string;
          workflow: string;
        };
        Update: {
          created_at?: string;
          due_at?: string;
          id?: string;
          payload?: Json;
          person_pco_id?: string;
          status?: Database['public']['Enums']['followup_status'];
          trigger_signal_id?: string | null;
          updated_at?: string;
          workflow?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'followup_queue_person_pco_id_fkey';
            columns: ['person_pco_id'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['pco_id'];
          },
          {
            foreignKeyName: 'followup_queue_trigger_signal_id_fkey';
            columns: ['trigger_signal_id'];
            isOneToOne: false;
            referencedRelation: 'engagement_signals';
            referencedColumns: ['id'];
          },
        ];
      };
      guest_journeys: {
        Row: {
          cancel_reason: string | null;
          cancelled_at: string | null;
          completed_at: string | null;
          created_at: string;
          enrolled_at: string;
          enrollment_kind: Database['public']['Enums']['engagement_signal_kind'];
          enrollment_signal_id: string | null;
          id: string;
          notes: string | null;
          person_pco_id: string;
          returned_at: string | null;
          status: Database['public']['Enums']['journey_status'];
          updated_at: string;
          workflow_version: string;
        };
        Insert: {
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          enrolled_at?: string;
          enrollment_kind: Database['public']['Enums']['engagement_signal_kind'];
          enrollment_signal_id?: string | null;
          id?: string;
          notes?: string | null;
          person_pco_id: string;
          returned_at?: string | null;
          status?: Database['public']['Enums']['journey_status'];
          updated_at?: string;
          workflow_version?: string;
        };
        Update: {
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          enrolled_at?: string;
          enrollment_kind?: Database['public']['Enums']['engagement_signal_kind'];
          enrollment_signal_id?: string | null;
          id?: string;
          notes?: string | null;
          person_pco_id?: string;
          returned_at?: string | null;
          status?: Database['public']['Enums']['journey_status'];
          updated_at?: string;
          workflow_version?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'guest_journeys_enrollment_signal_id_fkey';
            columns: ['enrollment_signal_id'];
            isOneToOne: false;
            referencedRelation: 'engagement_signals';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'guest_journeys_person_pco_id_fkey';
            columns: ['person_pco_id'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['pco_id'];
          },
        ];
      };
      households: {
        Row: {
          created_at: string;
          member_count: number | null;
          name: string | null;
          pco_id: string;
          primary_contact_pco_id: string | null;
          raw_attributes: Json;
          synced_at: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          member_count?: number | null;
          name?: string | null;
          pco_id: string;
          primary_contact_pco_id?: string | null;
          raw_attributes?: Json;
          synced_at?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          member_count?: number | null;
          name?: string | null;
          pco_id?: string;
          primary_contact_pco_id?: string | null;
          raw_attributes?: Json;
          synced_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      pastoral_flags: {
        Row: {
          assigned_to: string | null;
          id: string;
          notes: string | null;
          person_pco_id: string;
          raised_at: string;
          reason: Database['public']['Enums']['pastoral_flag_reason'];
          resolved_at: string | null;
          resolved_by: string | null;
        };
        Insert: {
          assigned_to?: string | null;
          id?: string;
          notes?: string | null;
          person_pco_id: string;
          raised_at?: string;
          reason: Database['public']['Enums']['pastoral_flag_reason'];
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
        Update: {
          assigned_to?: string | null;
          id?: string;
          notes?: string | null;
          person_pco_id?: string;
          raised_at?: string;
          reason?: Database['public']['Enums']['pastoral_flag_reason'];
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'pastoral_flags_person_pco_id_fkey';
            columns: ['person_pco_id'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['pco_id'];
          },
        ];
      };
      people: {
        Row: {
          birthdate: string | null;
          created_at: string;
          current_stage: Database['public']['Enums']['lifecycle_stage'];
          first_name: string | null;
          first_visit_date: string | null;
          household_pco_id: string | null;
          is_child: boolean | null;
          last_name: string | null;
          last_seen_date: string | null;
          membership: string | null;
          pco_created_at: string;
          pco_id: string;
          pco_updated_at: string | null;
          preferred_name: string | null;
          raw_attributes: Json;
          stage_entered_at: string;
          stage_health: Database['public']['Enums']['stage_health'];
          status: string | null;
          synced_at: string;
          updated_at: string;
        };
        Insert: {
          birthdate?: string | null;
          created_at?: string;
          current_stage?: Database['public']['Enums']['lifecycle_stage'];
          first_name?: string | null;
          first_visit_date?: string | null;
          household_pco_id?: string | null;
          is_child?: boolean | null;
          last_name?: string | null;
          last_seen_date?: string | null;
          membership?: string | null;
          pco_created_at: string;
          pco_id: string;
          pco_updated_at?: string | null;
          preferred_name?: string | null;
          raw_attributes?: Json;
          stage_entered_at?: string;
          stage_health?: Database['public']['Enums']['stage_health'];
          status?: string | null;
          synced_at?: string;
          updated_at?: string;
        };
        Update: {
          birthdate?: string | null;
          created_at?: string;
          current_stage?: Database['public']['Enums']['lifecycle_stage'];
          first_name?: string | null;
          first_visit_date?: string | null;
          household_pco_id?: string | null;
          is_child?: boolean | null;
          last_name?: string | null;
          last_seen_date?: string | null;
          membership?: string | null;
          pco_created_at?: string;
          pco_id?: string;
          pco_updated_at?: string | null;
          preferred_name?: string | null;
          raw_attributes?: Json;
          stage_entered_at?: string;
          stage_health?: Database['public']['Enums']['stage_health'];
          status?: string | null;
          synced_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'people_household_pco_id_fkey';
            columns: ['household_pco_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['pco_id'];
          },
        ];
      };
      phone_numbers: {
        Row: {
          carrier: string | null;
          created_at: string;
          is_primary: boolean;
          location: string | null;
          number: string;
          pco_id: string;
          person_pco_id: string;
          updated_at: string;
        };
        Insert: {
          carrier?: string | null;
          created_at?: string;
          is_primary?: boolean;
          location?: string | null;
          number: string;
          pco_id: string;
          person_pco_id: string;
          updated_at?: string;
        };
        Update: {
          carrier?: string | null;
          created_at?: string;
          is_primary?: boolean;
          location?: string | null;
          number?: string;
          pco_id?: string;
          person_pco_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'phone_numbers_person_pco_id_fkey';
            columns: ['person_pco_id'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['pco_id'];
          },
        ];
      };
      poll_watermarks: {
        Row: {
          last_seen_at: string;
          last_seen_id: string | null;
          poll_completed_at: string;
          poll_started_at: string;
          records_processed: number;
          resource: string;
          source: string;
        };
        Insert: {
          last_seen_at: string;
          last_seen_id?: string | null;
          poll_completed_at?: string;
          poll_started_at?: string;
          records_processed?: number;
          resource: string;
          source: string;
        };
        Update: {
          last_seen_at?: string;
          last_seen_id?: string | null;
          poll_completed_at?: string;
          poll_started_at?: string;
          records_processed?: number;
          resource?: string;
          source?: string;
        };
        Relationships: [];
      };
      stage_transitions: {
        Row: {
          approved_by: string | null;
          from_stage: Database['public']['Enums']['lifecycle_stage'] | null;
          id: string;
          occurred_at: string;
          person_pco_id: string;
          to_stage: Database['public']['Enums']['lifecycle_stage'];
          trigger: string;
        };
        Insert: {
          approved_by?: string | null;
          from_stage?: Database['public']['Enums']['lifecycle_stage'] | null;
          id?: string;
          occurred_at?: string;
          person_pco_id: string;
          to_stage: Database['public']['Enums']['lifecycle_stage'];
          trigger: string;
        };
        Update: {
          approved_by?: string | null;
          from_stage?: Database['public']['Enums']['lifecycle_stage'] | null;
          id?: string;
          occurred_at?: string;
          person_pco_id?: string;
          to_stage?: Database['public']['Enums']['lifecycle_stage'];
          trigger?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'stage_transitions_person_pco_id_fkey';
            columns: ['person_pco_id'];
            isOneToOne: false;
            referencedRelation: 'people';
            referencedColumns: ['pco_id'];
          },
        ];
      };
      touches: {
        Row: {
          completed_at: string | null;
          completed_by: string | null;
          created_at: string;
          due_at: string;
          id: string;
          is_recovery: boolean;
          journey_id: string;
          kind: Database['public']['Enums']['touch_kind'];
          notes: string | null;
          owner_role: Database['public']['Enums']['touch_owner_role'];
          owner_user_id: string | null;
          payload: Json;
          scheduled_for: string;
          status: Database['public']['Enums']['touch_status'];
          touch_number: number;
          updated_at: string;
        };
        Insert: {
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          due_at: string;
          id?: string;
          is_recovery?: boolean;
          journey_id: string;
          kind: Database['public']['Enums']['touch_kind'];
          notes?: string | null;
          owner_role: Database['public']['Enums']['touch_owner_role'];
          owner_user_id?: string | null;
          payload?: Json;
          scheduled_for: string;
          status?: Database['public']['Enums']['touch_status'];
          touch_number: number;
          updated_at?: string;
        };
        Update: {
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          due_at?: string;
          id?: string;
          is_recovery?: boolean;
          journey_id?: string;
          kind?: Database['public']['Enums']['touch_kind'];
          notes?: string | null;
          owner_role?: Database['public']['Enums']['touch_owner_role'];
          owner_user_id?: string | null;
          payload?: Json;
          scheduled_for?: string;
          status?: Database['public']['Enums']['touch_status'];
          touch_number?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'touches_journey_id_fkey';
            columns: ['journey_id'];
            isOneToOne: false;
            referencedRelation: 'guest_journeys';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      communication_channel: 'email' | 'sms' | 'personal_contact';
      engagement_signal_kind:
        | 'connect_card'
        | 'first_giving'
        | 'child_checkin'
        | 'prayer_request'
        | 'service_attendance';
      followup_status:
        | 'pending'
        | 'drafting'
        | 'awaiting_approval'
        | 'sent'
        | 'held'
        | 'overridden';
      journey_status: 'active' | 'returned' | 'completed' | 'cancelled';
      lifecycle_stage: 'guest' | 'connected' | 'grouped' | 'serving' | 'leader';
      pastoral_flag_reason: 'death' | 'crisis' | 'prayer' | 'conflict' | 'sensitive' | 'other';
      stage_health: 'active' | 'at_risk' | 'inactive';
      touch_kind: 'sms' | 'email' | 'handwritten_card' | 'phone_call' | 'event_invite';
      touch_owner_role:
        | 'connections_volunteer'
        | 'senior_pastor'
        | 'connections_pastor'
        | 'lay_volunteer'
        | 'matched_leader';
      touch_status: 'pending' | 'drafting' | 'awaiting_action' | 'completed' | 'missed' | 'na';
    };
    CompositeTypes: { [_ in never]: never };
  };
};
