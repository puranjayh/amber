/**
 * Synthetic data and cube runner for the scale benchmark.
 *
 * Everything here is pure and seeded, so a benchmark number is reproducible:
 * the same seed gives the same cohort on every machine, which is what makes
 * "21 million criterion evaluations in N seconds" a claim and not an anecdote.
 * `Math.random` is not used anywhere.
 *
 * These patients are synthetic in the trivial sense — drawn from a PRNG, with no
 * clinical structure and no relationship to any real person. They exist to
 * measure throughput. They are NOT the demo cohort and must never be shown as
 * one: contract §9, and the demo patients are hand-built and we say so on stage.
 *
 * The timing itself lives in bench.test.ts, because a clock has no business in
 * the engine (rule 1).
 */
import type {
  CriterionLeaf,
  CriterionNode,
  Fact,
  Patient,
  Predicate,
  Tier,
  Trial,
} from "@/src/contracts";
import { evaluate, indexLeaves, type EvaluateOptions } from "./evaluate";

/** mulberry32 — small, fast, good enough, and identical everywhere. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const int = (r: () => number, lo: number, hi: number): number =>
  lo + Math.floor(r() * (hi - lo + 1));

const LABS: { analyte: string; unit: string; lo: number; hi: number; floor: number }[] = [
  { analyte: "ANC", unit: "/uL", lo: 500, hi: 6000, floor: 1500 },
  { analyte: "hemoglobin", unit: "g/dL", lo: 7, hi: 16, floor: 9 },
  { analyte: "platelets", unit: "10^9/L", lo: 40, hi: 400, floor: 100 },
  { analyte: "creatinine", unit: "mg/dL", lo: 0.5, hi: 3, floor: 1.5 },
  { analyte: "total bilirubin", unit: "mg/dL", lo: 0.3, hi: 4, floor: 1.5 },
  { analyte: "AST", unit: "U/L", lo: 10, hi: 200, floor: 100 },
];

const GENES = ["EGFR", "ALK", "ROS1", "BRAF", "KRAS", "MET", "RET", "ERBB2"];
const VARIANTS = ["L858R", "ex19del", "rearranged", "amplified", "G12C", "wild type"];
const DRUGS = ["osimertinib", "erlotinib", "gefitinib", "carboplatin", "pemetrexed", "pembrolizumab"];
const COMORBIDITIES = ["interstitial lung disease", "active hepatitis B", "COPD", "hypertension"];
const STAGES = ["IIB", "IIIA", "IIIB", "IVA", "IVB"];
const RACES = [
  "White",
  "Black or African American",
  "Asian",
  "American Indian or Alaska Native",
  "Native Hawaiian or Other Pacific Islander",
];

const day = (r: () => number, oldestDays: number): string => {
  // Spread observations back from 2026-09-24 so some fall outside 28-day windows.
  const ms = Date.UTC(2026, 8, 24) - int(r, 0, oldestDays) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
};

/**
 * One realistic eligibility block: about twenty leaves, a nested biomarker OR,
 * recency windows on the labs, and a tier-4 washout. Shaped to match the
 * criterion counts in a real oncology protocol rather than to run fast.
 */
