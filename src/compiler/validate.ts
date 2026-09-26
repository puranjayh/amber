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
  reviewFlags: ReviewFlagSummary;
}

export type ReviewFlagSeverity = "citation_granularity" | "semantic";

export interface ReviewFlagClass {
  /** Unique trials carrying at least one flag in this class. */
  trials: number;
  /** Total reasons, including multiple criteria in one trial. */
  flags: number;
  reasons: Record<string, number>;
}

export interface ReviewFlagSummary {
  citationGranularity: ReviewFlagClass;
  semantic: ReviewFlagClass;
}

/** Morning-review payload: only logic-risk flags, never citation granularity. */
export interface SemanticReviewQueue {
  generatedFromTrials: number;
  reviews: Array<{
    nctId: string;
    title: string;
    semanticReasons: string[];
    sourceText: string;
    compiledTree: CriterionNode[];
  }>;
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

/** Corpus-level denominator for every compiler-derived slide. */
export interface CompilationCoverage {
  generatedFromTrials: number;
  compiledTrials: number;
  rejectedTrials: number;
  flaggedTrials: number;
  demoPoolTrials: number;
  semanticReviewTrials: number;
  citationGranularityReviewTrials: number;
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

/** Coarser-but-verbatim citations are not semantic extraction failures. */
export function classifyReviewFlag(reason: string): ReviewFlagSeverity {
  if (/\bsourceSpan near-verbatim\b|\bsourceSpan not verifiable; full source block retained\b/.test(reason)) {
    return "citation_granularity";
  }
  // Unknown future review reasons are conservative: never hide a possible logic error.
  return "semantic";
}

function emptyReviewFlagClass(): ReviewFlagClass {
  return { trials: 0, flags: 0, reasons: {} };
}

export function summarizeReviewFlags(results: CompiledTrialResult[]): ReviewFlagSummary {
  const citationGranularity = emptyReviewFlagClass();
  const semantic = emptyReviewFlagClass();
  const citationTrials = new Set<string>();
  const semanticTrials = new Set<string>();

  for (const result of results) {
    for (const reason of result.reviewReasons ?? []) {
      const severity = classifyReviewFlag(reason);
      const target = severity === "citation_granularity" ? citationGranularity : semantic;
      const trials = severity === "citation_granularity" ? citationTrials : semanticTrials;
      target.flags += 1;
      target.reasons[reason] = (target.reasons[reason] ?? 0) + 1;
      trials.add(result.trial.nctId);
    }
  }
  citationGranularity.trials = citationTrials.size;
  semantic.trials = semanticTrials.size;
  return { citationGranularity, semantic };
}

export function buildSemanticReviewQueue(results: CompiledTrialResult[]): SemanticReviewQueue {
  return {
    generatedFromTrials: results.length,
    reviews: results.flatMap((result) => {
      const semanticReasons = (result.reviewReasons ?? []).filter((reason) => classifyReviewFlag(reason) === "semantic");
      if (!semanticReasons.length || !result.trial.criteria.length) return [];
      return [{
        nctId: result.trial.nctId,
        title: result.trial.title,
        semanticReasons,
        sourceText: result.sourceText,
        compiledTree: result.trial.criteria,
      }];
    }),
  };
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

export async function writeSemanticReviewQueue(queue: SemanticReviewQueue, outputPath = "data/compiled/review-queue.json"): Promise<void> {
  const path = resolve(outputPath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
}

/** Keep the coverage denominator alongside landscape and review artifacts. */
export function buildCompilationCoverage(results: CompiledTrialResult[]): CompilationCoverage {
  const reviewFlags = summarizeReviewFlags(results);
  const compiledTrials = results.filter((result) => result.trial.criteria.length > 0).length;
  const flaggedTrials = results.filter((result) => result.trial.needsHumanReview).length;
  return {
    generatedFromTrials: results.length,
    compiledTrials,
    rejectedTrials: results.length - compiledTrials,
    flaggedTrials,
    demoPoolTrials: results.filter((result) => result.trial.criteria.length > 0 && !result.trial.needsHumanReview).length,
    semanticReviewTrials: reviewFlags.semantic.trials,
    citationGranularityReviewTrials: reviewFlags.citationGranularity.trials,
  };
}

export async function writeCompilationCoverage(coverage: CompilationCoverage, outputPath = "data/compiled/coverage.json"): Promise<void> {
  const path = resolve(outputPath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(coverage, null, 2)}\n`, "utf8");
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
    reviewFlags: summarizeReviewFlags(results),
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
  write(`Review flags: ${report.reviewFlags.citationGranularity.trials} citation-granularity trials (${report.reviewFlags.citationGranularity.flags} flags) | ${report.reviewFlags.semantic.trials} semantic trials (${report.reviewFlags.semantic.flags} flags)`);
  for (const [severity, flags] of Object.entries(report.reviewFlags) as Array<[keyof ReviewFlagSummary, ReviewFlagClass]>) {
    const reasons = Object.entries(flags.reasons).sort(([left], [right]) => left.localeCompare(right));
    if (reasons.length) write(`  ${severity}: ${reasons.map(([reason, count]) => `${reason} (${count})`).join("; ")}`);
  }
  write("Numeric threshold distribution by analyte:");
  for (const [analyte, buckets] of Object.entries(report.thresholdHistogram)) {
    const labels = buckets.map(({ threshold, count }) => `${threshold}: ${"█".repeat(count)} (${count})`).join("  ");
    write(`  ${analyte}: ${labels}`);
  }
}

async function main(): Promise<void> {
  const inputPath = resolve(process.argv[2] || "data/compiled/trials.backtranslated.json");
  const landscapePath = process.argv[3] || "data/compiled/landscape.json";
  const reviewQueuePath = process.argv[4] || "data/compiled/review-queue.json";
  const coveragePath = process.argv[5] || "data/compiled/coverage.json";
  const results = JSON.parse(await readFile(inputPath, "utf8")) as CompiledTrialResult[];
  const report = validateCompilationResults(results);
  await writeCriteriaLandscape(buildCriteriaLandscape(results), landscapePath);
  await writeSemanticReviewQueue(buildSemanticReviewQueue(results), reviewQueuePath);
  await writeCompilationCoverage(buildCompilationCoverage(results), coveragePath);
  printReport(report);
  printHumanVerificationPairs(results);
  if (report.invalidOutput > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  void main();
}
