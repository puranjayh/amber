/**
 * HCP panel from rank() output. Generate-only — do not import from a Next route.
 */
import type { PairResult, Patient, Trial } from "@/src/contracts";
import { rank } from "@/src/engine";
import { assignPhysician, DEFAULT_PHYSICIAN_ID, PHYSICIANS } from "@/components/hcp/roster";
import { phaseVisits, rankTrialsByWorth, titleSuggestsPlacebo, trialWorth } from "@/components/hcp/worth";
import type { HcpPanel, HcpPatientRow, HcpTrialRow, PortalAnswers } from "./schema";

if (process.env.NEXT_RUNTIME) {
  throw new Error("app/_data/hcp.ts is a generate step. Do not import it from a route.");
}

const TOP_TRIALS = 10;

function travelMinutes(patient: Patient | undefined, trial: Trial | undefined): number | null {
  const minutes = trial?.siteDistanceMinutes ?? patient?.travelMinutes;
  return minutes === undefined ? null : minutes;
}

function seedPortal(patient: Patient): PortalAnswers {
  const prefs = patient.preferences ?? {};
  const out: PortalAnswers = {};
  if (prefs.maxTravelMinutes !== undefined) out.maxTravelMinutes = prefs.maxTravelMinutes;
  if (prefs.maxExtraVisitsPerMonth !== undefined) out.maxExtraVisitsPerMonth = prefs.maxExtraVisitsPerMonth;
  if (prefs.acceptsPlacebo !== undefined) out.acceptsPlacebo = prefs.acceptsPlacebo;
  return out;
}

function trialRow(pair: PairResult, patient: Patient | undefined, trial: Trial | undefined): HcpTrialRow {
  const minutes = travelMinutes(patient, trial);
  const visitBurden = phaseVisits(trial?.phase ?? "");
  return {
    nctId: pair.nctId,
    title: trial?.title ?? pair.nctId,
    phase: trial?.phase ?? "",
    unknownCount: pair.unknownCount,
    expectedValue: pair.expectedValue,
    resolutionCost: pair.resolutionCost,
    travelMinutes: minutes,
    visitBurden,
    likelyPlacebo: titleSuggestsPlacebo(trial?.title ?? ""),
    worth: trialWorth(pair.expectedValue, pair.resolutionCost, minutes, visitBurden),
  };
}

export function buildHcpPanel(
  cube: readonly PairResult[],
  patients: readonly Patient[],
  trials: readonly Trial[],
): HcpPanel {
  const ctx = { patients, trials };
  const patientById = new Map(patients.map((p) => [p.id, p]));
  const trialById = new Map(trials.map((t) => [t.nctId, t]));
  const byPhysician = new Map<string, HcpPatientRow[]>();
  for (const p of PHYSICIANS) byPhysician.set(p.id, []);

  for (const patient of patients) {
    const pairs = cube.filter((row) => row.patientId === patient.id);
    const live = rank(pairs, ctx);
    const [best] = live;
    const closest = best ?? [...pairs].sort((a, b) => a.nctId.localeCompare(b.nctId))[0];
    if (!closest) continue;

    const portal = seedPortal(patient);
    const trialRows = rankTrialsByWorth(
      live.map((pair) => trialRow(pair, patient, trialById.get(pair.nctId))),
      portal,
    ).slice(0, TOP_TRIALS);
    const row: HcpPatientRow = {
      patientId: patient.id,
      unknownCount: closest.unknownCount,
      expectedValue: closest.expectedValue,
      resolutionCost: closest.resolutionCost,
      travelMinutes: travelMinutes(patient, trialById.get(closest.nctId)),
      bestNctId: closest.nctId,
      liveTrials: live.length,
      portal,
      trials: trialRows,
    };
    const physicianId = assignPhysician(patient.id);
    const bucket = byPhysician.get(physicianId) ?? [];
    bucket.push(row);
    byPhysician.set(physicianId, bucket);
  }

  const byEnrolment = (a: HcpPatientRow, b: HcpPatientRow) => {
    if (a.unknownCount !== b.unknownCount) return a.unknownCount - b.unknownCount;
    if (a.expectedValue !== b.expectedValue) return b.expectedValue - a.expectedValue;
    const ta = a.travelMinutes ?? Number.POSITIVE_INFINITY;
    const tb = b.travelMinutes ?? Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta - tb;
    return a.patientId.localeCompare(b.patientId);
  };

  return {
    channel: "Impiricus",
    defaultPhysicianId: DEFAULT_PHYSICIAN_ID,
    physicians: PHYSICIANS.map((p) => ({
      ...p,
      patients: (byPhysician.get(p.id) ?? []).sort(byEnrolment),
    })),
  };
}
