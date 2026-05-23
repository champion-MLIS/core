/**
 * Touch payload enrichment (Part 1.2).
 *
 * Runs just before a touch is presented for drafting. Reads the person,
 * household, kids, first-visit signal, service plan (sermon), prior
 * touches, and precious-cargo references; writes the assembled context
 * into `touches.payload.context`.
 *
 * Idempotent: re-running on the same touch refreshes the context block
 * without clobbering label/guidance (set at enrollment) or draft fields
 * (set by the per-touch drafter later).
 *
 * Per ADR-004, `precious_cargo_refs` carries only references (ids + dates),
 * never content. Full prayer-request content lives in `prayer_requests`
 * and is RLS-gated to the pastoral_care role.
 */

import type {
  Db,
  EngagementSignalRow,
  JourneyRow,
  Json,
  PersonRow,
  PrayerRequestRow,
  TouchRow,
  VolunteerRow,
} from '../db/index.ts';
import type { CmsAdapter, CmsServicePlan } from '../cms/index.ts';
import { resolveVolunteerForTouch } from './enroll.ts';

// ---------------------------------------------------------------------------
// Public shape — the context block written to touches.payload.context
// ---------------------------------------------------------------------------

export interface EnrichedContext {
  person: PersonContext;
  first_visit: FirstVisitContext | null;
  sermon: SermonContext | null;
  connect_card: ConnectCardContext | null;
  kids: KidsContext | null;
  prior_touches: PriorTouchContext[];
  precious_cargo_refs: PreciousCargoRef[];
  assigned_volunteer: VolunteerContext | null;
  enriched_at: string;
}

export interface PersonContext {
  pco_id: string;
  preferred_name: string;
  full_name: string;
  is_child: boolean;
  household_pco_id: string | null;
}

export interface FirstVisitContext {
  /** Date of first visit (YYYY-MM-DD). */
  date: string;
}

export interface SermonContext {
  service_date: string;
  service_title: string | null;
  sermon_title: string | null;
  sermon_series: string | null;
  scripture_reference: string | null;
}

export interface ConnectCardContext {
  signal_id: string;
  occurred_at: string;
  /** Free-text content extracted from the signal payload, if any. */
  content: string | null;
}

export interface KidsContext {
  /** Children in the same household, derived from the people mirror. */
  household_children: Array<{
    pco_id: string;
    first_name: string | null;
    age_years: number | null;
  }>;
  /** Recent child_checkin signals for the household, if any. */
  recent_checkins: Array<{
    signal_id: string;
    occurred_at: string;
    person_pco_id: string;
    ministry_environment: string | null;
  }>;
}

export interface PriorTouchContext {
  touch_number: number;
  kind: string;
  owner_role: string;
  completed_at: string;
  outcome_summary: string | null;
}

export interface PreciousCargoRef {
  prayer_request_id: string;
  captured_at: string;
  channel: string;
  /** Status only — never content. Pastoral-care role reads full content via prayer_requests directly. */
  status: string;
}

export interface VolunteerContext {
  id: string;
  full_name: string;
  email: string | null;
  role: string;
}

export interface EnrichTouchOptions {
  /** Override "now" for tests. */
  now?: () => Date;
}

