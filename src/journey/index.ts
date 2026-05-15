export {
  TOUCH_TEMPLATE,
  computeTouchTiming,
  type TouchTemplate,
} from './touch-template.ts';
export { enrollGuest, type EnrollOptions, type EnrollResult, type EnrollmentKind } from './enroll.ts';
export {
  markJourneyReturned,
  processReturnSignals,
  type MarkReturnedResult,
} from './return-detection.ts';
