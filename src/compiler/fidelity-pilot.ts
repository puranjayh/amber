/**
 * Ten focused fidelity probes: one protocol clause from each selected trial.
 * This deliberately costs ten model calls, not one call per bullet in a trial.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { CriterionLeaf, CriterionNode } from "@/src/contracts";
import {
  createGrokBlockCompiler,
  fidelityDefects,
  type EligibilityBlock,
  validateCompiledTree,
} from "@/src/compiler/compile";

const PROBES = [
  "NCT03178552", "NCT04739696", "NCT06492954", // sentence-as-boolean
  "NCT03693014", "NCT05859217", "NCT04919811", // washout
  "NCT03860272", "NCT04141644", "NCT07699237", // enumerated thresholds
  "NCT05384769", // imaging sentence: expected rejection, never a washout
] as const;

const EXPECTED_REJECTION = new Set(["NCT05384769"]);
const ENUMERATED = new Set(["NCT03860272", "NCT04141644", "NCT07699237"]);

interface FidelitySheetRow {
  nctId: string;
  side: "inclusion" | "exclusion";
  sourceSpans: string[];
}

interface ProbeResult {
  nctId: string;
  sourceText: string;
  expectedRejection: boolean;
  tree?: CriterionNode;
  rejection?: string[];
}

function thresholdCount(text: string): number {
  return (text.match(/(?:>=|<=|≥|≤|(?<![A-Za-z])>|(?<![A-Za-z])<|\bat least\b|\bmore than\b|\bless than\b)\s*\d/gi) ?? []).length;
}

function sourceForProbe(nctId: string, row: FidelitySheetRow): string {
  if (!ENUMERATED.has(nctId)) return row.sourceSpans[0];
  // Some rows keep one complete clause; others retain a heading plus distinct
  // leaves. Do not feed both, which would duplicate thresholds in the prompt.
  return row.sourceSpans.find((span) => thresholdCount(span) > 1)
    ?? row.sourceSpans.join("\n");
}

function leafValues(node: CriterionNode): CriterionLeaf[] {
  if (node.kind === "leaf") return [node];
  return node.children.flatMap(leafValues);
}

function assertPilot(results: readonly ProbeResult[]): void {
  const failures: string[] = [];
  for (const result of results) {
    if (result.expectedRejection) {
      if (result.tree !== undefined || result.rejection === undefined) failures.push(`${result.nctId}: expected an untyped imaging clause to reject`);
      continue;
    }
    if (result.tree === undefined) {
      failures.push(`${result.nctId}: rejected ${result.rejection?.join("; ") ?? "without a reason"}`);
      continue;
    }
    const defects = fidelityDefects(result.tree);
    if (defects.length > 0) failures.push(`${result.nctId}: fidelity defects ${defects.join(", ")}`);
    for (const leaf of leafValues(result.tree)) {
      if (typeof leaf.value === "string" && leaf.value.length > 40) {
        failures.push(`${result.nctId}/${leaf.id}: string value exceeds 40 characters`);
      }
    }
  }
  if (failures.length > 0) throw new Error(`Fidelity pilot failed:\n${failures.join("\n")}`);
}

async function atomicWrite(path: string, value: unknown): Promise<void> {
  const output = resolve(path);
  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, output);
}

export async function runFidelityPilot({
  sheetPath = "data/eval/fidelity-sheet.json",
  outputPath = "data/compiled/fidelity-pilot.json",
}: { sheetPath?: string; outputPath?: string } = {}): Promise<ProbeResult[]> {
  const sheet = JSON.parse(await readFile(resolve(sheetPath), "utf8")) as { rows: FidelitySheetRow[] };
  const compiler = createGrokBlockCompiler();
  const results = await Promise.all(PROBES.map(async (nctId): Promise<ProbeResult> => {
    const row = sheet.rows.find((candidate) => candidate.nctId === nctId);
    if (!row?.sourceSpans[0]) throw new Error(`Fidelity pilot source is missing for ${nctId}`);
    const block: EligibilityBlock = {
      type: row.side,
      // Fidelity rows retain each enumerated sub-clause separately. Compile the
      // complete list so this probe can prove it becomes one AND group.
      sourceText: sourceForProbe(nctId, row),
    };
    const candidate = await compiler(block);
    const checked = validateCompiledTree(candidate, block);
    return checked.success
      ? { nctId, sourceText: block.sourceText, expectedRejection: EXPECTED_REJECTION.has(nctId), tree: checked.data }
      : { nctId, sourceText: block.sourceText, expectedRejection: EXPECTED_REJECTION.has(nctId), rejection: checked.issues };
  }));
  assertPilot(results);
  await atomicWrite(outputPath, results);
  for (const result of results) {
    console.log(`\n=== ${result.nctId} ===\nSOURCE:\n${result.sourceText}\nTREE:\n${JSON.stringify(result.tree ?? { rejected: result.rejection }, null, 2)}`);
  }
  return results;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  void runFidelityPilot().then((results) => console.log(`\nPilot passed: ${results.length} source clauses.`));
}