export type EnrichTouchResult =
  | { outcome: 'enriched'; context: EnrichedContext }
  | { outcome: 'touch_not_found'; reason: string }
  | { outcome: 'journey_not_found'; reason: string };

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function enrichTouch(
  db: Db,
  cms: CmsAdapter,
  touchId: string,
  opts: EnrichTouchOptions = {},
): Promise<EnrichTouchResult> {
  const { data: touch, error: tErr } = await db
    .from('touches')
    .select('*')
    .eq('id', touchId)
    .maybeSingle();
  if (tErr) throw new Error(`touch lookup failed: ${tErr.message}`);
  if (!touch) {
    return { outcome: 'touch_not_found', reason: `touch ${touchId} not found` };
  }
  const t = touch as TouchRow;

  const { data: journey, error: jErr } = await db
    .from('guest_journeys')
    .select('*')
    .eq('id', t.journey_id)
    .maybeSingle();
  if (jErr) throw new Error(`journey lookup failed: ${jErr.message}`);
  if (!journey) {
    return { outcome: 'journey_not_found', reason: `journey ${t.journey_id} not found` };
  }
  const j = journey as JourneyRow;

  const person = await fetchPerson(db, j.person_pco_id);
  if (!person) {
    throw new Error(`person ${j.person_pco_id} not in mirror`);
  }

  const [connectCard, sermon, kids, priorTouches, preciousCargo, volunteer] =
    await Promise.all([
      fetchConnectCardSignal(db, j),
      fetchSermon(cms, j.enrolled_at),
      fetchKidsContext(db, person),
      fetchPriorTouches(db, j.id, t.touch_number),
      fetchPreciousCargoRefs(db, person),
      resolveVolunteerForTouch(db, j, t.owner_role),
    ]);

  const now = (opts.now ?? (() => new Date()))();

  const context: EnrichedContext = {
    person: {
      pco_id: person.pco_id,
      preferred_name:
        person.preferred_name ?? person.first_name ?? person.last_name ?? '(friend)',
      full_name:
        [person.first_name, person.last_name].filter(Boolean).join(' ').trim() ||
        person.preferred_name ||
        '(friend)',
      is_child: person.is_child === true,
      household_pco_id: person.household_pco_id,
    },
    first_visit: person.first_visit_date ? { date: person.first_visit_date } : null,
    sermon,
    connect_card: connectCard,
    kids,
    prior_touches: priorTouches,
    precious_cargo_refs: preciousCargo,
    assigned_volunteer: volunteer ? volunteerToContext(volunteer) : null,
    enriched_at: now.toISOString(),
  };

  // Merge: preserve label/guidance/draft fields, overwrite context.
  const existingPayload = (t.payload ?? {}) as Record<string, Json>;
  const nextPayload: Record<string, Json> = {
    ...existingPayload,
    context: context as unknown as Json,
  };

  const { error: updateErr } = await db
    .from('touches')
    .update({ payload: nextPayload as unknown as Json })
    .eq('id', touchId);
  if (updateErr) throw new Error(`touch payload update failed: ${updateErr.message}`);

  return { outcome: 'enriched', context };
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

async function fetchPerson(db: Db, pcoId: string): Promise<PersonRow | null> {
  const { data, error } = await db
    .from('people')
    .select('*')
    .eq('pco_id', pcoId)
    .maybeSingle();
  if (error) throw new Error(`people fetch failed: ${error.message}`);
  return (data as PersonRow | null) ?? null;
}

async function fetchConnectCardSignal(
  db: Db,
  journey: JourneyRow,
): Promise<ConnectCardContext | null> {
  // If the journey was enrolled by a connect_card signal, that's authoritative.
  // Otherwise look for the most recent connect_card for this person.
  if (journey.enrollment_signal_id && journey.enrollment_kind === 'connect_card') {
    const { data, error } = await db
      .from('engagement_signals')
      .select('*')
      .eq('id', journey.enrollment_signal_id)
      .maybeSingle();
    if (error) throw new Error(`engagement_signal fetch failed: ${error.message}`);
    if (data) {
      const s = data as EngagementSignalRow;
      return {
        signal_id: s.id,
        occurred_at: s.occurred_at,
        content: extractConnectCardText(s.payload),
      };
    }
  }

  const { data, error } = await db
    .from('engagement_signals')
    .select('*')
    .eq('person_pco_id', journey.person_pco_id)
    .eq('kind', 'connect_card')
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`engagement_signals fetch failed: ${error.message}`);
  if (!data) return null;
  const s = data as EngagementSignalRow;
  return {
    signal_id: s.id,
    occurred_at: s.occurred_at,
    content: extractConnectCardText(s.payload),
  };
}

/**
 * Connect Card payloads vary by source form. We look for common shapes:
 *   - payload.fields.response, payload.fields.message, payload.fields.notes
 *   - payload.message, payload.notes, payload.response
 * Returns null if no free-text content is recognizable.
 */
function extractConnectCardText(payload: Json): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const p = payload as Record<string, Json>;
  const candidates: Array<unknown> = [];

  if (p.fields && typeof p.fields === 'object' && !Array.isArray(p.fields)) {
    const f = p.fields as Record<string, Json>;
    candidates.push(f.content, f.response, f.message, f.notes, f.note, f.comment, f.tell_us_more);
  }
  candidates.push(p.content, p.response, p.message, p.notes, p.note, p.comment);

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) return c.trim();
  }
  return null;
}

async function fetchSermon(
  cms: CmsAdapter,
  enrolledAt: string,
): Promise<SermonContext | null> {
  const serviceDate = enrolledAt.slice(0, 10);
  let plan: CmsServicePlan | null;
  try {
    plan = await cms.getServicePlan(serviceDate);
  } catch {
    // Adapter not yet wired (PCO service plans Phase C); enrichment proceeds
    // without sermon data and the drafter handles held_pending_data.
    return null;
  }
  if (!plan) return null;
  return {
    service_date: plan.service_date,
    service_title: plan.service_title,
    sermon_title: plan.sermon_title,
    sermon_series: plan.sermon_series,
    scripture_reference: plan.scripture_reference,
  };
}

