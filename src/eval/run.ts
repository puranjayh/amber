/** Command-line adapter for the pure evaluation report. */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { EvalSet } from "@/src/contracts";
import { evaluateHumanLabels, formatEvaluationReport, normalizeHumanLabels, type LabelSource } from "@/src/eval";

interface CliOptions {
  labels: string;
  patients: string;
  trials: string;
  asOf: string;
  output?: string;
  labelSource?: LabelSource;
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function loadJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function runEvaluation(options: Partial<CliOptions> = {}): Promise<void> {
  const realLabels = resolve(options.labels || argument("--labels") || "data/eval/labels.json");
  const fixtureLabels = resolve("fixtures/cube.sample.json");
  const usesFixtureLabels = !(await exists(realLabels));
  const labels = usesFixtureLabels ? fixtureLabels : realLabels;
  const patients = resolve(options.patients || argument("--patients") || "fixtures/patients.sample.json");
  const trials = resolve(options.trials || argument("--trials") || "fixtures/trials.sample.json");
  const asOf = options.asOf || argument("--as-of") || "2026-09-25";
  const output = options.output || argument("--out");

  const labelInput = await loadJson(labels);
  const explicitLabelSource = options.labelSource || argument("--label-source");
  const detected = EvalSet.safeParse(labelInput);
  const labelSource: LabelSource = explicitLabelSource === "fixture" || explicitLabelSource === "model-draft" || explicitLabelSource === "human"
    ? explicitLabelSource
    : usesFixtureLabels
      ? "fixture"
      : detected.success && detected.data.every((label) => label.labeller === "model-draft")
        ? "model-draft"
        : "human";
  const report = evaluateHumanLabels({
    labels: normalizeHumanLabels(labelInput),
    patients: await loadJson(patients),
    trials: await loadJson(trials),
    asOf,
    labelSource,
  });
  console.log(formatEvaluationReport(report));
  if (output) {
    const path = resolve(output);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  void runEvaluation();
}