export function syntheticTrial(i: number, seed = 1): Trial {
  const r = rng(seed * 7919 + i);
  const nctId = `NCT${String(10_000_000 + i).slice(0, 8)}`;
  const criteria: CriterionNode[] = [];

  const leafOf = (
    id: string,
    predicate: Predicate,
    over: Partial<CriterionLeaf> = {},
  ): CriterionLeaf => ({
    kind: "leaf",
    id,
    type: "inclusion",
    predicate,
    operator: ">=",
    value: 0,
    tier: 1 as Tier,
    sweepable: false,
    sourceSpan: `${id}: protocol text for ${predicate}`,
    ...over,
  });

  criteria.push(leafOf("INC-1", "age", { operator: ">=", value: 18, unit: "years", tier: 0 }));
  criteria.push(
    leafOf("INC-2", "diagnosis", { operator: "==", value: "non-small cell lung cancer", tier: 0 }),
  );
  criteria.push(
    leafOf("INC-3", "staging", { operator: "in", value: STAGES.slice(int(r, 1, 3)), tier: 2 }),
  );
  criteria.push(
    leafOf("INC-4", "performance_status", {
      analyte: "ECOG",
      operator: "<=",
      value: int(r, 1, 2),
      maxAgeDays: 28,
      tier: 1,
    }),
  );

  // The biomarker arm, as a nested OR so the walk is not a flat list.
  const gene = pick(r, GENES);
  criteria.push({
    kind: "group",
    op: "OR",
    sourceSpan: `${gene} alteration by validated assay`,
    children: [0, 1].map((k) =>
      leafOf(`INC-5${"ab"[k]}`, "biomarker", {
        analyte: gene,
        operator: "==",
        value: pick(r, VARIANTS),
        tier: 0,
        pFavorable: Number(r().toFixed(3)),
        sweepable: false,
      }),
    ),
  });

  LABS.forEach((lab, k) => {
    criteria.push(
      leafOf(`INC-6${k}`, "lab_value", {
        analyte: lab.analyte,
        operator: k % 3 === 2 ? "<=" : ">=",
        value: lab.floor,
        unit: lab.unit,
        maxAgeDays: pick(r, [14, 28, 42]),
        tier: 1,
        sweepable: true,
        sweepRange: [lab.lo, lab.hi],
        sweepStep: (lab.hi - lab.lo) / 8,
      }),
    );
  });

  criteria.push(
    leafOf("EXC-1", "prior_therapy", {
      type: "exclusion",
      operator: "in",
      value: DRUGS.slice(0, int(r, 1, 3)),
      drugClass: "EGFR_TKI",
      members: DRUGS.slice(0, 3),
      tier: 0,
    }),
  );
  criteria.push(
    leafOf("EXC-2", "washout", {
      type: "exclusion",
      operator: "<",
      value: pick(r, [14, 21, 28]),
      unit: "days",
      tier: 4,
    }),
  );
  [0, 1].forEach((k) =>
    criteria.push(
      leafOf(`EXC-3${k}`, "comorbidity", {
        type: "exclusion",
        operator: "==",
        value: pick(r, COMORBIDITIES),
        tier: 2,
      }),
    ),
  );
  criteria.push(
    leafOf("EXC-4", "contraindication", {
      type: "exclusion",
      operator: "==",
      value: "strong CYP3A4 inducer",
      tier: 1,
    }),
  );

  return {
    nctId,
    title: `Synthetic protocol ${i}`,
    phase: pick(r, ["PHASE1", "PHASE2", "PHASE3"]),
    condition: "non-small cell lung cancer",
    slots: int(r, 0, 6),
    siteDistanceMinutes: int(r, 5, 240),
    criteria,
    compilerConfidence: Number(r().toFixed(2)),
    needsHumanReview: false,
  };
}

/** `n` trials. Deterministic in `seed`. */
export function syntheticTrials(n: number, seed = 1): Trial[] {
  return Array.from({ length: n }, (_, i) => syntheticTrial(i, seed));
}

/**
 * One patient with a partly complete record: most predicates covered, some
 * omitted so there are genuine unknowns, dates spread so some go stale, and a
 * minority of facts carried by claims so the provenance path is exercised too.
 */
export function syntheticPatient(i: number, seed = 1): Patient {
  const r = rng(seed * 104_729 + i);
  const facts: Fact[] = [];
  const add = (f: Omit<Fact, "sourceQuote" | "sourceDoc" | "provenance"> & Partial<Fact>): void => {
    facts.push({
      sourceQuote: `synthetic observation for ${f.predicate}`,
      sourceDoc: `synthetic ${f.observedAt}`,
      provenance: r() < 0.15 ? "claims" : "chart",
      ...f,
    } as Fact);
  };

  add({ predicate: "diagnosis", value: "non-small cell lung cancer", observedAt: day(r, 400) });
  add({ predicate: "staging", value: pick(r, STAGES), observedAt: day(r, 200) });
  if (r() < 0.85) {
    add({
      predicate: "performance_status",
      analyte: "ECOG",
      value: int(r, 0, 3),
      unit: "score",
      observedAt: day(r, 90),
    });
  }
  // Roughly a third of patients have never been sequenced — a real unknown.
  if (r() < 0.65) {
    add({
      predicate: "biomarker",
      analyte: pick(r, GENES),
      value: pick(r, VARIANTS),
      observedAt: day(r, 500),
    });
  }
  for (const lab of LABS) {
    if (r() < 0.8) {
      add({
        predicate: "lab_value",
        analyte: lab.analyte,
        value: Number((lab.lo + r() * (lab.hi - lab.lo)).toFixed(2)),
        unit: lab.unit,
        observedAt: day(r, 120),
      });
    }
  }
  if (r() < 0.7) {
    add({ predicate: "prior_therapy", value: pick(r, DRUGS), observedAt: day(r, 700) });
  }
  if (r() < 0.6) {
    add({ predicate: "washout", value: day(r, 120), observedAt: day(r, 120) });
  }
  if (r() < 0.5) {
    add({ predicate: "comorbidity", value: pick(r, COMORBIDITIES), observedAt: day(r, 300) });
  }

  return {
    id: `SYN-${String(i).padStart(6, "0")}`,
    age: int(r, 28, 89),
    sex: pick(r, ["F", "M", "other", "unknown"]),
    race: pick(r, RACES),
    travelMinutes: int(r, 5, 300),
    facts,
  };
}

