import { existsSync, readFileSync } from "node:fs";
import { Patient, PatientsFixture, Trial, TrialsFixture, type Patient as PatientT, type Trial as TrialT } from "@/src/contracts";
import { CriteriaLandscape } from "./schema";

/** The evaluation date the fixtures are written against (fixtures/ORACLE.md). */
export const AS_OF = "2026-09-25";

const FIXTURE_TRIALS = "fixtures/trials.sample.json";
const FIXTURE_PATIENTS = "fixtures/patients.sample.json";
const POPULATION = "data/patients.json";
const SYNTHEA = "data/synthea/patients.json";
const COMPILED = "data/compiled/trials.json";
const LANDSCAPE = "data/compiled/landscape.json";

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
 * Engine inputs: the hand-built fixtures, then the data-lane population and the
 * compiler's 300-trial corpus when those files exist. Fixtures win on id clash
 * so the demo pair cannot be overwritten.
 */
export function loadInputs(root: string): { trials: TrialT[]; patients: PatientT[]; sources: string[] } {
  const path = (rel: string) => root + rel;
  const sources = [FIXTURE_TRIALS, FIXTURE_PATIENTS];

  const trials = [acceptTrials(readJson(path(FIXTURE_TRIALS)))];
  const patients = [acceptPatients(readJson(path(FIXTURE_PATIENTS)), FIXTURE_PATIENTS)];

  if (existsSync(path(COMPILED))) {
    const compiled = acceptTrials(readJson(path(COMPILED)));
    if (compiled.length > 0) {
      trials.push(compiled);
      sources.push(COMPILED);
    } else {
      console.warn(`${COMPILED}: 0 trials entered the pool (needsHumanReview or empty criteria)`);
    }
  }

  for (const rel of [POPULATION, SYNTHEA]) {
    if (!existsSync(path(rel))) continue;
    patients.push(acceptPatients(readJson(path(rel)), rel));
    sources.push(rel);
  }

  return {
    trials: mergeBy((t) => t.nctId, ...trials),
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
