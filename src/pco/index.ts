export { PcoClient, PcoError, type PcoClientOptions, type PcoRequestOptions } from './client.ts';
export {
  listPeople,
  findIncluded,
  primaryEmail,
  primaryPhone,
  type ListPeopleOptions,
  type ListPeopleResult,
} from './people.ts';
export type {
  PcoPerson,
  PcoPeopleResponse,
  PcoIncluded,
} from './types.ts';
