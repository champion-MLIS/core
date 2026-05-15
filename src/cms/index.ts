/**
 * CMS factory — picks the right adapter based on church config.
 *
 * Today, Champion uses PCO; the factory always returns PcoAdapter.
 * Tomorrow, when a Breeze/CCB/Rock church onboards Church Reimagined,
 * we add a case here. Consumers (intake mirror, signal poller) never
 * change — they just receive a CmsAdapter and use it.
 */

import { loadEnv } from '../config/env.ts';
import { PcoAdapter } from './pco/adapter.ts';
import { PcoClient } from '../pco/client.ts';
import type { CmsAdapter } from './adapter.ts';

export type { CmsAdapter } from './adapter.ts';
export type {
  CmsPerson,
  CmsHousehold,
  CmsEmail,
  CmsPhone,
  CmsForm,
  CmsFormSubmission,
  CmsDonation,
  CmsCheckIn,
  CmsServicePlan,
  ListOptions,
} from './adapter.ts';
export { PcoAdapter } from './pco/adapter.ts';

let cached: CmsAdapter | null = null;

/**
 * Get the CMS adapter for this MLIS install.
 *
 * Today: looks at env (PCO_APP_ID + PCO_SECRET) and returns PcoAdapter.
 * Future: reads from `church_config.cms_kind` in the DB and chooses the
 * appropriate adapter implementation. Credentials come from env per-vendor.
 */
export function getCms(): CmsAdapter {
  if (cached) return cached;
  const env = loadEnv();
  const pco = new PcoClient({ appId: env.PCO_APP_ID, secret: env.PCO_SECRET });
  cached = new PcoAdapter(pco);
  return cached;
}

/** Tests only — inject a stub adapter. */
export function _setCmsForTesting(adapter: CmsAdapter): void {
  cached = adapter;
}

/** Tests only — clear cached adapter. */
export function _resetCmsForTesting(): void {
  cached = null;
}
