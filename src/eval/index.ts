/**
 * Offline evaluation harness for comparing deterministic engine cells with
 * human labels. This is the contract-authorized read-only consumer of engine.
 */
import { z } from "zod";
import { EvalSet, PairResult, Patient, Trial, type Verdict } from "@/src/contracts";
import { evaluate } from "@/src/engine";

const VERDICTS = ["PASS", "FAIL", "UNKNOWN"] as const satisfies readonly Verdict[];

export interface HumanCellLabel {
  patientId: string;
  nctId: string;
  criterionId: string;
  expected: Verdict;
  criterionCitation?: string;
  chartCitation?: string;
}

export interface Disagreement {
  patientId: string;
  trialTitle: string;
  nctId: string;
  criterionId: string;
  expected: Verdict;
  actual: Verdict;
  /** Human-label citations, when the source format supplied them. */
  expectedCriterionCitation?: string;
  expectedChartCitation?: string;
  /** The engine's two citations: trial words and record words. */
  criterionCitation: string;
  chartCitation?: string;
}

export interface EvaluationIssue {
  patientId: string;
  nctId: string;
  criterionId: string;
  message: string;
}

export type ConfusionMatrix = Record<Verdict, Record<Verdict, number>>;

export interface EvaluationReport {
  evaluatedCells: number;
  issues: EvaluationIssue[];
  confusionMatrix: ConfusionMatrix;
  /** Macro averages over verdicts represented in the human labels. */
  precision: number | null;
  recall: number | null;
  /** P(human UNKNOWN | engine UNKNOWN): a reported "can't tell" was correct. */
  unknownAgreement: number | null;
  /** Kept alongside agreement because missing human UNKNOWN is also revealing. */
  unknownRecall: number | null;
  byVerdict: Record<Verdict, { precision: number | null; recall: number | null }>;
  disagreements: Disagreement[];
}

/** Accept both the eventual flat human-label format and fixture cube labels. */
export function normalizeHumanLabels(input: unknown): HumanCellLabel[] {
  const cube = z.array(PairResult).safeParse(input);
  if (cube.success) {
    return cube.data.flatMap((pair) => pair.cells.map((cell) => ({
      patientId: cell.patientId,
      nctId: cell.nctId,
      criterionId: cell.criterionId,
      expected: cell.verdict,
      criterionCitation: cell.criterionCitation,
      chartCitation: cell.chartCitation,
    })));
  }
  return EvalSet.parse(input).map((label) => ({
    patientId: label.patientId,
    nctId: label.nctId,
    criterionId: label.criterionId,
    expected: label.expected,
  }));
}

function emptyMatrix(): ConfusionMatrix {
  return Object.fromEntries(VERDICTS.map((expected) => [
    expected,
    Object.fromEntries(VERDICTS.map((actual) => [actual, 0])),
  ])) as ConfusionMatrix;
}

function average(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}

export function evaluateHumanLabels({
  labels,
  patients,
  trials,
  asOf,
}: {
  labels: HumanCellLabel[];
  patients: unknown;
  trials: unknown;
  asOf: string;
}): EvaluationReport {
  const patientById = new Map(Patient.array().parse(patients).map((patient) => [patient.id, patient]));
  const trialById = new Map(Trial.array().parse(trials).map((trial) => [trial.nctId, trial]));
  const pairResults = new Map<string, ReturnType<typeof evaluate>>();
  const confusionMatrix = emptyMatrix();
  const disagreements: Disagreement[] = [];
  const issues: EvaluationIssue[] = [];

  for (const label of labels) {
    const patient = patientById.get(label.patientId);
    const trial = trialById.get(label.nctId);
    if (!patient || !trial) {
      issues.push({
        patientId: label.patientId,
        nctId: label.nctId,
        criterionId: label.criterionId,
        message: !patient ? "label references an unknown patient" : "label references an unknown trial",
      });
      continue;
    }

    const pairKey = `${patient.id}\u0000${trial.nctId}`;
    const result = pairResults.get(pairKey) ?? evaluate(patient, trial, asOf);
    pairResults.set(pairKey, result);
    const actual = result.cells.find((cell) => cell.criterionId === label.criterionId);
    if (!actual) {
      issues.push({
        patientId: label.patientId,
        nctId: label.nctId,
        criterionId: label.criterionId,
        message: "label references a criterion absent from engine output",
      });
      continue;
    }

    confusionMatrix[label.expected][actual.verdict] += 1;
    if (label.expected !== actual.verdict) {
      disagreements.push({
        patientId: label.patientId,
        trialTitle: trial.title,
        nctId: label.nctId,
        criterionId: label.criterionId,
        expected: label.expected,
        actual: actual.verdict,
        expectedCriterionCitation: label.criterionCitation,
        expectedChartCitation: label.chartCitation,
        criterionCitation: actual.criterionCitation,
        chartCitation: actual.chartCitation,
      });
    }
  }

  const byVerdict = Object.fromEntries(VERDICTS.map((verdict) => {
    const truePositive = confusionMatrix[verdict][verdict];
    const predicted = VERDICTS.reduce((sum, expected) => sum + confusionMatrix[expected][verdict], 0);
    const expected = VERDICTS.reduce((sum, actual) => sum + confusionMatrix[verdict][actual], 0);
    return [verdict, {
      precision: predicted ? truePositive / predicted : null,
      recall: expected ? truePositive / expected : null,
    }];
  })) as EvaluationReport["byVerdict"];

  return {
    evaluatedCells: labels.length - issues.length,
    issues,
    confusionMatrix,
    precision: average(VERDICTS.map((verdict) => byVerdict[verdict].precision)),
    recall: average(VERDICTS.map((verdict) => byVerdict[verdict].recall)),
    unknownAgreement: byVerdict.UNKNOWN.precision,
    unknownRecall: byVerdict.UNKNOWN.recall,
    byVerdict,
    disagreements,
  };
}

export function formatEvaluationReport(report: EvaluationReport): string {
  const score = (value: number | null) => value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
  const rows = VERDICTS.map((expected) =>
    `  ${expected}: ${VERDICTS.map((actual) => `${actual}=${report.confusionMatrix[expected][actual]}`).join(" ")}`,
  );
  const disagreements = report.disagreements.length
    ? report.disagreements.map((item) => `  ${item.patientId} × ${item.trialTitle} / ${item.criterionId}: expected ${item.expected}, got ${item.actual}`).join("\n")
    : "  none";
  return [
    `Evaluated ${report.evaluatedCells} labelled cells; ${report.issues.length} unresolved labels.`,
    `Precision: ${score(report.precision)} | Recall: ${score(report.recall)} | UNKNOWN agreement: ${score(report.unknownAgreement)}`,
    "Confusion matrix (human rows, engine columns):",
    ...rows,
    "Disagreements:",
    disagreements,
  ].join("\n");
}
