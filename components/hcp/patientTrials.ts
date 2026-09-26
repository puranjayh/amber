import type { Patient, Trial } from "@/src/contracts";
import type { HcpTrialRow, PortalAnswers } from "@/app/_data/schema";
import { phaseVisits, rankTrialsByWorth, titleSuggestsPlacebo, trialWorth } from "./worth";

export type WorthPair = {
  nctId: string;
  unknownCount: number;
  expectedValue: number;
  resolutionCost: number;
  eliminated: boolean;
};

/** Non-eliminated trials, ranked by what they are worth to this patient. */
export function trialsByWorth(
  pairs: readonly WorthPair[],
  trialOf: (nctId: string) => Trial | undefined,
  patient: Patient | undefined,
  answers: PortalAnswers = {},
): HcpTrialRow[] {
  const live = pairs.filter((pair) => !pair.eliminated);
  const source = live.length > 0 ? live : pairs;
  const rows = source.map((pair) => {
    const trial = trialOf(pair.nctId);
    const minutes = trial?.siteDistanceMinutes ?? patient?.travelMinutes;
    const travelMinutes = minutes === undefined ? null : minutes;
    const visitBurden = phaseVisits(trial?.phase ?? "");
    return {
      nctId: pair.nctId,
      title: trial?.title ?? pair.nctId,
      phase: trial?.phase ?? "",
      unknownCount: pair.unknownCount,
      expectedValue: pair.expectedValue,
      resolutionCost: pair.resolutionCost,
      travelMinutes,
      visitBurden,
      likelyPlacebo: titleSuggestsPlacebo(trial?.title ?? ""),
      worth: trialWorth(pair.expectedValue, pair.resolutionCost, travelMinutes, visitBurden, answers.driver),
    };
  });
  return rankTrialsByWorth(rows, answers).slice(0, 10);
}
