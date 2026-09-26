import { existsSync, readFileSync } from "node:fs";
import { Patient, PatientsFixture, Trial, TrialsFixture, type Patient as PatientT, type Trial as TrialT } from "@/src/contracts";
import { ClaimsCoverage, CriteriaLandscape } from "./schema";
import { readClaimsCoverage } from "@/components/payer/coverage";

/** The evaluation date the fixtures are written against (fixtures/ORACLE.md). */
export const AS_OF = "2026-09-25";

const FIXTURE_TRIALS = "fixtures/trials.sample.json";
const FIXTURE_PATIENTS = "fixtures/patients.sample.json";
const POPULATION = "data/patients.json";
const SYNTHEA = "data/synthea/patients.json";
const COMPILED = "data/compiled/trials.json";
const LANDSCAPE = "data/compiled/landscape.json";
const CLAIMS = "data/claims/patients.json";
const COVERAGE = "data/compiled/coverage.json";

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function mergeBy<T>(key: (item: T) => string, ...lists: T[][]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const list of lists) {
    for (const item of list) {
      const k = key(item);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}

/** Compiler emits `{ trial, sourceText, failure }`; fixtures are a bare Trial[]. */
export function unwrapTrials(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) throw new Error("trials file must be an array");
  return raw.flatMap((row) => {
    if (row && typeof row === "object" && "nctId" in row && "criteria" in row) return [row];
    if (row && typeof row === "object" && "trial" in row) {
      const inner = (row as { trial: unknown }).trial;
      if (inner && typeof inner === "object") return [inner];
    }
    return [];
  });
}

/** Reject flagged or empty trees — CONTRACT §4: they leave the demo pool. */
export function acceptTrials(raw: unknown): TrialT[] {
  const rows = unwrapTrials(raw);
  const whole = TrialsFixture.safeParse(rows);
  const parsed = whole.success
    ? whole.data
    : rows.flatMap((row) => {
        const one = Trial.safeParse(row);
        return one.success ? [one.data] : [];
      });
  return parsed.filter((t) => !t.needsHumanReview && t.criteria.length > 0);
}

/** Hero presentation trial — not in the compiled corpus; pin it so the demo path is stable. */
export const PRESENTATION_TRIAL = "NCT07001001";
export const PRESENTATION_PAIR = { patientId: "PT-4401", nctId: PRESENTATION_TRIAL } as const;
/** Citation-only trees the compiler now exposes. Any other non-zero count is a different cube. */
export const DEMO_POOL = 133;

const CITATION_FLAG = /\bsourceSpan near-verbatim\b|\bfull source block retained\b/;

