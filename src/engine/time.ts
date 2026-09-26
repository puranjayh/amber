/**
 * Exact date math for staleness windows.
 *
 * The engine never reads a clock — every age is measured against the caller's
 * `asOf` (docs/CONTRACT.md §4 rule 1). Everything here is also timezone-proof:
 * we take the calendar date out of the string and rebuild it at UTC midnight,
 * so `2026-09-18` and `2026-09-18T23:40:00` and `2026-09-18T23:40:00-07:00`
 * all measure the same, on every machine, in every CI region. A bare
 * `Date.parse("2026-09-18T10:00:00")` would be read in local time and the
 * same fixture would go stale in one timezone and not another.
 *
 * Time-of-day is deliberately discarded. A recency window is expressed in whole
 * days ("ANC within 14 days"), so whole days is the only precision that means
 * anything here.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

const MS_PER_DAY = 86_400_000;

/**
 * Calendar date → UTC-midnight epoch milliseconds, or null when the string is
 * not a real date. Rejects impossible dates (`2026-02-31`) rather than letting
 * JavaScript roll them forward into March — reject, never coerce (rule 5).
 */
export function parseIsoDate(iso: string): number | null {
  const m = ISO_DATE.exec(iso.trim());
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const ms = Date.UTC(year, month - 1, day);
  const back = new Date(ms);
  // Round-trip: Date.UTC silently normalises 2026-02-31 to 2026-03-03.
  if (
    back.getUTCFullYear() !== year ||
    back.getUTCMonth() !== month - 1 ||
    back.getUTCDate() !== day
  ) {
    return null;
  }
  return ms;
}

/**
 * Whole days from `earlier` to `later`. Negative when `later` precedes
 * `earlier`. Null when either string is not a date.
 */
export function daysBetween(earlierIso: string, laterIso: string): number | null {
  const a = parseIsoDate(earlierIso);
  const b = parseIsoDate(laterIso);
  if (a === null || b === null) return null;
  return Math.round((b - a) / MS_PER_DAY);
}

/**
 * How old a fact is at `asOf`, in whole days, clamped at zero.
 *
 * A fact dated after `asOf` is reported as age 0 rather than as a negative
 * number: it is not stale, and no caller should have to defend against
 * "minus six days old". Null when either date is unparseable — the caller
 * must then treat recency as unestablished, not as fresh.
 */
export function ageInDays(observedAt: string, asOf: string): number | null {
  const d = daysBetween(observedAt, asOf);
  if (d === null) return null;
  return Math.max(0, d);
}
