import type { CubeCell, Patient, Predicate, Trial } from "@/src/contracts";
import { evaluate, explainCeiling, indexLeaves, isEliminating } from "@/src/engine";
import type { ChartNeed, CoverageFigure, PayerView, SettledExclusion } from "./schema";

const SETTLE: ReadonlySet<Predicate> = new Set(["prior_therapy", "comorbidity", "contraindication"]);

const SETTLE_KIND: Record<string, SettledExclusion["kind"]> = {
  prior_therapy: "drug fill",
  comorbidity: "comorbidity",
  contraindication: "concomitant fill",
};

const CHART_NEED: Partial<Record<Predicate, string>> = {
  lab_value: "the lab result — a claim only shows the panel was billed",
  biomarker: "the assay result — a claim only shows the test was billed",
  performance_status: "ECOG written at the bedside — it is never billed",
  staging: "the scan report — a claim only shows imaging was billed",
};

function eliminatingCells(cells: CubeCell[], trial: Trial): CubeCell[] {
  const leaves = indexLeaves(trial);
  return cells.filter((c) => {
    const leaf = leaves.get(c.criterionId);
    return leaf ? isEliminating(c.verdict, leaf.type) : false;
  });
}

/**
 * Claims-only evaluation against the fixture trials. Left column is every
 * elimination a claim is allowed to write (drug fill / comorbidity). Right
 * column is every remaining UNKNOWN, grouped by what a chart would have to
 * produce. Pure: same patients, same trials, same asOf → same view.
 */
export function buildPayerView(
  patients: Patient[],
  trials: Trial[],
  asOf: string,
  coverage: CoverageFigure | null,
  source: PayerView["source"],
): PayerView {
  const settled: SettledExclusion[] = [];
  const unknownBuckets = new Map<string, ChartNeed>();

  for (const patient of patients) {
    for (const trial of trials) {
      const pair = evaluate(patient, trial, asOf);
      const leaves = indexLeaves(trial);

      if (pair.eliminated) {
        for (const cell of eliminatingCells(pair.cells, trial)) {
          const leaf = leaves.get(cell.criterionId);
          if (!leaf || !SETTLE.has(leaf.predicate)) continue;
          if (cell.reason !== "satisfied" && cell.reason !== "contradicted") continue;
          settled.push({
            patientId: patient.id,
            nctId: trial.nctId,
            criterionId: cell.criterionId,
            predicate: leaf.predicate,
            kind: SETTLE_KIND[leaf.predicate] ?? "comorbidity",
            claimLine: cell.chartCitation ?? cell.criterionCitation,
            sourceDoc: patient.facts.find((f) => f.predicate === leaf.predicate)?.sourceDoc,
          });
        }
      }

      if (pair.eliminated) continue;
      for (const cell of pair.cells.filter((c) => c.verdict === "UNKNOWN")) {
        const leaf = leaves.get(cell.criterionId);
        if (!leaf) continue;
        const key = leaf.analyte ? `${leaf.predicate}:${leaf.analyte}` : leaf.predicate;
        const note = explainCeiling("claims", leaf.predicate);
        const existing = unknownBuckets.get(key);
        if (existing) {
          if (!existing.criterionIds.includes(leaf.id)) existing.criterionIds.push(leaf.id);
          if (!existing.patientIds.includes(patient.id)) existing.patientIds.push(patient.id);
          continue;
        }
        const capped = note !== undefined;
        unknownBuckets.set(key, {
          need: capped
            ? (CHART_NEED[leaf.predicate] ?? note.resolution)
            : `a ${leaf.analyte ?? leaf.predicate} claim line`,
          predicate: leaf.predicate,
          analyte: leaf.analyte,
          why: capped ? note.because : "this extract has no claim that answers it",
          criterionIds: [leaf.id],
          patientIds: [patient.id],
        });
      }
    }
  }

  settled.sort((a, b) => a.kind.localeCompare(b.kind) || a.patientId.localeCompare(b.patientId));
  const needs = [...unknownBuckets.values()].sort(
    (a, b) => b.patientIds.length - a.patientIds.length || a.predicate.localeCompare(b.predicate),
  );

  return {
    headline: "Claims can rule patients out. Only a chart can rule them in.",
    beneficiaries: patients.length,
    settled,
    needs,
    coverage,
    source,
  };
}
