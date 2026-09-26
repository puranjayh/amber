/** Reporting-only final gate for the offline compiler batch. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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

export interface LandscapeThreshold {
  threshold: number;
  count: number;
  /** Share of all compiled trials using this analyte, not just this operator. */
  percentage: number;
}

export interface LandscapeOperator {
  operator: CriterionLeaf["operator"];
  totalTrials: number;
  flaggedTrials: number;
  thresholds: LandscapeThreshold[];
}

export interface LandscapeAnalyte {
  analyte: string;
  totalTrials: number;
  flaggedTrials: number;
  operators: LandscapeOperator[];
}

export interface CriteriaLandscape {
  generatedFromTrials: number;
  analytes: LandscapeAnalyte[];
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

/**
 * App-ready criteria landscape. Counts are de-duplicated by trial, so one
 * protocol that happens to repeat an ANC threshold cannot inflate the slide.
 */
export function buildCriteriaLandscape(results: CompiledTrialResult[]): CriteriaLandscape {
  const analytes = new Map<string, {
    trials: Set<string>;
    flaggedTrials: Set<string>;
    operators: Map<CriterionLeaf["operator"], { trials: Set<string>; flaggedTrials: Set<string>; thresholds: Map<number, Set<string>> }>;
  }>();

  for (const result of results) {
    for (const leaf of leaves(result.trial.criteria)) {
      if (typeof leaf.value !== "number") continue;
      const analyte = leaf.analyte || leaf.predicate;
      const entry = analytes.get(analyte) ?? { trials: new Set(), flaggedTrials: new Set(), operators: new Map() };
      entry.trials.add(result.trial.nctId);
      if (result.trial.needsHumanReview) entry.flaggedTrials.add(result.trial.nctId);

      const operator = entry.operators.get(leaf.operator) ?? { trials: new Set(), flaggedTrials: new Set(), thresholds: new Map() };
      operator.trials.add(result.trial.nctId);
      if (result.trial.needsHumanReview) operator.flaggedTrials.add(result.trial.nctId);
      const thresholdTrials = operator.thresholds.get(leaf.value) ?? new Set<string>();
      thresholdTrials.add(result.trial.nctId);
      operator.thresholds.set(leaf.value, thresholdTrials);
      entry.operators.set(leaf.operator, operator);
      analytes.set(analyte, entry);
    }
  }

  return {
    generatedFromTrials: results.length,
    analytes: [...analytes.entries()]
      .map(([analyte, entry]) => ({
        analyte,
        totalTrials: entry.trials.size,
        flaggedTrials: entry.flaggedTrials.size,
        operators: [...entry.operators.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([operator, values]) => ({
            operator,
            totalTrials: values.trials.size,
            flaggedTrials: values.flaggedTrials.size,
            thresholds: [...values.thresholds.entries()]
              .sort(([left], [right]) => left - right)
              .map(([threshold, trials]) => ({
                threshold,
                count: trials.size,
                percentage: entry.trials.size ? trials.size / entry.trials.size : 0,
              })),
          })),
      }))
      .sort((left, right) => right.totalTrials - left.totalTrials || left.analyte.localeCompare(right.analyte)),
  };
}

export async function writeCriteriaLandscape(landscape: CriteriaLandscape, outputPath = "data/compiled/landscape.json"): Promise<void> {
  const path = resolve(outputPath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(landscape, null, 2)}\n`, "utf8");
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
  const landscapePath = process.argv[3] || "data/compiled/landscape.json";
  const results = JSON.parse(await readFile(inputPath, "utf8")) as CompiledTrialResult[];
  const report = validateCompilationResults(results);
  await writeCriteriaLandscape(buildCriteriaLandscape(results), landscapePath);
  printReport(report);
  printHumanVerificationPairs(results);
  if (report.invalidOutput > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  void main();
}
