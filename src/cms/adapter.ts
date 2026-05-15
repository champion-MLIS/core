/**
 * CMS adapter interface — the seam for Church Reimagined transferability.
 *
 * Today, all data flows through PCO. Tomorrow, a different church will
 * use Breeze, CCB, Rock RMS, Subsplash, or their own system. The MLIS
 * core (agents, schedule, drafting, dashboard) is CMS-agnostic. CMS-specific
 * code lives behind this interface in src/cms/<vendor>/.
 *
 * Status (2026-05-15): this interface exists but is NOT yet wired into the
 * codebase. The existing intake mirror + signal poller still talk to PCO
 * directly. The full refactor — moving every PCO call behind this adapter —
 * is on the roadmap for Phase A.2.
 *
 * Decision: declare the interface NOW so new code (Phase A onward) is
 * written against it, and migrate the old code (Step 2 mirror, Step 3
 * signal poller) over time. This avoids "we'll abstract it later" rot.
 */

import type { Json } from '../db/index.ts';

/** A person record in CMS-neutral shape. */
export interface CmsPerson {
  cms_id: string;
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  is_child: boolean | null;
  birthdate: string | null;
  household_id: string | null;
  membership: string | null;
  status: string | null;
  created_at: string;
  updated_at: string | null;
  raw: Json;
}

export interface CmsHousehold {
  cms_id: string;
  name: string | null;
  member_count: number | null;
  primary_contact_id: string | null;
  raw: Json;
}

export interface CmsEmail {
  cms_id: string;
  person_cms_id: string;
  address: string;
  location: string | null;
  is_primary: boolean;
  blocked: boolean;
}

export interface CmsPhone {
  cms_id: string;
  person_cms_id: string;
  number: string;
  location: string | null;
  is_primary: boolean;
  carrier: string | null;
}

/** A form definition (e.g., a connect card). */
export interface CmsForm {
  cms_id: string;
  name: string;
  active: boolean;
  archived: boolean;
  submission_count: number | null;
  public_url: string | null;
}

/** A submission to a form, optionally with the person_id resolved. */
export interface CmsFormSubmission {
  cms_id: string;
  form_cms_id: string;
  person_cms_id: string | null;
  created_at: string;
  field_values: Record<string, unknown>;
}

/** A donation (giving event). */
export interface CmsDonation {
  cms_id: string;
  donor_person_cms_id: string;
  amount_cents: number;
  currency: string;
  received_at: string;
  is_first_donation: boolean;
  fund: string | null;
}

/** A check-in event. */
export interface CmsCheckIn {
  cms_id: string;
  person_cms_id: string;
  household_cms_id: string | null;
  location: string;
  /** True if this check-in is for a child (vs an adult). */
  is_child: boolean;
  occurred_at: string;
}

/** A service plan — the order of service for a date. */
export interface CmsServicePlan {
  cms_id: string;
  service_date: string;
  service_title: string | null;
  sermon_title: string | null;
  sermon_series: string | null;
  scripture_reference: string | null;
}

// ---------------------------------------------------------------------------
// The adapter contract
// ---------------------------------------------------------------------------

export interface ListOptions {
  /** Page size; vendor max may apply. */
  per_page?: number;
  /** Ascending or descending; default '-created_at'. */
  order?: 'created_at' | '-created_at' | 'updated_at' | '-updated_at';
  /** Filter to records newer than this ISO timestamp. */
  created_since?: string;
}

export interface CmsAdapter {
  vendor: 'pco' | 'breeze' | 'ccb' | 'rock' | 'subsplash';

  // ---- People + relationships ------------------------------------------
  listPeople(opts?: ListOptions): Promise<{
    people: CmsPerson[];
    households: CmsHousehold[];
    emails: CmsEmail[];
    phones: CmsPhone[];
  }>;

  // ---- Forms ------------------------------------------------------------
  listForms(): Promise<CmsForm[]>;
  listFormSubmissions(formId: string, opts?: ListOptions): Promise<CmsFormSubmission[]>;

  // ---- Giving (optional — vendors that don't have it can throw) --------
  listDonations(opts?: ListOptions): Promise<CmsDonation[]>;

  // ---- Check-Ins (optional) --------------------------------------------
  listCheckIns(opts?: ListOptions): Promise<CmsCheckIn[]>;

  // ---- Service plans (optional, for sermon context) --------------------
  getServicePlan(serviceDate: string): Promise<CmsServicePlan | null>;
}
