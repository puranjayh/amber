import type { CubeCell, Fact, Patient, Predicate, Trial } from "@/src/contracts";
import { evaluate, explainCeiling, indexLeaves, isEliminating } from "@/src/engine";
import type { ChartNeed, ClaimsCoverage, PayerView, SettledExclusion } from "./schema";

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

/** ICD-9 162.x — malignant neoplasm of trachea/bronchus/lung. The DE-SynPUF cohort definition. */
const LUNG_ICD9 = /^162[0-9]?$/;
/** Interstitial / fibrotic lung disease codes that answer the fixture ILD exclusion. */
const ILD_ICD9 = /^(515|516[0-9]|5183|495[0-9])$/;
const EGFR_TKI = /^(osimertinib|erlotinib|gefitinib|afatinib|dacomitinib)$/i;

export function icd9Code(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^ICD-9\s+([0-9V][0-9]{2,4})$/i.exec(value.trim());
  return match ? match[1].toUpperCase() : null;
}

/**
 * Claims facts arrive as coded claim lines (ICD-9 1623, pemetrexed / PLATINUM).
 * Fixture leaves ask for the clinical shape the stub used (NSCLC, ILD: true,
 * EGFR_TKI / osimertinib: true). Rewrite the comparable fields; keep the quote.
 */
export function normalizeClaimsFact(fact: Fact): Fact {
  if (fact.predicate === "diagnosis") {
    const code = icd9Code(fact.value);
    if (code && LUNG_ICD9.test(code)) {
      return { ...fact, value: "non-small cell lung cancer", sourceQuote: `ICD-9 ${code}` };
    }
  }
  if (fact.predicate === "comorbidity") {
    const code = icd9Code(fact.value);
    if (code && ILD_ICD9.test(code)) {
      return { ...fact, analyte: "ILD", value: true, sourceQuote: `ICD-9 ${code}` };
    }
  }
  if (fact.predicate === "prior_therapy") {
    const name = typeof fact.value === "string" ? fact.value : "";
    const className = fact.drugClass ?? "";
    if (EGFR_TKI.test(name) || /^EGFR_TKI$/i.test(className)) {
      return {
        ...fact,
        analyte: EGFR_TKI.test(name) ? name.toLowerCase() : fact.analyte,
        drugClass: "EGFR_TKI",
        value: true,
      };
    }
  }
  return fact;
}

export function normalizeClaimsPatient(patient: Patient): Patient {
  return { ...patient, facts: patient.facts.map(normalizeClaimsFact) };
}

function eliminatingCells(cells: CubeCell[], trial: Trial): CubeCell[] {
  const leaves = indexLeaves(trial);
  return cells.filter((c) => {
    const leaf = leaves.get(c.criterionId);
    return leaf ? isEliminating(c.verdict, leaf.type) : false;
  });
}

export type PayerFilterCounts = {
  patients: number;
  pairs: number;
  eliminated: number;
  diagnosisFail: number;
  eliminatingCells: number;
  settlePredicate: number;
  settleReason: number;
  settled: number;
  livePairs: number;
  unknownCells: number;
  needs: number;
};

export type PayerFilterTrace = {
  counts: PayerFilterCounts;
  samples: Array<{
    patientId: string;
    nctId: string;
    eliminated: boolean;
    cells: Array<{ id: string; predicate: string; verdict: string; reason: string }>;
  }>;
};

export function tracePayerBuild(
  patients: Patient[],
  trials: Trial[],
  asOf: string,
  opts: { normalize?: boolean } = {},
): PayerFilterTrace {
  const cohort = opts.normalize === false ? patients : patients.map(normalizeClaimsPatient);
  const counts: PayerFilterCounts = {
    patients: cohort.length,
    pairs: 0,
    eliminated: 0,
    diagnosisFail: 0,
    eliminatingCells: 0,
    settlePredicate: 0,
    settleReason: 0,
    settled: 0,
    livePairs: 0,
    unknownCells: 0,
    needs: 0,
  };
  const samples: PayerFilterTrace["samples"] = [];
  const unknownBuckets = new Set<string>();

  for (const patient of cohort) {
    for (const trial of trials) {
      counts.pairs += 1;
      const pair = evaluate(patient, trial, asOf);
      const leaves = indexLeaves(trial);
      if (samples.length < 3) {
        samples.push({
          patientId: patient.id,
          nctId: trial.nctId,
          eliminated: pair.eliminated,
          cells: pair.cells.map((c) => ({
            id: c.criterionId,
            predicate: leaves.get(c.criterionId)?.predicate ?? "?",
            verdict: c.verdict,
            reason: c.reason,
          })),
        });
      }
      if (pair.cells.some((c) => c.criterionId.startsWith("INC-2") && c.verdict === "FAIL")) {
        counts.diagnosisFail += 1;
      }
      if (pair.eliminated) {
        counts.eliminated += 1;
        for (const cell of eliminatingCells(pair.cells, trial)) {
          counts.eliminatingCells += 1;
          const leaf = leaves.get(cell.criterionId);
          if (!leaf || !SETTLE.has(leaf.predicate)) continue;
          counts.settlePredicate += 1;
          if (cell.reason !== "satisfied" && cell.reason !== "contradicted") continue;
          counts.settleReason += 1;
          counts.settled += 1;
        }
        continue;
      }
      counts.livePairs += 1;
      for (const cell of pair.cells.filter((c) => c.verdict === "UNKNOWN")) {
        counts.unknownCells += 1;
        const leaf = leaves.get(cell.criterionId);
        if (!leaf) continue;
        unknownBuckets.add(leaf.analyte ? `${leaf.predicate}:${leaf.analyte}` : leaf.predicate);
      }
    }
  }
  counts.needs = unknownBuckets.size;
  return { counts, samples };
}

/**
 * Claims-only evaluation against the fixture trials. Left column is every
 * elimination a claim is allowed to write (drug fill / comorbidity). Right
 * column is every remaining UNKNOWN, grouped by what a chart would have to
 * produce. ICD-coded claim lines are rewritten to the leaf shapes before
 * evaluate() so "ICD-9 1623" can answer a NSCLC diagnosis leaf.
 */
export function buildPayerView(
  patients: Patient[],
  trials: Trial[],
  asOf: string,
  coverage: ClaimsCoverage | null,
  source: PayerView["source"],
): PayerView {
  const cohort = source === "data/claims/patients.json" ? patients.map(normalizeClaimsPatient) : patients;
  const settled: SettledExclusion[] = [];
  const unknownBuckets = new Map<string, ChartNeed>();

  for (const patient of cohort) {
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
        const label = leaf.analyte ?? leaf.predicate;
        const article = /^[aeiou]/i.test(label) ? "an" : "a";
        unknownBuckets.set(key, {
          need: capped
            ? (CHART_NEED[leaf.predicate] ?? note.resolution)
            : `${article} ${label} claim line`,
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
