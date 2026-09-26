import type { CriterionLeaf, Trial } from "@/src/contracts";
import type { ElasticitySweep } from "@/app/_data/schema";
import { collectLeaves } from "@/components/criteria/rows";

export type AnalyteFamily = {
  key: "anc" | "albumin" | "crcl" | "platelets";
  label: string;
  match: RegExp;
};

export const ANALYTE_FAMILIES: readonly AnalyteFamily[] = [
  { key: "anc", label: "ANC", match: /^(anc|absolute neutrophil|neutrophil)/i },
  { key: "albumin", label: "albumin", match: /^(alb|albumin|serum albumin)/i },
  { key: "crcl", label: "creatinine clearance", match: /creatinine clearance|^crcl$|^ccr$|^egfr$/i },
  { key: "platelets", label: "platelets", match: /^(plt|platelet)/i },
];

export type SweepPick = {
  family: AnalyteFamily["key"];
  label: string;
  nctId: string;
  criterionId: string;
  leaf: CriterionLeaf;
  /** max eligible − min eligible on the published sweep. */
  swing: number;
};

function swingOf(points: { eligibleCount: number }[]): number {
  if (points.length === 0) return 0;
  const counts = points.map((p) => p.eligibleCount);
  return Math.max(...counts) - Math.min(...counts);
}

function familyOf(leaf: CriterionLeaf): AnalyteFamily | undefined {
  const name = leaf.analyte ?? leaf.predicate;
  return ANALYTE_FAMILIES.find((f) => f.match.test(name.trim()));
}

/** One real sweep per family. Hero trial wins when it has the analyte. */
export function pickAnalyteSweeps(
  sweeps: ElasticitySweep[],
  trials: Trial[],
  pinNctId: string,
): SweepPick[] {
  const trialById = new Map(trials.map((t) => [t.nctId, t]));
  const best = new Map<AnalyteFamily["key"], SweepPick>();
  for (const sweep of sweeps) {
    const trial = trialById.get(sweep.nctId);
    if (!trial) continue;
    const leaf = collectLeaves(trial.criteria).get(sweep.criterionId);
    if (!leaf || typeof leaf.value !== "number") continue;
    const family = familyOf(leaf);
    if (!family) continue;
    const next: SweepPick = {
      family: family.key,
      label: family.label,
      nctId: sweep.nctId,
      criterionId: sweep.criterionId,
      leaf,
      swing: swingOf(sweep.points),
    };
    const held = best.get(family.key);
    if (!held) {
      best.set(family.key, next);
      continue;
    }
    if (next.swing !== held.swing) {
      if (next.swing > held.swing) best.set(family.key, next);
      continue;
    }
    const pinWins = next.nctId === pinNctId && held.nctId !== pinNctId;
    const betterId = next.nctId < held.nctId;
    if (pinWins || (held.nctId !== pinNctId && betterId)) best.set(family.key, next);
  }
  return ANALYTE_FAMILIES.map((f) => best.get(f.key)).filter((p): p is SweepPick => Boolean(p));
}

export function landscapeAliases(family: AnalyteFamily["key"]): RegExp {
  return ANALYTE_FAMILIES.find((f) => f.key === family)?.match ?? /^$/;
}

/** A one-patient 0↔1 sweep is not a threshold that binds. */
export const BINDING_SWING = 2;

export function isBinding(pick: SweepPick): boolean {
  return pick.swing >= BINDING_SWING;
}

export const INERT_NOTE = "no patients in this cohort carry this lab, so the threshold doesn't bind.";

export function defaultBindingPick(picks: SweepPick[]): SweepPick | undefined {
  const pinned = picks.find((p) => p.nctId === "NCT02496663" && p.criterionId === "INC-10" && p.swing > 0);
  const binding = picks.filter(isBinding);
  return (
    pinned ??
    binding.find((p) => p.nctId === "NCT03838159" && p.criterionId === "INC-6") ??
    [...binding].sort((a, b) => b.swing - a.swing)[0]
  );
}