function unwrapOne(row: unknown): unknown | null {
  if (row && typeof row === "object" && "nctId" in row && "criteria" in row) return row;
  if (row && typeof row === "object" && "trial" in row) {
    const inner = (row as { trial: unknown }).trial;
    if (inner && typeof inner === "object") return inner;
  }
  return null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function envelopeReasons(row: unknown): string[] {
  if (!row || typeof row !== "object") return [];
  const rec = row as { reviewReasons?: unknown; citationFlags?: unknown };
  return [...strings(rec.reviewReasons), ...strings(rec.citationFlags)];
}

function hasCompileFailure(row: unknown): boolean {
  return Boolean(row && typeof row === "object" && "failure" in row && (row as { failure: unknown }).failure);
}

/** Citation granularity does not gate. Semantic reasons and compile failures do. */
export function isDemoReady(trial: TrialT, row: unknown): boolean {
  if (trial.criteria.length === 0) return false;
  if (hasCompileFailure(row)) return false;
  if (!trial.needsHumanReview) return true;
  const reasons = envelopeReasons(row);
  return reasons.length > 0 && reasons.every((reason) => CITATION_FLAG.test(reason));
}

/** Compiled envelopes: citation flags stay in the pool; semantic / empty trees leave. */
export function acceptCompiledPool(raw: unknown): TrialT[] {
  if (!Array.isArray(raw)) throw new Error("compiled trials must be an array");
  const out: TrialT[] = [];
  for (const row of raw) {
    const inner = unwrapOne(row);
    if (!inner) continue;
    const parsed = Trial.safeParse(inner);
    if (parsed.success && isDemoReady(parsed.data, row)) out.push(parsed.data);
  }
  return out;
}

export function pinPresentationTrial(compiled: TrialT[], fixtures: TrialT[], nctId = PRESENTATION_TRIAL): TrialT[] {
  if (compiled.some((trial) => trial.nctId === nctId)) return compiled;
  const pin = fixtures.find((trial) => trial.nctId === nctId);
  if (!pin) throw new Error(`Presentation trial ${nctId} is missing from fixtures`);
  return [pin, ...compiled];
}

export function realProtocolCount(trials: { nctId: string }[]): number {
  return trials.filter((trial) => !/^NCT07001\d+$/.test(trial.nctId)).length;
}

/** The hand-written trio — payer stub and oracle stay on these, not the 133. */
export function loadFixtureTrials(root: string): TrialT[] {
  return acceptTrials(readJson(root + FIXTURE_TRIALS));
}

export function acceptPatients(raw: unknown, source: string): PatientT[] {
  if (!Array.isArray(raw)) throw new Error(`${source} must be an array`);
  const whole = PatientsFixture.safeParse(raw);
  if (whole.success) return whole.data;
  const out: PatientT[] = [];
  for (const row of raw) {
    const parsed = Patient.safeParse(row);
    if (parsed.success) out.push(parsed.data);
  }
  if (out.length === 0) throw new Error(`${source} contained no valid Patient records`);
  console.warn(`${source}: kept ${out.length}/${raw.length} after per-record parse`);
  return out;
}

/**
 * Engine inputs: fixture patients always. Trials are the 133 demo-ready compiled
 * protocols when that file is present, plus the pinned presentation trial.
 * Citation flags do not gate. Fixtures are the fallback, not the cube.
 */
export function loadInputs(root: string): { trials: TrialT[]; patients: PatientT[]; sources: string[] } {
  const path = (rel: string) => root + rel;
  const sources = [FIXTURE_PATIENTS];
  const fixtures = acceptTrials(readJson(path(FIXTURE_TRIALS)));
  const patients = [acceptPatients(readJson(path(FIXTURE_PATIENTS)), FIXTURE_PATIENTS)];

  let trials: TrialT[];
  if (existsSync(path(COMPILED))) {
    const compiled = acceptCompiledPool(readJson(path(COMPILED)));
    if (compiled.length === DEMO_POOL) {
      trials = pinPresentationTrial(compiled, fixtures);
      sources.unshift(COMPILED);
      sources.push(FIXTURE_TRIALS);
    } else if (compiled.length === 0) {
      console.warn(`${COMPILED}: 0 demo-ready trials; falling back to fixtures`);
      trials = fixtures;
      sources.unshift(FIXTURE_TRIALS);
    } else {
      throw new Error(
        `${COMPILED}: demo pool is ${compiled.length}; expected ${DEMO_POOL}. Citation flags must not gate, and we will not silently show a different cube.`,
      );
    }
  } else {
    trials = fixtures;
    sources.unshift(FIXTURE_TRIALS);
  }

  for (const rel of [POPULATION, SYNTHEA]) {
    if (!existsSync(path(rel))) continue;
    patients.push(acceptPatients(readJson(path(rel)), rel));
    sources.push(rel);
  }

  return {
    trials,
    patients: mergeBy((p) => p.id, ...patients),
    sources,
  };
}

/** Compiler landscape when it has analytes; otherwise null so the app can derive from trials. */
export function loadLandscape(root: string): { landscape: CriteriaLandscape; source: string } | null {
  const path = root + LANDSCAPE;
  if (!existsSync(path)) return null;
  const parsed = CriteriaLandscape.safeParse(readJson(path));
  if (!parsed.success || parsed.data.analytes.length === 0) return null;
  return { landscape: parsed.data, source: LANDSCAPE };
}

/** CMS DE-SynPUF extract when the compiler has written it. */
export function loadClaims(root: string): { patients: PatientT[]; source: "data/claims/patients.json" } | null {
  const path = root + CLAIMS;
  if (!existsSync(path)) return null;
  const parsed = PatientsFixture.safeParse(readJson(path));
  if (!parsed.success || parsed.data.length === 0) return null;
  return { patients: parsed.data, source: CLAIMS };
}

/**
 * Published claims figure only. Compile-stats → wait. A leaf count that is not
 * 5,103 throws. Never derived from trees.
 */
export function loadCoverage(root: string): ClaimsCoverage | null {
  const path = root + COVERAGE;
  if (!existsSync(path)) return null;
  return readClaimsCoverage(readJson(path), COVERAGE);
}
