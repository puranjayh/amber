/** Validate human labels, retain their provenance, then run the offline eval harness. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { EvalSet, type EvalLabel } from "@/src/contracts";
import { runEvaluation } from "@/src/eval/run";

export function parseHumanLabels(input: unknown): EvalLabel[] {
  const labels = EvalSet.parse(input);
  if (labels.some((label) => label.labeller === "model-draft")) {
    throw new Error("Human ingestion rejects labels marked model-draft; preserve label provenance.");
  }
  return labels;
}

export async function ingestHumanLabels({
  inputPath,
  labelsOutputPath = "data/eval/labels.human.json",
  patientsPath = "data/synthea/patients.json",
  trialsPath = "fixtures/trials.sample.json",
  asOf = "2026-09-25",
  resultsOutputPath = "data/eval/results.human.json",
}: {
  inputPath: string;
  labelsOutputPath?: string;
  patientsPath?: string;
  trialsPath?: string;
  asOf?: string;
  resultsOutputPath?: string;
}): Promise<EvalLabel[]> {
  const labels = parseHumanLabels(JSON.parse(await readFile(resolve(inputPath), "utf8")));
  const output = resolve(labelsOutputPath);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(labels, null, 2)}\n`, "utf8");
  await runEvaluation({
    labels: output,
    patients: patientsPath,
    trials: trialsPath,
    asOf,
    output: resultsOutputPath,
    labelSource: "human",
  });
  return labels;
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const inputPath = process.argv[2];
  if (!inputPath || inputPath.startsWith("--")) {
    throw new Error("Usage: ingest-human.ts <human-labels.json> [--patients path] [--trials path] [--as-of YYYY-MM-DD] [--labels-out path] [--out path]");
  }
  const labels = await ingestHumanLabels({
    inputPath,
    patientsPath: option("--patients"),
    trialsPath: option("--trials"),
    asOf: option("--as-of"),
    labelsOutputPath: option("--labels-out"),
    resultsOutputPath: option("--out"),
  });
  console.log(`Validated ${labels.length} human labels and wrote the evaluation report.`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  void main();
}
