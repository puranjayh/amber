const SECOND = "NCT02496663";
const FIRST = "NCT06281964";
const STORY = new Set(["PT-4410", "PT-4411", "PT-4412", "PT-4413"]);

type Cell = { criterionId: string; verdict: string };

function verdict(cells: readonly Cell[], id: string): string | undefined {
  return cells.find((cell) => cell.criterionId === id)?.verdict;
}

/**
 * First-line and second-line invert on prior erlotinib. The sentence is only
 * returned when both sides of that inversion are actually in the cells.
 */
export function erlotinibFlip(args: {
  patientId: string;
  selectedNct: string;
  selectedEliminated: boolean;
  selectedCells: readonly Cell[];
  otherEliminated: boolean;
  otherCells: readonly Cell[];
  otherNct: string;
}): string | null {
  if (!STORY.has(args.patientId)) return null;
  const onSecond = args.selectedNct === SECOND;
  const onFirst = args.selectedNct === FIRST;
  if (!onSecond && !onFirst) return null;
  if (args.otherNct !== (onSecond ? FIRST : SECOND)) return null;

  const secondElim = onSecond ? args.selectedEliminated : args.otherEliminated;
  const firstElim = onFirst ? args.selectedEliminated : args.otherEliminated;
  const secondCells = onSecond ? args.selectedCells : args.otherCells;
  const firstCells = onFirst ? args.selectedCells : args.otherCells;
  const qualifies = !secondElim && verdict(secondCells, "INC-7") === "PASS";
  const excludes = firstElim && verdict(firstCells, "EXC-1") === "PASS";
  if (!qualifies || !excludes) return null;

  const stage = ["INC-3", "INC-5"].filter((id) => verdict(firstCells, id) === "FAIL");
  if (onFirst) {
    const extra = stage.length
      ? ` The stage wording on this protocol also does not match the chart (${stage.join(", ")}).`
      : "";
    return `Excluded here because she's had erlotinib; that same history is what qualifies her for the other trial.${extra}`;
  }
  const extra = stage.length
    ? " On the other trial, the stage wording does not match the chart either."
    : "";
  return `Qualified here because she's had erlotinib; that same history is what excludes her from the other trial.${extra}`;
}

export function storyNote(args: {
  patientId: string;
  nctId: string;
  eliminated: boolean;
  cells: readonly Cell[];
}): string | null {
  if (args.patientId === "PT-4411" && args.nctId === SECOND && args.eliminated && verdict(args.cells, "INC-7") === "FAIL") {
    return "Says no. Medication history is carboplatin, not erlotinib, gefitinib, or afatinib, so INC-7 fails.";
  }
  if (args.patientId === "PT-4412" && args.nctId === SECOND && args.eliminated && verdict(args.cells, "INC-10") === "FAIL") {
    return "ANC is about 1,400/mcL, so INC-10 fails as written. At 1,400 she is no longer out on this criterion alone.";
  }
  if (args.patientId === "PT-4410" && args.nctId === SECOND && !args.eliminated) {
    const egfr = ["INC-2", "INC-3", "INC-4", "INC-5", "INC-6"].every(
      (id) => verdict(args.cells, id) === "UNKNOWN",
    );
    if (egfr && verdict(args.cells, "INC-9") === "PASS") {
      return "No EGFR result on file, so INC-2 through INC-6 stay unknown. The ECOG is eight months old and still counts — this compiled leaf has no recency window.";
    }
  }
  return null;
}
