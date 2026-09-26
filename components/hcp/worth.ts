import type { HcpPatientRow, HcpTrialRow, PortalAnswers } from "@/app/_data/schema";

/**
 * Phase visit load is a proxy — Trial has no visits-per-month field.
 * Earlier phases ask more of the patient; unlabelled phases sit in the middle.
 */
export function phaseVisits(phase: string): number {
  const digits = [...phase.matchAll(/\d+/g)].map((m) => Number(m[0]));
  const top = digits.length ? Math.max(...digits) : 0;
  const rank = /early/i.test(phase) && top === 1 ? 0.5 : top;
  if (rank <= 0) return 2;
  if (rank <= 1) return 4;
  if (rank <= 2) return 2;
  return 1;
}

/** Title is the only placebo signal on a frozen Trial. */
export function titleSuggestsPlacebo(title: string): boolean {
  return /placebo/i.test(title);
}

/**
 * What the trial costs the patient: resolution (tier weights) + travel + phase
 * visit load. Travel is minutes/30 so an hour matches a cheap blood-draw.
 */
export function costThem(
  resolutionCost: number,
  travelMinutes: number | null,
  visitBurden: number,
  driver?: PortalAnswers["driver"],
): number {
  const travel = travelMinutes === null || !Number.isFinite(travelMinutes) ? 6 : travelMinutes / 30;
  const ride = driver === "none" ? travel * 2 : travel;
  return resolutionCost + ride + visitBurden;
}

export function trialWorth(
  expectedValue: number,
  resolutionCost: number,
  travelMinutes: number | null,
  visitBurden: number,
  driver?: PortalAnswers["driver"],
): number {
  return expectedValue / (1 + costThem(resolutionCost, travelMinutes, visitBurden, driver));
}

export type TrialFit = { ok: boolean; reasons: string[] };

export function trialFits(trial: HcpTrialRow, answers: PortalAnswers): TrialFit {
  const reasons: string[] = [];
  if (answers.maxTravelMinutes !== undefined && trial.travelMinutes !== null) {
    if (trial.travelMinutes > answers.maxTravelMinutes) reasons.push("too far");
  }
  if (answers.maxExtraVisitsPerMonth !== undefined && trial.visitBurden > answers.maxExtraVisitsPerMonth) {
    reasons.push("too many visits");
  }
  if (answers.acceptsPlacebo === false && trial.likelyPlacebo) reasons.push("placebo arm");
  if (answers.driver === "none" && trial.travelMinutes !== null && trial.travelMinutes > 45) {
    reasons.push("no ride");
  }
  return { ok: reasons.length === 0, reasons };
}

function compareWorth(a: HcpTrialRow, b: HcpTrialRow): number {
  if (a.worth !== b.worth) return b.worth - a.worth;
  if (a.unknownCount !== b.unknownCount) return a.unknownCount - b.unknownCount;
  if (a.resolutionCost !== b.resolutionCost) return a.resolutionCost - b.resolutionCost;
  return a.nctId.localeCompare(b.nctId);
}

export function rankTrialsByWorth(trials: readonly HcpTrialRow[], answers: PortalAnswers = {}): HcpTrialRow[] {
  const scored = trials.map((trial) => ({
    ...trial,
    worth: trialWorth(trial.expectedValue, trial.resolutionCost, trial.travelMinutes, trial.visitBurden, answers.driver),
  }));
  const fitting = scored.filter((t) => trialFits(t, answers).ok).sort(compareWorth);
  const closed = scored.filter((t) => !trialFits(t, answers).ok).sort(compareWorth);
  return [...fitting, ...closed];
}

/**
 * Portal answers re-rank the physician's list: patients whose remaining
 * fitting trial is closer to enrolable rise; preferences that close every
 * live trial sink the row.
 */
function bestEnrolable(trials: readonly HcpTrialRow[], answers: PortalAnswers): HcpTrialRow | undefined {
  return trials
    .filter((t) => trialFits(t, answers).ok)
    .slice()
    .sort((a, b) => {
      if (a.unknownCount !== b.unknownCount) return a.unknownCount - b.unknownCount;
      if (a.expectedValue !== b.expectedValue) return b.expectedValue - a.expectedValue;
      const at = a.travelMinutes ?? Number.POSITIVE_INFINITY;
      const bt = b.travelMinutes ?? Number.POSITIVE_INFINITY;
      if (at !== bt) return at - bt;
      return a.nctId.localeCompare(b.nctId);
    })[0];
}

export function rankPatientsForPhysician(
  patients: readonly HcpPatientRow[],
  answersByPatient: Record<string, PortalAnswers>,
): HcpPatientRow[] {
  const rows = patients.map((row) => {
    const answers = { ...row.portal, ...answersByPatient[row.patientId] };
    const trials = rankTrialsByWorth(row.trials, answers);
    return { row: { ...row, portal: answers, trials }, bestFit: bestEnrolable(trials, answers) };
  });

  const hasOverlay = patients.some((p) => answersByPatient[p.patientId] !== undefined);
  if (!hasOverlay) return rows.map((r) => r.row);

  return rows
    .sort((a, b) => {
      const af = a.bestFit ? 0 : 1;
      const bf = b.bestFit ? 0 : 1;
      if (af !== bf) return af - bf;
      const au = a.bestFit?.unknownCount ?? a.row.unknownCount;
      const bu = b.bestFit?.unknownCount ?? b.row.unknownCount;
      if (au !== bu) return au - bu;
      const ae = a.bestFit?.expectedValue ?? a.row.expectedValue;
      const be = b.bestFit?.expectedValue ?? b.row.expectedValue;
      if (ae !== be) return be - ae;
      const at = a.bestFit?.travelMinutes ?? a.row.travelMinutes ?? Number.POSITIVE_INFINITY;
      const bt = b.bestFit?.travelMinutes ?? b.row.travelMinutes ?? Number.POSITIVE_INFINITY;
      if (at !== bt) return at - bt;
      return a.row.patientId.localeCompare(b.row.patientId);
    })
    .map((r) => r.row);
}

export function mergePortal(base: PortalAnswers, overlay?: PortalAnswers): PortalAnswers {
  if (!overlay) return base;
  return { ...base, ...overlay };
}

export function portalAnswered(answers: PortalAnswers): boolean {
  return (
    answers.maxTravelMinutes !== undefined ||
    answers.maxExtraVisitsPerMonth !== undefined ||
    answers.acceptsPlacebo !== undefined ||
    answers.driver !== undefined
  );
}
