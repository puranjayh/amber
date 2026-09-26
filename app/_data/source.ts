import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CubeFixture, PatientsFixture, TrialsFixture, type PairResult, type Patient, type Trial } from "@/src/contracts";
import {
  Assignments,
  CriteriaLandscape,
  ElasticitySweep,
  EquitySet,
  EvalReport,
  Meta,
  PayerView,
  WorklistRow,
} from "./schema";
import type { z } from "zod";

/**
 * Read models are generated JSON on disk. This module reads them with fs so
 * the Next bundler never ingests cube.json / trials.json as static imports.
 * Run `npx vite-node --config vitest.config.ts app/_data/generate.ts` to rebuild.
 */
const DIR = join(process.cwd(), "app/_data");

function readGenerated(name: string): unknown {
  const path = join(DIR, name);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8"));
}

const EMPTY_META: Meta = {
  asOf: "—",
  sources: [],
  patients: 0,
  trials: 0,
  cells: 0,
  pairsEvaluated: 0,
  eligibleNow: 0,
  oneTier0Away: 0,
  realProtocols: 0,
  engineTree: "—",
};

const EMPTY_PAYER: PayerView = {
  headline: "",
  beneficiaries: 0,
  settled: [],
  needs: [],
  coverage: null,
  source: "stub",
};

const EMPTY_EVAL: EvalReport = {
  labelSource: "missing",
  evaluatedCells: 0,
  issues: [],
  confusionMatrix: {},
  precision: null,
  recall: null,
  unknownAgreement: null,
  unknownRecall: null,
  byVerdict: {},
  disagreements: [],
};

export type SourceStatus = { file: string; ok: boolean; rows: number; error?: string };

function take<T>(file: string, schema: z.ZodType<T>, json: unknown, empty: T, rows: (data: T) => number): T {
  const result = schema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    sourceStatus.push({
      file,
      ok: false,
      rows: 0,
      error: issue ? `${issue.message}${issue.path.length ? ` at ${issue.path.join(".")}` : ""}` : "invalid",
    });
    return empty;
  }
  const n = rows(result.data);
  sourceStatus.push({ file, ok: n > 0, rows: n, error: n === 0 ? "empty" : undefined });
  return result.data;
}

function lazy<T>(load: () => T): () => T {
  let value: T | undefined;
  let ready = false;
  return () => {
    if (!ready) {
      value = load();
      ready = true;
    }
    return value as T;
  };
}

export const sourceStatus: SourceStatus[] = [];

export const meta = take("app/_data/meta.json", Meta, readGenerated("meta.json"), EMPTY_META, (d) => d.patients);
const worklist = take("app/_data/worklist.json", WorklistRow.array(), readGenerated("worklist.json"), [], (d) => d.length);
const assignments = take("app/_data/assignments.json", Assignments, readGenerated("assignments.json"), [], (d) => d.length);
const landscape = take(
  "app/_data/landscape.json",
  CriteriaLandscape,
  readGenerated("landscape.json"),
  { generatedFromTrials: 0, analytes: [] },
  (d) => d.analytes.length,
);
const payer = take("app/_data/payer.json", PayerView, readGenerated("payer.json"), EMPTY_PAYER, (d) => d.settled.length + d.needs.length);
const evalReport = take("app/_data/eval.json", EvalReport, readGenerated("eval.json"), EMPTY_EVAL, (d) => d.evaluatedCells);

const loadTrials = lazy(() => take("app/_data/trials.json", TrialsFixture, readGenerated("trials.json"), [], (d) => d.length));
const loadPatients = lazy(() =>
  take("app/_data/patients.json", PatientsFixture, readGenerated("patients.json"), [], (d) => d.length),
);
const loadCube = lazy(() => take("app/_data/cube.json", CubeFixture, readGenerated("cube.json"), [], (d) => d.length));
const loadSweeps = lazy(() =>
  take("app/_data/elasticity.json", ElasticitySweep.array(), readGenerated("elasticity.json"), [], (d) => d.length),
);
const loadEquity = lazy(() => take("app/_data/equity.json", EquitySet.array(), readGenerated("equity.json"), [], (d) => d.length));

export const asOf = meta.asOf;
export const realProtocols = meta.realProtocols ?? 0;

/** The pair we present on stage (fixtures/ORACLE.md: exactly two unknowns). */
export const DEMO = { patientId: "PT-4401", nctId: "NCT07001001" } as const;

export const getTrials = (): Trial[] => loadTrials();
export const getPatients = (): Patient[] => loadPatients();
export const getCube = (): PairResult[] => loadCube();
export const getWorklist = () => worklist;
export const getSweeps = () => loadSweeps();
export const getAssignments = () => assignments;
export const getLandscape = () => landscape;
export const getPayer = () => payer;
export const getEval = () => evalReport;

/** Hand-built fixture ids — the pair picker and the demo stay on these. */
export const fixturePatientIds = () => getPatients().filter((p) => /^PT-\d+$/.test(p.id)).map((p) => p.id);
export const fixtureTrialIds = () => getTrials().filter((t) => /^NCT07001\d+$/.test(t.nctId)).map((t) => t.nctId);

export const getTrial = (nctId: string) => getTrials().find((t) => t.nctId === nctId);
export const getPatient = (id: string) => getPatients().find((p) => p.id === id);
export const getPair = (patientId: string, nctId: string) =>
  getCube().find((p) => p.patientId === patientId && p.nctId === nctId);
export const getSweep = (nctId: string, criterionId: string) =>
  getSweeps().find((s) => s.nctId === nctId && s.criterionId === criterionId);
export const getEquity = (nctId: string) => loadEquity().find((e) => e.nctId === nctId);

/** Patients per subgroup — the denominator every equity and elasticity number sits on. */
export function subgroupSizes(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of getPatients()) out[p.race] = (out[p.race] ?? 0) + 1;
  return out;
}
