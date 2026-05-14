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

export type LifecycleStage = Enums['lifecycle_stage'];
export type EngagementSignalKind = Enums['engagement_signal_kind'];
export type FollowupStatus = Enums['followup_status'];
