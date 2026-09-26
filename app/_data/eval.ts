import { existsSync, readFileSync } from "node:fs";
import { evaluateHumanLabels, normalizeHumanLabels } from "@/src/eval";
import type { Patient, Trial } from "@/src/contracts";
import { isHumanValidated } from "@/components/eval/labelSource";
import { EvalReport, type EvalReport as EvalReportT } from "./schema";

const RESULTS = "data/eval/results.json";
const LABELS = "data/eval/labels.json";

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

export { isHumanValidated };

/** Model-draft agreement only. The route reads data/eval/results.human.json itself. */
export function buildEvalReport(
  root: string,
  patients: Patient[],
  trials: Trial[],
  asOf: string,
): EvalReportT {
  const resultsPath = root + RESULTS;
  if (existsSync(resultsPath)) {
    const raw = readJson(resultsPath);
    const parsed = EvalReport.safeParse({
      ...(typeof raw === "object" && raw ? raw : {}),
      labelSource: "model-draft",
    });
    if (parsed.success) return parsed.data;
  }

  const labelsPath = root + LABELS;
  const rawLabels = existsSync(labelsPath) ? readJson(labelsPath) : [];
  const report = evaluateHumanLabels({
    labels: normalizeHumanLabels(rawLabels),
    patients,
    trials,
    asOf,
  });
  return {
    labelSource: "model-draft",
    ...JSON.parse(JSON.stringify(report)),
  };
}
