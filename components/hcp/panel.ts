import type { EquityRow, Patient, Trial } from "@/src/contracts";
import type { EquitySet, WorklistRow } from "@/app/_data/schema";
import { compositionHeadline, raceLabel, shares } from "./race";

export const PANEL_SIZE = 25;

export type GroupHit = {
  criterionId: string;
  group: string;
  rate: number;
  peerMax: number;
};

export function takePanel(worklist: WorklistRow[], size = PANEL_SIZE, pinId?: string): WorklistRow[] {
  const head = worklist.slice(0, size);
  if (!pinId || head.some((r) => r.patientId === pinId)) return head;
  const pin = worklist.find((r) => r.patientId === pinId);
  if (!pin) return head;
  return [...head.slice(0, Math.max(0, size - 1)), pin];
}

function rateFor(rates: Record<string, number>, race: string): number | undefined {
  if (rates[race] !== undefined) return rates[race];
  const want = raceLabel(race).toLowerCase();
  const hit = Object.entries(rates).find(([key]) => raceLabel(key).toLowerCase() === want);
  return hit?.[1];
}

/** True when this criterion's exclusion rate for the patient's group is the unique high. */
export function blockingHitsGroup(row: EquityRow | undefined, race: string): GroupHit | undefined {
  if (!row) return undefined;
  const group = raceLabel(race);
  const mine = rateFor(row.exclusionRateBySubgroup, race);
  if (mine === undefined) return undefined;
  const peers = Object.entries(row.exclusionRateBySubgroup)
    .filter(([key]) => raceLabel(key) !== group)
    .map(([, rate]) => rate);
  const peerMax = peers.length ? Math.max(...peers) : 0;
  if (mine <= peerMax) return undefined;
  return { criterionId: row.criterionId, group, rate: mine, peerMax };
}

export function panelComposition(
  panel: WorklistRow[],
  worklist: WorklistRow[],
  patients: Patient[],
): { panel: Record<string, number>; admitted: Record<string, number>; headline: string } {
  const byId = new Map(patients.map((p) => [p.id, p]));
  const labelOf = (id: string) => raceLabel(byId.get(id)?.race ?? "Unknown");
  const panelShare = shares(panel.map((r) => labelOf(r.patientId)));
  const admitted = worklist.filter((r) => !r.eliminated);
  const admittedShare = shares((admitted.length ? admitted : worklist).map((r) => labelOf(r.patientId)));
  return {
    panel: panelShare,
    admitted: admittedShare,
    headline: compositionHeadline(panelShare, admittedShare).text,
  };
}

export function hitForPair(
  nctId: string,
  criterionId: string,
  race: string,
  equity: EquitySet[],
): GroupHit | undefined {
  const set = equity.find((e) => e.nctId === nctId);
  const row = set?.rows.find((r) => r.criterionId === criterionId);
  return blockingHitsGroup(row, race);
}

export function trialTitle(trial: Trial | undefined, nctId: string): string {
  return trial?.title ?? nctId;
}
