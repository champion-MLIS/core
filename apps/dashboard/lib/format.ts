/**
 * Date/time formatters tuned for Champion's local context (Yuma — Mountain
 * Time with no DST, America/Phoenix). Keep these in one place so screens
 * stay consistent.
 */

const TZ = 'America/Phoenix';

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Relative-time phrase: "today", "tomorrow", "in 3 days", "2 days ago".
 * Useful for the due-date column on the worklist.
 */
export function relativeDay(iso: string, now: Date = new Date()): string {
  const target = new Date(iso);
  const targetDay = startOfDay(target);
  const nowDay = startOfDay(now);
  const diffMs = targetDay.getTime() - nowDay.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays === -1) return 'yesterday';
  if (diffDays > 0) return `in ${diffDays} days`;
  return `${-diffDays} days ago`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Format an E.164 US number for display: "+19285551234" → "(928) 555-1234".
 * Falls back to the raw value for anything non-standard.
 */
export function formatPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (ten.length === 10) return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
  return e164;
}