async function fetchKidsContext(db: Db, person: PersonRow): Promise<KidsContext | null> {
  if (!person.household_pco_id) return null;

  const { data: members, error: mErr } = await db
    .from('people')
    .select('pco_id, first_name, birthdate, is_child')
    .eq('household_pco_id', person.household_pco_id)
    .eq('is_child', true);
  if (mErr) throw new Error(`household members fetch failed: ${mErr.message}`);

  const householdChildren = (members ?? []).map((m) => ({
    pco_id: m.pco_id as string,
    first_name: (m.first_name as string | null) ?? null,
    age_years: ageInYears(m.birthdate as string | null),
  }));

  if (householdChildren.length === 0) return null;

  const childIds = householdChildren.map((c) => c.pco_id);
  const { data: checkins, error: ciErr } = await db
    .from('engagement_signals')
    .select('id, person_pco_id, occurred_at, payload')
    .in('person_pco_id', childIds)
    .eq('kind', 'child_checkin')
    .order('occurred_at', { ascending: false })
    .limit(10);
  if (ciErr) throw new Error(`child_checkin fetch failed: ${ciErr.message}`);

  const recentCheckins = (checkins ?? []).map((c) => ({
    signal_id: c.id as string,
    occurred_at: c.occurred_at as string,
    person_pco_id: c.person_pco_id as string,
    ministry_environment: extractMinistryEnvironment(c.payload as Json),
  }));

  return { household_children: householdChildren, recent_checkins: recentCheckins };
}

function extractMinistryEnvironment(payload: Json): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const p = payload as Record<string, Json>;
  const candidates = [p.location, p.environment, p.ministry, p.classroom];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) return c.trim();
  }
  return null;
}

function ageInYears(birthdate: string | null): number | null {
  if (!birthdate) return null;
  const bd = new Date(birthdate);
  if (Number.isNaN(bd.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - bd.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - bd.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < bd.getUTCDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

async function fetchPriorTouches(
  db: Db,
  journeyId: string,
  currentTouchNumber: number,
): Promise<PriorTouchContext[]> {
  const { data, error } = await db
    .from('touches')
    .select('*')
    .eq('journey_id', journeyId)
    .eq('status', 'completed')
    .lt('touch_number', currentTouchNumber);
  if (error) throw new Error(`prior touches fetch failed: ${error.message}`);
  const rows = ((data as TouchRow[] | null) ?? []).filter((r) => r.completed_at !== null);
  rows.sort((a, b) => a.touch_number - b.touch_number);
  return rows.map((r) => ({
    touch_number: r.touch_number,
    kind: r.kind,
    owner_role: r.owner_role,
    completed_at: r.completed_at as string,
    outcome_summary: r.notes,
  }));
}

async function fetchPreciousCargoRefs(
  db: Db,
  person: PersonRow,
): Promise<PreciousCargoRef[]> {
  const refs = person.precious_cargo_refs ?? [];
  if (refs.length === 0) return [];
  const { data, error } = await db
    .from('prayer_requests')
    .select('id, captured_at, channel, status')
    .in('id', refs);
  if (error) {
    // RLS may deny if the running role isn't service_role; in that case the
    // enrichment writes the ref count only (no detail). Fail soft.
    return refs.map((id) => ({
      prayer_request_id: id,
      captured_at: '',
      channel: '',
      status: 'restricted',
    }));
  }
  return ((data as Array<{ id: string; captured_at: string; channel: string; status: string }> | null) ?? [])
    .map((r) => ({
      prayer_request_id: r.id,
      captured_at: r.captured_at,
      channel: r.channel,
      status: r.status,
    }))
    .sort((a, b) => b.captured_at.localeCompare(a.captured_at));
}

function volunteerToContext(v: VolunteerRow): VolunteerContext {
  return {
    id: v.id,
    full_name: v.full_name,
    email: v.email,
    role: v.role,
  };
}

// ---------------------------------------------------------------------------
// Convenience: read the enriched context off a touch row.
// ---------------------------------------------------------------------------

export function readEnrichedContext(touch: TouchRow): EnrichedContext | null {
  const payload = touch.payload as Record<string, Json> | null;
  if (!payload) return null;
  const ctx = payload.context;
  if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) return null;
  return ctx as unknown as EnrichedContext;
}

/**
 * Re-export the unused PrayerRequestRow import marker so eslint doesn't strip
 * the type — it's used as the source-of-truth shape for precious cargo refs
 * even though we only select a subset of columns.
 */
export type { PrayerRequestRow };
