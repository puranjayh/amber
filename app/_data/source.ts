import { CubeFixture, PatientsFixture, TrialsFixture, type PairResult, type Patient, type Trial } from "@/src/contracts";
import assignmentsJson from "./assignments.json";
import cubeJson from "./cube.json";
import elasticityJson from "./elasticity.json";
import equityJson from "./equity.json";
import metaJson from "./meta.json";
import patientsJson from "./patients.json";
import trialsJson from "./trials.json";
import evalJson from "./eval.json";
import landscapeJson from "./landscape.json";
import payerJson from "./payer.json";
import worklistJson from "./worklist.json";
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

const EMPTY_META: Meta = {
  asOf: "—",
  sources: [],
  patients: 0,
  trials: 0,
  cells: 0,
  pairsEvaluated: 0,
  eligibleNow: 0,
  oneTier0Away: 0,
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

export const sourceStatus: SourceStatus[] = [];

const trials = take("app/_data/trials.json", TrialsFixture, trialsJson, [], (d) => d.length);
const patients = take("app/_data/patients.json", PatientsFixture, patientsJson, [], (d) => d.length);
const cube = take("app/_data/cube.json", CubeFixture, cubeJson, [], (d) => d.length);
const worklist = take("app/_data/worklist.json", WorklistRow.array(), worklistJson, [], (d) => d.length);
const sweeps = take("app/_data/elasticity.json", ElasticitySweep.array(), elasticityJson, [], (d) => d.length);
const equity = take("app/_data/equity.json", EquitySet.array(), equityJson, [], (d) => d.length);
const assignments = take("app/_data/assignments.json", Assignments, assignmentsJson, [], (d) => d.length);
const landscape = take(
  "app/_data/landscape.json",
  CriteriaLandscape,
  landscapeJson,
  { generatedFromTrials: 0, analytes: [] },
  (d) => d.analytes.length,
);
const payer = take("app/_data/payer.json", PayerView, payerJson, EMPTY_PAYER, (d) => d.settled.length + d.needs.length);
const evalReport = take("app/_data/eval.json", EvalReport, evalJson, EMPTY_EVAL, (d) => d.evaluatedCells);
export const meta = take("app/_data/meta.json", Meta, metaJson, EMPTY_META, (d) => d.patients);

export const asOf = meta.asOf;

/** The pair we present on stage (fixtures/ORACLE.md: exactly two unknowns). */
export const DEMO = { patientId: "PT-4401", nctId: "NCT07001001" } as const;

export const getTrials = (): Trial[] => trials;
export const getPatients = (): Patient[] => patients;

/** Hand-built fixture ids — the 3×3 pair picker and the demo stay on these. */
export const fixturePatientIds = () => patients.filter((p) => /^PT-\d+$/.test(p.id)).map((p) => p.id);
export const fixtureTrialIds = () => trials.filter((t) => /^NCT07001\d+$/.test(t.nctId)).map((t) => t.nctId);
export const getCube = (): PairResult[] => cube;
export const getWorklist = () => worklist;
export const getSweeps = () => sweeps;
export const getAssignments = () => assignments;
export const getLandscape = () => landscape;
export const getPayer = () => payer;
export const getEval = () => evalReport;

export const getTrial = (nctId: string) => trials.find((t) => t.nctId === nctId);
export const getPatient = (id: string) => patients.find((p) => p.id === id);
export const getPair = (patientId: string, nctId: string) =>
  cube.find((p) => p.patientId === patientId && p.nctId === nctId);
export const getSweep = (nctId: string, criterionId: string) =>
  sweeps.find((s) => s.nctId === nctId && s.criterionId === criterionId);
export const getEquity = (nctId: string) => equity.find((e) => e.nctId === nctId);

/** Patients per subgroup — the denominator every equity and elasticity number sits on. */
export function subgroupSizes(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of patients) out[p.race] = (out[p.race] ?? 0) + 1;
  return out;
}
