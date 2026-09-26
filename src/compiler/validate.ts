/** Reporting-only final gate for the offline compiler batch. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Trial } from "@/src/contracts";
import type { CriterionLeaf, CriterionNode } from "@/src/contracts";
import type { CompiledTrialResult } from "@/src/compiler/compile";

export interface ThresholdBucket {
  threshold: number;
  count: number;
}

export interface CompilerReport {
  total: number;
  compiled: number;
  rejected: number;
  flagged: number;
  invalidOutput: number;
  thresholdHistogram: Record<string, ThresholdBucket[]>;
}

function leaves(nodes: CriterionNode[]): CriterionLeaf[] {
  const result: CriterionLeaf[] = [];
  const visit = (node: CriterionNode): void => {
    if (node.kind === "leaf") result.push(node);
    else node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return result;
}

/** Distribution of numeric eligibility thresholds for the criteria-landscape chart. */
export function buildThresholdHistogram(results: CompiledTrialResult[]): Record<string, ThresholdBucket[]> {
  const values = new Map<string, Map<number, number>>();
  for (const result of results) {
    if (result.trial.needsHumanReview) continue;
    for (const leaf of leaves(result.trial.criteria)) {
      if (typeof leaf.value !== "number") continue;
      const analyte = leaf.analyte || leaf.predicate;
      const bucket = values.get(analyte) ?? new Map<number, number>();
      bucket.set(leaf.value, (bucket.get(leaf.value) ?? 0) + 1);
      values.set(analyte, bucket);
    }
  }
  return Object.fromEntries([...values.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([analyte, buckets]) => [analyte, [...buckets.entries()]
      .sort(([left], [right]) => left - right)
      .map(([threshold, count]) => ({ threshold, count }))]));
}

export function validateCompilationResults(results: CompiledTrialResult[]): CompilerReport {
  let invalidOutput = 0;
  for (const result of results) {
    if (!Trial.safeParse(result.trial).success) invalidOutput += 1;
  }
  return {
    total: results.length,
    compiled: results.filter((result) => result.trial.compilerConfidence > 0).length,
    rejected: results.filter((result) => result.trial.compilerConfidence === 0).length,
    flagged: results.filter((result) => result.trial.needsHumanReview).length,
    invalidOutput,
    thresholdHistogram: buildThresholdHistogram(results),
  };
}

export function printHumanVerificationPairs(
  results: CompiledTrialResult[],
  write: (line: string) => void = console.log,
): void {
  const compiled = results.filter((result) => result.trial.criteria.length > 0).slice(0, 20);
  for (const result of compiled) {
    write(`\n=== ${result.trial.nctId}: ${result.trial.title} ===`);
    write(`SOURCE TEXT:\n${result.sourceText}`);
    write(`COMPILED TREE:\n${JSON.stringify(result.trial.criteria, null, 2)}`);
  }
}

export function printReport(report: CompilerReport, write: (line: string) => void = console.log): void {
  write(`Trials: ${report.total} total | ${report.compiled} compiled | ${report.rejected} rejected | ${report.flagged} flagged | ${report.invalidOutput} invalid output`);
  write("Numeric threshold distribution by analyte:");
  for (const [analyte, buckets] of Object.entries(report.thresholdHistogram)) {
    const labels = buckets.map(({ threshold, count }) => `${threshold}: ${"█".repeat(count)} (${count})`).join("  ");
    write(`  ${analyte}: ${labels}`);
  }
}

async function main(): Promise<void> {
  const inputPath = resolve(process.argv[2] || "data/compiled/trials.backtranslated.json");
  const results = JSON.parse(await readFile(inputPath, "utf8")) as CompiledTrialResult[];
  const report = validateCompilationResults(results);
  printReport(report);
  printHumanVerificationPairs(results);
  if (report.invalidOutput > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  void main();
}
