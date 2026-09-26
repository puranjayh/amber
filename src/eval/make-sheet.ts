/**
 * Produces a blind human-labelling CSV. It intentionally never imports the
 * engine: verdict and reason are blank for a human to fill without influence.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Patient, Trial, type CriterionLeaf, type CriterionNode, type Fact } from "@/src/contracts";

export const LABELLING_COLUMNS = [
  "patient_id",
  "nct_id",
  "criterion_id",
  "criterion_type",
  "criterion_text",
  "patient_evidence",
  "verdict",
  "reason",
  "notes",
] as const;

export type LabellingRow = Record<(typeof LABELLING_COLUMNS)[number], string>;

function leaves(nodes: CriterionNode[]): CriterionLeaf[] {
  const result: CriterionLeaf[] = [];
  const visit = (node: CriterionNode): void => {
    if (node.kind === "leaf") result.push(node);
    else node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return result;
}

function norm(value: string): string {
  return value.trim().toLowerCase();
}

/** Broad evidence retrieval for human review; it deliberately makes no verdict. */
export function plausibleEvidence(leaf: CriterionLeaf, facts: Fact[]): Fact[] {
  return facts.filter((fact) =>
    fact.predicate === leaf.predicate ||
    (leaf.analyte !== undefined && fact.analyte !== undefined && norm(fact.analyte) === norm(leaf.analyte)),
  );
}

export function renderEvidence(facts: Fact[]): string {
  if (!facts.length) return "NOTHING IN RECORD";
  return facts.map((fact) => `"${fact.sourceQuote}" (${fact.sourceDoc}, ${fact.observedAt})`).join("; ");
}

export function buildLabellingRows(patients: unknown, trials: unknown): LabellingRow[] {
  const parsedPatients = Patient.array().parse(patients);
  const parsedTrials = Trial.array().parse(trials);
  return parsedPatients.flatMap((patient) => parsedTrials.flatMap((trial) =>
    leaves(trial.criteria).map((leaf) => ({
      patient_id: patient.id,
      nct_id: trial.nctId,
      criterion_id: leaf.id,
      criterion_type: leaf.type,
      criterion_text: leaf.sourceSpan,
      patient_evidence: renderEvidence(plausibleEvidence(leaf, patient.facts)),
      // These must remain blank: a human labels the sheet before evaluation.
      verdict: "",
      reason: "",
      notes: "",
    })),
  ));
}

function escapeCsv(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function toLabellingCsv(rows: LabellingRow[]): string {
  return [
    LABELLING_COLUMNS.join(","),
    ...rows.map((row) => LABELLING_COLUMNS.map((column) => escapeCsv(row[column])).join(",")),
  ].join("\n") + "\n";
}

export async function writeLabellingSheet({
  patients,
  trials,
  outputPath = "data/eval/labelling-sheet.csv",
}: {
  patients: unknown;
  trials: unknown;
  outputPath?: string;
}): Promise<LabellingRow[]> {
  const rows = buildLabellingRows(patients, trials);
  const path = resolve(outputPath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, toLabellingCsv(rows), "utf8");
  return rows;
}

async function main(): Promise<void> {
  const patientsPath = resolve(process.argv[2] || "fixtures/patients.sample.json");
  const trialsPath = resolve(process.argv[3] || "fixtures/trials.sample.json");
  const outputPath = process.argv[4] || "data/eval/labelling-sheet.csv";
  const [patients, trials] = await Promise.all([
    readFile(patientsPath, "utf8").then(JSON.parse),
    readFile(trialsPath, "utf8").then(JSON.parse),
  ]);
  const rows = await writeLabellingSheet({ patients, trials, outputPath });
  console.log(`Wrote ${rows.length} blank labelling rows to ${resolve(outputPath)}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  void main();
}
