import type { Patient, Trial } from "@/src/contracts";
import type { LoopPreference, PortalAnswers, WorklistRow } from "@/app/_data/schema";

export const LOOP_FOCUS = "PT-4401";
export const SEED_COUNT = 46;

export const SEED_PREFS: PortalAnswers = {
  maxTravelMinutes: 90,
  maxExtraVisitsPerMonth: 2,
  acceptsPlacebo: false,
  driver: "family",
};

export function prefsStated(prefs?: PortalAnswers | null): boolean {
  if (!prefs) return false;
  return (
    prefs.maxTravelMinutes !== undefined ||
    prefs.maxExtraVisitsPerMonth !== undefined ||
    prefs.acceptsPlacebo !== undefined ||
    prefs.driver !== undefined
  );
}

/**
 * Missing preferences is a real penalty, the same way a missing lab is.
 *
 * A patient with no stated preferences cannot be confidently matched — we do
 * not know whether the trial is reachable for them (travel, visits, a ride).
 * Absence here is UNKNOWN, not a default of "anywhere is fine." When they
 * answer, this term closes and they rise because we now know they can get
 * there, not because anyone hardcoded a boost.
 */
export function preferenceUnknown(prefs?: PortalAnswers | null): 0 | 1 {
  return prefsStated(prefs) ? 0 : 1;
}

export function toPortalAnswers(row: LoopPreference): PortalAnswers {
  return {
    maxTravelMinutes: row.maxTravelMinutes,
    maxExtraVisitsPerMonth: row.maxVisitsPerMonth,
    acceptsPlacebo: row.acceptsPlacebo,
    driver: row.driver,
  };
}

export function prefsByPatient(rows: readonly LoopPreference[]): Record<string, PortalAnswers> {
  const out: Record<string, PortalAnswers> = {};
  for (const row of rows) out[row.patientId] = toPortalAnswers(row);
  return out;
}

export function pairTravel(
  patient?: Pick<Patient, "travelMinutes">,
  trial?: Pick<Trial, "siteDistanceMinutes">,
): number {
  return trial?.siteDistanceMinutes ?? patient?.travelMinutes ?? Number.POSITIVE_INFINITY;
}

export type Rankable = Pick<WorklistRow, "patientId" | "nctId" | "unknownCount" | "expectedValue">;

/**
 * Engine rank() plus the preferences term. Same order otherwise: fewest
 * unknowns, then expected value, then travel, then ids.
 */
export function rank<T extends Rankable>(
  rows: readonly T[],
  prefs: Record<string, PortalAnswers | undefined>,
  travel: (row: T) => number,
): T[] {
  return rows.slice().sort((a, b) => {
    const au = a.unknownCount + preferenceUnknown(prefs[a.patientId]);
    const bu = b.unknownCount + preferenceUnknown(prefs[b.patientId]);
    if (au !== bu) return au - bu;
    if (a.expectedValue !== b.expectedValue) return b.expectedValue - a.expectedValue;
    const ta = travel(a);
    const tb = travel(b);
    if (ta !== tb) return ta - tb;
    if (a.nctId !== b.nctId) return a.nctId < b.nctId ? -1 : 1;
    if (a.patientId !== b.patientId) return a.patientId < b.patientId ? -1 : 1;
    return 0;
  });
}

export function rankIndex<T extends { patientId: string }>(rows: readonly T[], patientId: string): number {
  return rows.findIndex((row) => row.patientId === patientId);
}

export function rankReason(args: {
  place: number;
  prefs?: PortalAnswers;
  travelMinutes: number | null;
}): string {
  const n = args.place + 1;
  if (!prefsStated(args.prefs)) {
    return `ranked #${n}: clinically strong, preferences unknown.`;
  }
  const travel = args.travelMinutes;
  const limit = args.prefs?.maxTravelMinutes;
  if (travel !== null && Number.isFinite(travel) && limit !== undefined) {
    if (travel <= limit) {
      return `ranked #${n}: preferences received, trial is ${travel} min away, within their limit.`;
    }
    return `ranked #${n}: preferences received, trial is ${travel} min away, over their ${limit} min limit.`;
  }
  return `ranked #${n}: preferences received.`;
}

/** Other 2-unknown patients who already answered — they hold the top of the list. */
export function seedPatientIds(worklist: readonly WorklistRow[], focus = LOOP_FOCUS, n = SEED_COUNT): string[] {
  return worklist
    .filter((row) => row.unknownCount === 2 && row.patientId !== focus)
    .slice(0, n)
    .map((row) => row.patientId);
}

export function seedPreferenceRows(worklist: readonly WorklistRow[], at: string): LoopPreference[] {
  return seedPatientIds(worklist).map((patientId) => ({
    patientId,
    maxTravelMinutes: SEED_PREFS.maxTravelMinutes!,
    maxVisitsPerMonth: SEED_PREFS.maxExtraVisitsPerMonth!,
    acceptsPlacebo: SEED_PREFS.acceptsPlacebo!,
    driver: SEED_PREFS.driver!,
    updatedAt: at,
  }));
}
