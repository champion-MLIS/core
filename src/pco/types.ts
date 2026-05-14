import { z } from 'zod';

/**
 * Planning Center Online uses JSON:API. Every collection response shares the
 * same envelope; only the `attributes` shape changes per resource type.
 *
 * We validate the envelope strictly and the resource attributes loosely —
 * PCO occasionally adds fields, and we don't want to fail a poll over a new
 * attribute we don't yet care about.
 */

export const PcoRelationshipRef = z.object({
  data: z
    .union([
      z.object({ type: z.string(), id: z.string() }),
      z.array(z.object({ type: z.string(), id: z.string() })),
      z.null(),
    ])
    .optional(),
});

export const PcoResource = <A extends z.ZodTypeAny>(attributes: A) =>
  z.object({
    type: z.string(),
    id: z.string(),
    attributes,
    relationships: z.record(z.string(), PcoRelationshipRef).optional(),
    links: z.record(z.string(), z.string()).optional(),
  });

export const PcoCollection = <A extends z.ZodTypeAny>(attributes: A) =>
  z.object({
    data: z.array(PcoResource(attributes)),
    included: z.array(z.unknown()).optional(),
    links: z
      .object({
        self: z.string().optional(),
        next: z.string().optional(),
        prev: z.string().optional(),
      })
      .passthrough()
      .optional(),
    meta: z
      .object({
        total_count: z.number().optional(),
        count: z.number().optional(),
        can_order_by: z.array(z.string()).optional(),
        can_query_by: z.array(z.string()).optional(),
        parent: z.unknown().optional(),
      })
      .passthrough()
      .optional(),
  });

/**
 * People resource — only the attributes we care about for Guest Intake.
 * Everything else PCO returns is allowed through via passthrough().
 */
export const PcoPersonAttributes = z
  .object({
    first_name: z.string().nullable().optional(),
    last_name: z.string().nullable().optional(),
    nickname: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    given_name: z.string().nullable().optional(),
    membership: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    child: z.boolean().nullable().optional(),
    birthdate: z.string().nullable().optional(),
    grade: z.number().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string().nullable().optional(),
  })
  .passthrough();

export const PcoPeopleCollection = PcoCollection(PcoPersonAttributes);

export type PcoPerson = z.infer<typeof PcoPeopleCollection>['data'][number];
export type PcoPeopleResponse = z.infer<typeof PcoPeopleCollection>;

/**
 * Included resource accessors. We pull emails, phones, and households in the
 * same request via ?include= and resolve them by id from the `included` array.
 */
export const PcoEmailAttributes = z
  .object({
    address: z.string(),
    location: z.string().nullable().optional(),
    primary: z.boolean().optional(),
    blocked: z.boolean().optional(),
  })
  .passthrough();

export const PcoPhoneAttributes = z
  .object({
    number: z.string(),
    location: z.string().nullable().optional(),
    primary: z.boolean().optional(),
    carrier: z.string().nullable().optional(),
  })
  .passthrough();

export const PcoHouseholdAttributes = z
  .object({
    name: z.string().nullable().optional(),
    member_count: z.number().optional(),
    primary_contact_id: z.string().nullable().optional(),
  })
  .passthrough();

export const PcoIncludedItem = z.object({
  type: z.string(),
  id: z.string(),
  attributes: z.record(z.string(), z.unknown()),
  relationships: z.record(z.string(), PcoRelationshipRef).optional(),
});

export type PcoIncluded = z.infer<typeof PcoIncludedItem>;
