# Planning Center Online — Integration Notes

The MLIS treats Planning Center Online (PCO) as the system of record. Every person, every signal that triggers a workflow, every household relationship — all of it starts here.

This doc captures the PCO conventions the codebase relies on. When PCO behavior surprises us, it gets documented here.

---

## Authentication

**Method:** HTTP Basic with App ID + Secret (Personal Access Token).

```
Authorization: Basic base64(APP_ID:SECRET)
```

Credentials live in 1Password under the **Champion Church — Systems** vault and are loaded from `.env` at runtime. Never commit them. Never log them.

Generated at: https://api.planningcenteronline.com/oauth/applications

> The architecture doc references OAuth2 as a future option. For Step 1 we use the Personal Access Token style because it's already provisioned and avoids a redirect/consent flow. If we later need per-user authorization (e.g. a staff member acting on their own PCO permissions), we'll add OAuth2 alongside, not in place of.

---

## Base URL & Products

```
https://api.planningcenteronline.com
```

PCO is a family of products. Each lives at its own path:

| Product | Path prefix | MLIS use |
|---|---|---|
| People | `/people/v2` | Primary — every guest, every profile, every household |
| Check-Ins | `/check-ins/v2` | Child check-in signals, attendance |
| Giving | `/giving/v2` | First-time giving signal |
| Groups | `/groups/v2` | Group membership for Grouped stage |
| Services | `/services/v2` | Sermon title / service plan enrichment |
| Calendar | `/calendar/v2` | Starting Point scheduling |

Step 1 only touches **People**. The rest come online as workflows demand them.

---

## Response Envelope (JSON:API)

Every PCO collection response has the same shape:

```jsonc
{
  "data":     [ /* primary resources */ ],
  "included": [ /* sideloaded resources, opt-in via ?include= */ ],
  "links":    { "self": "...", "next": "...", "prev": "..." },
  "meta":     { "total_count": 137, "count": 25, "can_order_by": [...], "can_query_by": [...] }
}
```

Resolve relationships by id from the `included` array — see `src/pco/people.ts` for the helpers (`findIncluded`, `primaryEmail`, `primaryPhone`).

The Zod schemas in `src/pco/types.ts` validate the envelope strictly and the resource attributes loosely (`.passthrough()`). PCO occasionally adds attributes; we don't want a poll to fail over a new field we don't yet care about.

---

## Pagination

PCO paginates with `per_page` (max 100) and `offset`, and provides a `links.next` URL when more pages exist.

```
GET /people/v2/people?per_page=100&order=-created_at
```

For Step 1 we fetch one page. The eventual Guest Intake polling loop will walk `links.next` until the first record is older than the last successful poll timestamp.

---

## Sorting & Filtering

- **Sort:** `?order=-created_at` (descending), `?order=created_at` (ascending). Available sort fields are listed in `meta.can_order_by` on each response.
- **Filter:** `?where[attribute]=value`. Queryable fields are listed in `meta.can_query_by`. Combinations are ANDed.

Example — guests created in the last hour:
```
GET /people/v2/people?where[created_at][gte]=2026-05-13T17:00:00Z&order=-created_at
```

---

## Including Related Resources

Sideloading via `?include=` is how we get emails, phone numbers, and household membership in a single request:

```
GET /people/v2/people?include=emails,phone_numbers,households
```

The related items appear in the top-level `included` array, referenced by id from each person's `relationships` object.

**Resource type names PCO uses (case matters):**

| Relationship key | Included `type` |
|---|---|
| `emails` | `Email` |
| `phone_numbers` | `PhoneNumber` |
| `households` | `Household` |
| `field_data` | `FieldDatum` |
| `addresses` | `Address` |

---

## Rate Limits

**100 requests per 20-second window, per application.**

PCO returns these headers on every response:

```
X-PCO-API-Request-Rate-Count: 12
X-PCO-API-Request-Rate-Limit: 100
X-PCO-API-Request-Rate-Period: 20
```

When exceeded, PCO returns `429 Too Many Requests` with a JSON body containing `retry_after` (in seconds). The client (`src/pco/client.ts`) honors this on retry.

**Our budget:** the polling worker fires every 15 minutes during/after services. At one paginated walk per poll (typically 1–3 pages), we use ~3% of the limit. Plenty of headroom for ad-hoc CLI use and the eventual Stage Transition Agent.

---

## Webhooks

Available, not yet used. PCO can post to a webhook URL on resource changes (person created, form submitted, check-in recorded). Faster than polling but requires a public HTTPS endpoint and signature verification.

**Plan:** add webhooks after the polling intake is shipped and stable. Webhook receiver becomes the primary fast path; the poll becomes the reconciliation safety net.

---

## What "First-Time Guest" Looks Like in PCO

The Guest Follow-Up workflow triggers on any of:

| Signal | PCO surface |
|---|---|
| Connect card submitted | Form submission in People → People form responses |
| First-time giving recorded | Giving — donor's first donation record |
| Child check-in (no profile) | Check-Ins — household appears without a People match |
| Written prayer request | People form designated as the prayer form |

A "new person" in People alone is not enough — Champion uses the People product as a directory, so new records appear for many reasons (added by staff, imported, etc.). The trigger is **new person + one of the above signals within a service window.**

This is encoded as logic in the Guest Intake Agent, not in the PCO client. The client just speaks PCO.

---

## Known Quirks

> Empty for now. Add entries as we discover them.

- _(reserved)_

---

## References

- PCO API docs: https://developer.planning.center/docs/
- Authentication: https://developer.planning.center/docs/#/overview/authentication
- People API: https://developer.planning.center/docs/#/apps/people
- Rate limiting: https://developer.planning.center/docs/#/overview/rate-limiting
