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

function sourceFromLabels(raw: unknown): string {
  if (!Array.isArray(raw)) return "model-draft";
  const labellers = raw.map((row) =>
    row && typeof row === "object" && "labeller" in row ? String((row as { labeller: unknown }).labeller) : "",
  );
  const reviewed = raw.every(
    (row) =>
      row &&
      typeof row === "object" &&
      "reviewedBy" in row &&
      (row as { reviewedBy: unknown }).reviewedBy,
  );
  if (reviewed && labellers.every((l) => l && !l.includes("model"))) return "human";
  return labellers.find((l) => l.includes("model")) || labellers[0] || "model-draft";
}

export { isHumanValidated };

/** Prefer the compiler's results.json; otherwise run the harness over labels.json. */
export function buildEvalReport(
  root: string,
  patients: Patient[],
  trials: Trial[],
  asOf: string,
): EvalReportT {
  const resultsPath = root + RESULTS;
  if (existsSync(resultsPath)) {
    const raw = readJson(resultsPath);
    const parsed = EvalReport.safeParse(raw);
    if (parsed.success) return parsed.data;
    if (raw && typeof raw === "object") {
      const wrapped = EvalReport.safeParse({
        labelSource: sourceFromLabels((raw as { labels?: unknown }).labels),
        ...(raw as object),
      });
      if (wrapped.success) return wrapped.data;
    }
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
    labelSource: sourceFromLabels(rawLabels),
    ...JSON.parse(JSON.stringify(report)),
  };
}
