export { getDb, _setDbForTesting, _resetDbForTesting, type Db } from './client.ts';
export type { Database, Json } from './types.generated.ts';

import type { Database } from './types.generated.ts';

export type Tables = Database['public']['Tables'];
export type Enums = Database['public']['Enums'];

export type PersonRow = Tables['people']['Row'];
export type PersonInsert = Tables['people']['Insert'];
export type HouseholdRow = Tables['households']['Row'];
export type HouseholdInsert = Tables['households']['Insert'];
export type EmailRow = Tables['emails']['Row'];
export type EmailInsert = Tables['emails']['Insert'];
export type PhoneRow = Tables['phone_numbers']['Row'];
export type PhoneInsert = Tables['phone_numbers']['Insert'];
export type WatermarkRow = Tables['poll_watermarks']['Row'];
export type WatermarkInsert = Tables['poll_watermarks']['Insert'];
export type EngagementSignalRow = Tables['engagement_signals']['Row'];
export type FollowupQueueRow = Tables['followup_queue']['Row'];
export type PastoralFlagRow = Tables['pastoral_flags']['Row'];
export type ChurchConfigRow = Tables['church_config']['Row'];
export type ChurchConfigInsert = Tables['church_config']['Insert'];
export type JourneyRow = Tables['guest_journeys']['Row'];
export type JourneyInsert = Tables['guest_journeys']['Insert'];
export type JourneyUpdate = Tables['guest_journeys']['Update'];
export type TouchRow = Tables['touches']['Row'];
export type TouchInsert = Tables['touches']['Insert'];
export type TouchUpdate = Tables['touches']['Update'];
export type VolunteerRow = Tables['volunteers']['Row'];
export type VolunteerInsert = Tables['volunteers']['Insert'];
export type VolunteerUpdate = Tables['volunteers']['Update'];
export type StaffProfileRow = Tables['staff_profiles']['Row'];
export type StaffProfileInsert = Tables['staff_profiles']['Insert'];
export type PrayerRequestRow = Tables['prayer_requests']['Row'];
export type PrayerRequestInsert = Tables['prayer_requests']['Insert'];
export type PrayerRequestUpdate = Tables['prayer_requests']['Update'];

export type LifecycleStage = Enums['lifecycle_stage'];
export type EngagementSignalKind = Enums['engagement_signal_kind'];
export type FollowupStatus = Enums['followup_status'];
export type JourneyStatus = Enums['journey_status'];
export type TouchKind = Enums['touch_kind'];
export type TouchOwnerRole = Enums['touch_owner_role'];
export type TouchStatus = Enums['touch_status'];

export type VolunteerRole = 'connections' | 'lay';
export type PrayerRequestChannel = 'email' | 'sms' | 'connect_card' | 'other';
export type PrayerRequestStatus =
  | 'open'
  | 'in_followup'
  | 'resolved_no_action'
  | 'completed'
  | 'sunset_historical';
