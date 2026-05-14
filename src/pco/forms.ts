/**
 * PCO Forms — list forms and walk their submissions.
 *
 * The "Forms" feature in PCO People is how Champion captures:
 *   - Connect cards (the primary guest-onboarding signal)
 *   - Prayer requests
 *   - Anything else Champion has built as a form
 *
 * Form metadata: /people/v2/forms
 * Submissions:   /people/v2/forms/{form_id}/form_submissions
 *
 * Each submission has a person_id relationship — that's how a submission
 * becomes a trigger signal for a specific person.
 */

import { z } from 'zod';
import type { PcoClient } from './client.ts';
import { PcoCollection, PcoIncludedItem, type PcoIncluded } from './types.ts';

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

export const PcoFormAttributes = z
  .object({
    name: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    active: z.boolean().nullable().optional(),
    archived: z.boolean().nullable().optional(),
    archived_at: z.string().nullable().optional(),
    deleted_at: z.string().nullable().optional(),
    submission_count: z.number().nullable().optional(),
    public_url: z.string().nullable().optional(),
    created_at: z.string().nullable().optional(),
    updated_at: z.string().nullable().optional(),
  })
  .passthrough();

export const PcoFormsCollection = PcoCollection(PcoFormAttributes);
export type PcoForm = z.infer<typeof PcoFormsCollection>['data'][number];
export type PcoFormsResponse = z.infer<typeof PcoFormsCollection>;

export interface ListFormsOptions {
  perPage?: number;
  signal?: AbortSignal;
  /** Filter to only active, non-archived, non-deleted forms (default true). */
  activeOnly?: boolean;
}

export interface ListFormsResult {
  forms: PcoForm[];
  raw: PcoFormsResponse;
}

export async function listForms(
  client: PcoClient,
  opts: ListFormsOptions = {},
): Promise<ListFormsResult> {
  const query: Record<string, string | number> = {
    per_page: opts.perPage ?? 100,
    order: 'name',
  };
  const raw = await client.get<unknown>('/people/v2/forms', {
    query,
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
  const parsed = PcoFormsCollection.parse(raw);
  const forms = opts.activeOnly === false
    ? parsed.data
    : parsed.data.filter(
        (f) =>
          f.attributes.active !== false &&
          !f.attributes.archived &&
          !f.attributes.archived_at &&
          !f.attributes.deleted_at,
      );
  return { forms, raw: parsed };
}

// ---------------------------------------------------------------------------
// Form submissions
// ---------------------------------------------------------------------------

export const PcoFormSubmissionAttributes = z
  .object({
    verified: z.boolean().nullable().optional(),
    requires_verification: z.boolean().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string().nullable().optional(),
  })
  .passthrough();

export const PcoFormSubmissionsCollection = PcoCollection(PcoFormSubmissionAttributes);
export type PcoFormSubmission = z.infer<typeof PcoFormSubmissionsCollection>['data'][number];
export type PcoFormSubmissionsResponse = z.infer<typeof PcoFormSubmissionsCollection>;

export interface ListSubmissionsOptions {
  perPage?: number;
  /** Default '-created_at' (newest first). */
  order?: 'created_at' | '-created_at';
  /** Sideload person and/or form_submission_values. */
  include?: Array<'person' | 'form_submission_values'>;
  /** Restrict to records created since this ISO timestamp (PCO `where` clause). */
  createdSince?: string;
  signal?: AbortSignal;
}

export interface ListSubmissionsResult {
  submissions: PcoFormSubmission[];
  included: PcoIncluded[];
  raw: PcoFormSubmissionsResponse;
}

export async function listFormSubmissions(
  client: PcoClient,
  formId: string,
  opts: ListSubmissionsOptions = {},
): Promise<ListSubmissionsResult> {
  const query: Record<string, string | number | string[]> = {
    per_page: opts.perPage ?? 50,
    order: opts.order ?? '-created_at',
  };
  if (opts.include && opts.include.length > 0) query['include'] = opts.include;
  if (opts.createdSince) query['where[created_at][gte]'] = opts.createdSince;

  const raw = await client.get<unknown>(`/people/v2/forms/${formId}/form_submissions`, {
    query,
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
  const parsed = PcoFormSubmissionsCollection.parse(raw);
  const included = (parsed.included ?? [])
    .map((i) => PcoIncludedItem.safeParse(i))
    .filter((r): r is { success: true; data: PcoIncluded } => r.success)
    .map((r) => r.data);
  return { submissions: parsed.data, included, raw: parsed };
}

/**
 * Resolve the person_id from a form submission's relationships.
 * Returns null if the submission isn't linked to a person record yet
 * (PCO sometimes creates the submission before the person is finalized).
 */
export function submissionPersonId(submission: PcoFormSubmission): string | null {
  const ref = submission.relationships?.['person']?.data;
  if (!ref) return null;
  return Array.isArray(ref) ? (ref[0]?.id ?? null) : (ref.id ?? null);
}