/** `n` patients. Deterministic in `seed`. */
export function syntheticCohort(n: number, seed = 1): Patient[] {
  return Array.from({ length: n }, (_, i) => syntheticPatient(i, seed));
}

export interface CubeRun {
  patients: number;
  trials: number;
  pairs: number;
  /** Leaf evaluations actually performed — the number we quote. */
  cellsEvaluated: number;
  /** Leaves across all trials, i.e. cells a full (non-short-circuit) pass emits. */
  cellsPossible: number;
  eliminated: number;
  unknowns: number;
}

/**
 * Evaluate the whole cube and count what it cost. No timing here on purpose —
 * the caller holds the clock.
 */
export function runCube(
  patients: readonly Patient[],
  trials: readonly Trial[],
  asOf: string,
  options: EvaluateOptions = {},
): CubeRun {
  const leafCounts = trials.map((t) => indexLeaves(t).size);
  let cellsEvaluated = 0;
  let eliminated = 0;
  let unknowns = 0;

  for (const patient of patients) {
    for (const trial of trials) {
      const r = evaluate(patient, trial, asOf, options);
      cellsEvaluated += r.cells.length;
      unknowns += r.unknownCount;
      if (r.eliminated) eliminated++;
    }
  }

  return {
    patients: patients.length,
    trials: trials.length,
    pairs: patients.length * trials.length,
    cellsEvaluated,
    cellsPossible: patients.length * leafCounts.reduce((a, b) => a + b, 0),
    eliminated,
    unknowns,
  };
}

/**
 * Grow a cohort to `times` its size by deep-cloning it with fresh ids.
 *
 * For measuring throughput only. It adds no clinical diversity and the report
 * says so — it exists because the real Synthea cohort is 200 patients and a
 * stage claim wants a number with more zeros in it.
 *
 * The deep clone is not incidental, it is the whole point. `evaluate` memoises a
 * patient's fact index on the patient object, so handing the same object back N
 * times would measure the cache instead of the engine and report a throughput we
 * could not reproduce on real data. Every clone is a distinct object that pays
 * for its own index exactly as a real patient would.
 */
export function replicateCohort(patients: readonly Patient[], times: number): Patient[] {
  if (!Number.isInteger(times) || times < 1) {
    throw new RangeError(`replicateCohort: times must be a positive integer, got ${times}`);
  }
  const out: Patient[] = [];
  for (let copy = 0; copy < times; copy++) {
    for (const patient of patients) {
      out.push({
        ...patient,
        id: copy === 0 ? patient.id : `${patient.id}#${copy}`,
        // Fresh fact objects too: a shared array would still be a shared index key.
        facts: patient.facts.map((f) => ({ ...f })),
      });
    }
  }
  return out;
}

export interface BenchmarkRow extends CubeRun {
  mode: "full" | "short-circuit";
  seconds: number;
  cellsPerSecond: number;
  pairsPerSecond: number;
}

/**
 * Time one cube run. The clock lives here rather than in any engine module
 * (contract rule 1) — `bench.ts` is a harness, and nothing in `index.ts` exports
 * it.
 *
 * A warm-up pass runs first and is not timed, so JIT compilation is not charged
 * to the measurement. That is the difference between a number that reproduces and
 * one that looks good once.
 */
export function timeCube(
  patients: readonly Patient[],
  trials: readonly Trial[],
  asOf: string,
  mode: "full" | "short-circuit",
): BenchmarkRow {
  const options: EvaluateOptions = mode === "short-circuit" ? { shortCircuit: true } : {};

  runCube(
    patients.slice(0, Math.min(10, patients.length)),
    trials.slice(0, Math.min(10, trials.length)),
    asOf,
    options,
  );

  const started = performance.now();
  const run = runCube(patients, trials, asOf, options);
  const seconds = (performance.now() - started) / 1000;

  return {
    ...run,
    mode,
    // Six decimals, not three: a small run finishes inside a millisecond, and a
    // row reporting "0s" beside a finite rate is both confusing and un-derivable.
    seconds: Number(seconds.toFixed(6)),
    cellsPerSecond: Math.round(run.cellsEvaluated / seconds),
    pairsPerSecond: Math.round(run.pairs / seconds),
  };
}
