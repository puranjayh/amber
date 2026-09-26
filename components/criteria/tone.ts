import type { Verdict } from "@/src/contracts";

export type CriterionType = "inclusion" | "exclusion";
export type Tone = "green" | "red" | "amber";

/**
 * CONTRACT §4 ruling: verdicts are criterion-oriented ("does the predicate hold?").
 * Tone is patient-oriented (green = good for this patient) and is always derived here,
 * never stored.
 */
export function displayTone(
  cell: { verdict: Verdict },
  type: CriterionType,
): Tone {
  if (cell.verdict === "UNKNOWN") return "amber";
  const good = type === "inclusion" ? cell.verdict === "PASS" : cell.verdict === "FAIL";
  return good ? "green" : "red";
}

/** Cells whose criterion type cannot be resolved are skipped rather than guessed. */
export function toneCounts(
  cells: { criterionId: string; verdict: Verdict }[],
  typeOf: (criterionId: string) => CriterionType | undefined,
): Record<Tone, number> {
  const counts: Record<Tone, number> = { green: 0, red: 0, amber: 0 };
  for (const cell of cells) {
    const type = typeOf(cell.criterionId);
    if (type) counts[displayTone(cell, type)] += 1;
  }
  return counts;
}

export function toneMeaning(verdict: Verdict, type: CriterionType): string {
  if (verdict === "UNKNOWN") return "cannot tell from the record";
  if (type === "inclusion") {
    return verdict === "PASS" ? "patient meets this criterion" : "patient does not meet this criterion";
  }
  return verdict === "PASS" ? "patient matches this exclusion" : "patient clears this exclusion";
}
