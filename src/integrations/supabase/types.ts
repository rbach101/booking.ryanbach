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
      appointment_reminders: {
        Row: {
          booking_id: string
          created_at: string
          error_message: string | null
          id: string
          reminder_type: string
          sent_at: string
          sent_via: string
          status: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          reminder_type: string
          sent_at?: string
          sent_via: string
          status?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          reminder_type?: string
          sent_at?: string
          sent_via?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_reminders_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          resource_id: string | null
          resource_type: string
          user_email: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          resource_id?: string | null
          resource_type: string
          user_email?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          resource_id?: string | null
          resource_type?: string
          user_email?: string | null
          user_id?: string
        }
        Relationships: []
      }
      availability_blocks: {
        Row: {
          created_at: string
          day_of_week: number | null
          end_time: string
          id: string
          is_available: boolean | null
          practitioner_id: string | null
          start_time: string
        }
        Insert: {
          created_at?: string
          day_of_week?: number | null
          end_time: string
          id?: string
          is_available?: boolean | null
          practitioner_id?: string | null
          start_time: string
        }
        Update: {
          created_at?: string
          day_of_week?: number | null
          end_time?: string
          id?: string
          is_available?: boolean | null
          practitioner_id?: string | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_blocks_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_blocks_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners_public"
            referencedColumns: ["id"]
          },
        ]
      }
      baa_signatures: {
        Row: {
          baa_version: string
          created_at: string
          id: string
          ip_address: string | null
          organization_name: string | null
          signature_data: string
          signed_at: string
          signer_email: string
          signer_name: string
          signer_title: string | null
          user_id: string
        }
        Insert: {
          baa_version?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          organization_name?: string | null
          signature_data: string
          signed_at?: string
          signer_email: string
          signer_name: string
          signer_title?: string | null
          user_id: string
        }
        Update: {
          baa_version?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          organization_name?: string | null
          signature_data?: string
          signed_at?: string
          signer_email?: string
          signer_name?: string
          signer_title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      booking_extras: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          name: string
          price: number
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name: string
          price?: number
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name?: string
          price?: number
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      booking_incidents: {
        Row: {
          booking_id: string
          created_at: string
          customer_id: string | null
          fee_amount: number | null
          fee_charged: boolean | null
          fee_waived: boolean | null
          id: string
          incident_type: string
          notes: string | null
          waived_by: string | null
          waived_reason: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          customer_id?: string | null
          fee_amount?: number | null
          fee_charged?: boolean | null
          fee_waived?: boolean | null
          id?: string
          incident_type: string
          notes?: string | null
          waived_by?: string | null
          waived_reason?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          customer_id?: string | null
          fee_amount?: number | null
          fee_charged?: boolean | null
          fee_waived?: boolean | null
          id?: string
          incident_type?: string
          notes?: string | null
          waived_by?: string | null
          waived_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_incidents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_incidents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_payments: {
        Row: {
          amount: number
          booking_id: string
          created_at: string
          id: string
          paid_at: string | null
          sent_at: string | null
          sent_to_email: string | null
          sent_to_phone: string | null
          status: string
          stripe_checkout_url: string | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string
          id?: string
          paid_at?: string | null
          sent_at?: string | null
          sent_to_email?: string | null
          sent_to_phone?: string | null
          status?: string
          stripe_checkout_url?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string
          id?: string
          paid_at?: string | null
          sent_at?: string | null
          sent_to_email?: string | null
          sent_to_phone?: string | null
          status?: string
          stripe_checkout_url?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          approved_by_practitioner_1: string | null
          approved_by_practitioner_2: string | null
          balance_due: number | null
          balance_paid: boolean | null
          booking_date: string
          client_email: string
          client_name: string
          client_phone: string | null
          consent_email: boolean
          consent_sms: boolean
          created_at: string
          customer_id: string | null
          deposit_paid: boolean | null
          end_time: string
          google_event_id: string | null
          google_event_ids: Json | null
          id: string
          insurance_group_number: string | null
          insurance_member_id: string | null
          insurance_policy_number: string | null
          insurance_provider: string | null
          insurance_subscriber_dob: string | null
          insurance_subscriber_name: string | null
          insurance_verification_notes: string | null
          insurance_verified: boolean | null
          is_insurance_booking: boolean | null
          notes: string | null
          practitioner_2_id: string | null
          practitioner_id: string | null
          room_id: string | null
          service_id: string | null
          start_time: string
          status: string | null
          stripe_payment_intent_id: string | null
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          approved_by_practitioner_1?: string | null
          approved_by_practitioner_2?: string | null
          balance_due?: number | null
          balance_paid?: boolean | null
          booking_date: string
          client_email: string
          client_name: string
          client_phone?: string | null
          consent_email?: boolean
          consent_sms?: boolean
          created_at?: string
          customer_id?: string | null
          deposit_paid?: boolean | null
          end_time: string
          google_event_id?: string | null
          google_event_ids?: Json | null
          id?: string
          insurance_group_number?: string | null
          insurance_member_id?: string | null
          insurance_policy_number?: string | null
          insurance_provider?: string | null
          insurance_subscriber_dob?: string | null
          insurance_subscriber_name?: string | null
          insurance_verification_notes?: string | null
          insurance_verified?: boolean | null
          is_insurance_booking?: boolean | null
          notes?: string | null
          practitioner_2_id?: string | null
          practitioner_id?: string | null
          room_id?: string | null
          service_id?: string | null
          start_time: string
          status?: string | null
          stripe_payment_intent_id?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          approved_by_practitioner_1?: string | null
          approved_by_practitioner_2?: string | null
          balance_due?: number | null
          balance_paid?: boolean | null
          booking_date?: string
          client_email?: string
          client_name?: string
          client_phone?: string | null
          consent_email?: boolean
          consent_sms?: boolean
          created_at?: string
          customer_id?: string | null
          deposit_paid?: boolean | null
          end_time?: string
          google_event_id?: string | null
          google_event_ids?: Json | null
          id?: string
          insurance_group_number?: string | null
          insurance_member_id?: string | null
          insurance_policy_number?: string | null
          insurance_provider?: string | null
          insurance_subscriber_dob?: string | null
          insurance_subscriber_name?: string | null
          insurance_verification_notes?: string | null
          insurance_verified?: boolean | null
          is_insurance_booking?: boolean | null
          notes?: string | null
          practitioner_2_id?: string | null
          practitioner_id?: string | null
          room_id?: string | null
          service_id?: string | null
          start_time?: string
          status?: string | null
          stripe_payment_intent_id?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_practitioner_2_id_fkey"
            columns: ["practitioner_2_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_practitioner_2_id_fkey"
            columns: ["practitioner_2_id"]
            isOneToOne: false
            referencedRelation: "practitioners_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      business_rules: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          rule_text: string
          severity: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          rule_text: string
          severity?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          rule_text?: string
          severity?: string
          updated_at?: string
        }
        Relationships: []
      }
      business_settings: {
        Row: {
          address: string | null
          advance_booking_days: number | null
          buffer_time: number | null
          business_name: string
          cancellation_policy_hours: number | null
          cancellation_policy_text: string | null
          closing_time: string | null
          created_at: string
          email: string | null
          id: string
          no_show_fee_percentage: number | null
          opening_time: string | null
          phone: string | null
          require_card_for_booking: boolean | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          advance_booking_days?: number | null
          buffer_time?: number | null
          business_name?: string
          cancellation_policy_hours?: number | null
          cancellation_policy_text?: string | null
          closing_time?: string | null
          created_at?: string
          email?: string | null
          id?: string
          no_show_fee_percentage?: number | null
          opening_time?: string | null
          phone?: string | null
          require_card_for_booking?: boolean | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          advance_booking_days?: number | null
          buffer_time?: number | null
          business_name?: string
          cancellation_policy_hours?: number | null
          cancellation_policy_text?: string | null
          closing_time?: string | null
          created_at?: string
          email?: string | null
          id?: string
          no_show_fee_percentage?: number | null
          opening_time?: string | null
          phone?: string | null
          require_card_for_booking?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      calendar_busy_cache: {
        Row: {
          busy_times: Json
          connection_id: string
          id: string
          owner_id: string | null
          owner_type: string
          updated_at: string
          week_start: string
        }
        Insert: {
          busy_times?: Json
          connection_id: string
          id?: string
          owner_id?: string | null
          owner_type: string
          updated_at?: string
          week_start: string
        }
        Update: {
          busy_times?: Json
          connection_id?: string
          id?: string
          owner_id?: string | null
          owner_type?: string
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_busy_cache_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "calendar_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_connections: {
        Row: {
          connected_by: string | null
          created_at: string
          google_access_token: string | null
          google_calendar_id: string | null
          google_calendar_name: string | null
          google_refresh_token: string | null
          google_token_expiry: string | null
          id: string
          is_connected: boolean | null
          last_synced_at: string | null
          owner_id: string | null
          owner_type: string
          updated_at: string
        }
        Insert: {
          connected_by?: string | null
          created_at?: string
          google_access_token?: string | null
          google_calendar_id?: string | null
          google_calendar_name?: string | null
          google_refresh_token?: string | null
          google_token_expiry?: string | null
          id?: string
          is_connected?: boolean | null
          last_synced_at?: string | null
          owner_id?: string | null
          owner_type: string
          updated_at?: string
        }
        Update: {
          connected_by?: string | null
          created_at?: string
          google_access_token?: string | null
          google_calendar_id?: string | null
          google_calendar_name?: string | null
          google_refresh_token?: string | null
          google_token_expiry?: string | null
          id?: string
          is_connected?: boolean | null
          last_synced_at?: string | null
          owner_id?: string | null
          owner_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      coupon_redemptions: {
        Row: {
          booking_id: string | null
          coupon_code: string
          created_at: string
          customer_email: string
          customer_phone: string | null
          id: string
          redeemed_at: string
        }
        Insert: {
          booking_id?: string | null
          coupon_code: string
          created_at?: string
          customer_email: string
          customer_phone?: string | null
          id?: string
          redeemed_at?: string
        }
        Update: {
          booking_id?: string | null
          coupon_code?: string
          created_at?: string
          customer_email?: string
          customer_phone?: string | null
          id?: string
          redeemed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_signups: {
        Row: {
          coupon_code: string
          created_at: string
          email: string
          id: string
          phone: string | null
          source: string | null
        }
        Insert: {
          coupon_code?: string
          created_at?: string
          email: string
          id?: string
          phone?: string | null
          source?: string | null
        }
        Update: {
          coupon_code?: string
          created_at?: string
          email?: string
          id?: string
          phone?: string | null
          source?: string | null
        }
        Relationships: []
      }
      customer_memberships: {
        Row: {
          cancelled_at: string | null
          created_at: string
          customer_id: string
          id: string
          next_billing_date: string | null
          plan_id: string
          sessions_remaining: number
          sessions_used: number
          start_date: string
          status: string
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          customer_id: string
          id?: string
          next_billing_date?: string | null
          plan_id: string
          sessions_remaining?: number
          sessions_used?: number
          start_date?: string
          status?: string
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          next_billing_date?: string | null
          plan_id?: string
          sessions_remaining?: number
          sessions_used?: number
          start_date?: string
          status?: string
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_memberships_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_memberships_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_packages: {
        Row: {
          created_at: string
          customer_id: string
          expires_at: string | null
          id: string
          package_id: string
          purchase_date: string
          sessions_remaining: number
          sessions_used: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          expires_at?: string | null
          id?: string
          package_id: string
          purchase_date?: string
          sessions_remaining: number
          sessions_used?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          expires_at?: string | null
          id?: string
          package_id?: string
          purchase_date?: string
          sessions_remaining?: number
          sessions_used?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_packages_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_packages_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "session_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          email: string
          first_name: string
          id: string
          last_appointment: string | null
          last_name: string
          notes: string | null
          phone: string | null
          tags: string[] | null
          total_appointments: number | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          first_name: string
          id?: string
          last_appointment?: string | null
          last_name: string
          notes?: string | null
          phone?: string | null
          tags?: string[] | null
          total_appointments?: number | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          first_name?: string
          id?: string
          last_appointment?: string | null
          last_name?: string
          notes?: string | null
          phone?: string | null
          tags?: string[] | null
          total_appointments?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      debug_logs: {
        Row: {
          created_at: string
          data: Json | null
          hypothesis_id: string | null
          id: string
          location: string | null
          message: string | null
        }
        Insert: {
          created_at?: string
          data?: Json | null
          hypothesis_id?: string | null
          id?: string
          location?: string | null
          message?: string | null
        }
        Update: {
          created_at?: string
          data?: Json | null
          hypothesis_id?: string | null
          id?: string
          location?: string | null
          message?: string | null
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          body_html: string
          body_text: string | null
          category: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean | null
          name: string
          subject: string
          updated_at: string
        }
        Insert: {
          body_html: string
          body_text?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          subject: string
          updated_at?: string
        }
        Update: {
          body_html?: string
          body_text?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      intake_form_responses: {
        Row: {
          booking_id: string | null
          client_email: string
          client_name: string
          completed_at: string | null
          created_at: string
          customer_id: string | null
          id: string
          ip_address: string | null
          responses: Json
          signature_data: string | null
          signed_at: string | null
          template_id: string
        }
        Insert: {
          booking_id?: string | null
          client_email: string
          client_name: string
          completed_at?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          ip_address?: string | null
          responses?: Json
          signature_data?: string | null
          signed_at?: string | null
          template_id: string
        }
        Update: {
          booking_id?: string | null
          client_email?: string
          client_name?: string
          completed_at?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          ip_address?: string | null
          responses?: Json
          signature_data?: string | null
          signed_at?: string | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_form_responses_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_form_responses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_form_responses_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "intake_form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_form_templates: {
        Row: {
          created_at: string
          description: string | null
          form_fields: Json
          id: string
          is_active: boolean | null
          is_required: boolean | null
          name: string
          service_ids: string[] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          form_fields?: Json
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          name: string
          service_ids?: string[] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          form_fields?: Json
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          name?: string
          service_ids?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      internal_messages: {
        Row: {
          booking_id: string | null
          content: string
          created_at: string
          id: string
          is_read: boolean | null
          recipient_id: string | null
          sender_id: string
        }
        Insert: {
          booking_id?: string | null
          content: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          recipient_id?: string | null
          sender_id: string
        }
        Update: {
          booking_id?: string | null
          content?: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          recipient_id?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_messages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_plans: {
        Row: {
          billing_period: string
          created_at: string
          description: string | null
          discount_percentage: number | null
          id: string
          is_active: boolean | null
          name: string
          price: number
          service_ids: string[] | null
          sessions_included: number
          stripe_price_id: string | null
          stripe_product_id: string | null
          updated_at: string
        }
        Insert: {
          billing_period?: string
          created_at?: string
          description?: string | null
          discount_percentage?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          price: number
          service_ids?: string[] | null
          sessions_included?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Update: {
          billing_period?: string
          created_at?: string
          description?: string | null
          discount_percentage?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          price?: number
          service_ids?: string[] | null
          sessions_included?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          category: string
          created_at: string
          email_body_template: string | null
          email_enabled: boolean
          email_subject_template: string | null
          event_description: string | null
          event_label: string
          event_type: string
          id: string
          send_to_client: boolean
          send_to_staff: boolean
          sms_enabled: boolean
          sms_template: string | null
          timing_minutes: number | null
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          email_body_template?: string | null
          email_enabled?: boolean
          email_subject_template?: string | null
          event_description?: string | null
          event_label: string
          event_type: string
          id?: string
          send_to_client?: boolean
          send_to_staff?: boolean
          sms_enabled?: boolean
          sms_template?: string | null
          timing_minutes?: number | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          email_body_template?: string | null
          email_enabled?: boolean
          email_subject_template?: string | null
          event_description?: string | null
          event_label?: string
          event_type?: string
          id?: string
          send_to_client?: boolean
          send_to_staff?: boolean
          sms_enabled?: boolean
          sms_template?: string | null
          timing_minutes?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_url: string | null
          booking_id: string | null
          created_at: string
          id: string
          is_read: boolean | null
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          booking_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          message: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          booking_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      practitioners: {
        Row: {
          bio: string | null
          color: string | null
          created_at: string
          email: string
          id: string
          image_url: string | null
          is_active: boolean | null
          name: string
          phone: string | null
          sms_consent: boolean
          sms_consent_at: string | null
          sms_consent_ip: string | null
          sms_consent_token: string | null
          specialties: string[] | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          bio?: string | null
          color?: string | null
          created_at?: string
          email: string
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name: string
          phone?: string | null
          sms_consent?: boolean
          sms_consent_at?: string | null
          sms_consent_ip?: string | null
          sms_consent_token?: string | null
          specialties?: string[] | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          bio?: string | null
          color?: string | null
          created_at?: string
          email?: string
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name?: string
          phone?: string | null
          sms_consent?: boolean
          sms_consent_at?: string | null
          sms_consent_ip?: string | null
          sms_consent_token?: string | null
          specialties?: string[] | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rooms: {
        Row: {
          amenities: string[] | null
          capacity: number | null
          color: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          amenities?: string[] | null
          capacity?: number | null
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          amenities?: string[] | null
          capacity?: number | null
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      rule_violations: {
        Row: {
          booking_id: string | null
          created_at: string
          id: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          rule_id: string | null
          severity: string
          violation_description: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string | null
          severity?: string
          violation_description: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string | null
          severity?: string
          violation_description?: string
        }
        Relationships: [
          {
            foreignKeyName: "rule_violations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_violations_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "business_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      sent_emails: {
        Row: {
          body_html: string
          created_at: string
          error_message: string | null
          id: string
          recipient_email: string
          recipient_name: string | null
          resend_id: string | null
          sent_by: string | null
          status: string
          subject: string
          template_id: string | null
        }
        Insert: {
          body_html: string
          created_at?: string
          error_message?: string | null
          id?: string
          recipient_email: string
          recipient_name?: string | null
          resend_id?: string | null
          sent_by?: string | null
          status?: string
          subject: string
          template_id?: string | null
        }
        Update: {
          body_html?: string
          created_at?: string
          error_message?: string | null
          id?: string
          recipient_email?: string
          recipient_name?: string | null
          resend_id?: string | null
          sent_by?: string | null
          status?: string
          subject?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sent_emails_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          category: string | null
          created_at: string
          deposit_required: number | null
          description: string | null
          duration: number
          id: string
          image_url: string | null
          is_active: boolean | null
          is_couples: boolean | null
          is_local: boolean | null
          is_outcall: boolean | null
          name: string
          practitioner_ids: string[] | null
          price: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          deposit_required?: number | null
          description?: string | null
          duration: number
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_couples?: boolean | null
          is_local?: boolean | null
          is_outcall?: boolean | null
          name: string
          practitioner_ids?: string[] | null
          price: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          deposit_required?: number | null
          description?: string | null
          duration?: number
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_couples?: boolean | null
          is_local?: boolean | null
          is_outcall?: boolean | null
          name?: string
          practitioner_ids?: string[] | null
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      session_packages: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          price: number
          service_ids: string[] | null
          session_count: number
          updated_at: string
          valid_days: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          price: number
          service_ids?: string[] | null
          session_count: number
          updated_at?: string
          valid_days?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          price?: number
          service_ids?: string[] | null
          session_count?: number
          updated_at?: string
          valid_days?: number | null
        }
        Relationships: []
      }
      sms_messages: {
        Row: {
          booking_id: string | null
          content: string
          created_at: string
          customer_id: string | null
          customer_name: string
          customer_phone: string
          direction: string
          id: string
          sent_by: string | null
          status: string | null
          vonage_message_id: string | null
        }
        Insert: {
          booking_id?: string | null
          content: string
          created_at?: string
          customer_id?: string | null
          customer_name: string
          customer_phone: string
          direction?: string
          id?: string
          sent_by?: string | null
          status?: string | null
          vonage_message_id?: string | null
        }
        Update: {
          booking_id?: string | null
          content?: string
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string
          direction?: string
          id?: string
          sent_by?: string | null
          status?: string | null
          vonage_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_messages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_messages_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      soap_notes: {
        Row: {
          areas_treated: string[] | null
          assessment: string | null
          body_annotations: Json | null
          booking_id: string | null
          created_at: string
          customer_id: string | null
          follow_up_notes: string | null
          follow_up_recommended: boolean | null
          id: string
          objective: string | null
          plan: string | null
          practitioner_id: string | null
          pressure_level: string | null
          session_date: string
          subjective: string | null
          techniques_used: string[] | null
          treatment_duration: number | null
          updated_at: string
        }
        Insert: {
          areas_treated?: string[] | null
          assessment?: string | null
          body_annotations?: Json | null
          booking_id?: string | null
          created_at?: string
          customer_id?: string | null
          follow_up_notes?: string | null
          follow_up_recommended?: boolean | null
          id?: string
          objective?: string | null
          plan?: string | null
          practitioner_id?: string | null
          pressure_level?: string | null
          session_date?: string
          subjective?: string | null
          techniques_used?: string[] | null
          treatment_duration?: number | null
          updated_at?: string
        }
        Update: {
          areas_treated?: string[] | null
          assessment?: string | null
          body_annotations?: Json | null
          booking_id?: string | null
          created_at?: string
          customer_id?: string | null
          follow_up_notes?: string | null
          follow_up_recommended?: boolean | null
          id?: string
          objective?: string | null
          plan?: string | null
          practitioner_id?: string | null
          pressure_level?: string | null
          session_date?: string
          subjective?: string | null
          techniques_used?: string[] | null
          treatment_duration?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "soap_notes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soap_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soap_notes_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soap_notes_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          client_email: string
          client_name: string
          client_phone: string | null
          created_at: string
          customer_id: string | null
          date_range_end: string | null
          date_range_start: string | null
          expires_at: string | null
          id: string
          notes: string | null
          notified_at: string | null
          practitioner_id: string | null
          preferred_days: number[] | null
          preferred_time_end: string | null
          preferred_time_start: string | null
          service_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_email: string
          client_name: string
          client_phone?: string | null
          created_at?: string
          customer_id?: string | null
          date_range_end?: string | null
          date_range_start?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          notified_at?: string | null
          practitioner_id?: string | null
          preferred_days?: number[] | null
          preferred_time_end?: string | null
          preferred_time_start?: string | null
          service_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_email?: string
          client_name?: string
          client_phone?: string | null
          created_at?: string
          customer_id?: string | null
          date_range_end?: string | null
          date_range_start?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          notified_at?: string | null
          practitioner_id?: string | null
          preferred_days?: number[] | null
          preferred_time_end?: string | null
          preferred_time_start?: string | null
          service_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_practitioner_id_fkey"
            columns: ["practitioner_id"]
            isOneToOne: false
            referencedRelation: "practitioners_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      practitioners_public: {
        Row: {
          bio: string | null
          color: string | null
          created_at: string | null
          id: string | null
          image_url: string | null
          is_active: boolean | null
          name: string | null
          specialties: string[] | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          bio?: string | null
          color?: string | null
          created_at?: string | null
          id?: string | null
          image_url?: string | null
          is_active?: boolean | null
          name?: string | null
          specialties?: string[] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          bio?: string | null
          color?: string | null
          created_at?: string | null
          id?: string | null
          image_url?: string | null
          is_active?: boolean | null
          name?: string | null
          specialties?: string[] | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_internal_secret: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "staff"
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
      app_role: ["admin", "staff"],
    },
  },
} as const
