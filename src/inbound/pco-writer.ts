/**
 * Production PcoPersonWriter — the live-CRM adapter for the broadcast
 * processor. Kept out of process-responses.ts so that module stays vendor-free
 * and testable; this is the thin seam that actually writes to PCO.
 */

import type { PcoClient } from '../pco/index.ts';
import { createPerson, addPhoneNumber } from '../pco/index.ts';
import type { PcoPersonWriter } from './process-responses.ts';

export function makePcoPersonWriter(client: PcoClient): PcoPersonWriter {
  return {
    async createPersonWithPhone({ phone, note }) {
      const person = await createPerson(client, { note: note ?? null });
      const phoneRec = await addPhoneNumber(client, person.pcoId, phone);
      return { pcoId: person.pcoId, phonePcoId: phoneRec.pcoId };
    },
  };
}
