/** Merge a bounded retry back into the corpus, then regenerate every app artifact together. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { CompiledTrialResult } from "@/src/compiler/compile";
import {
  buildCompilationCoverage,
  buildCriteriaLandscape,
  buildSemanticReviewQueue,
  writeCompilationCoverage,
  writeCriteriaLandscape,
  writeSemanticReviewQueue,
} from "@/src/compiler/validate";

export function mergeRetryResults(base: CompiledTrialResult[], retries: CompiledTrialResult[]): CompiledTrialResult[] {
  const retryByNctId = new Map<string, CompiledTrialResult>();
  for (const retry of retries) {
    const nctId = retry.trial.nctId;
    if (retryByNctId.has(nctId)) throw new Error(`Retry corpus repeats ${nctId}`);
    retryByNctId.set(nctId, retry);
  }
  const baseIds = new Set(base.map((result) => result.trial.nctId));
  for (const nctId of retryByNctId.keys()) {
    if (!baseIds.has(nctId)) throw new Error(`Retry ${nctId} is absent from the base corpus`);
  }
  return base.map((result) => retryByNctId.get(result.trial.nctId) ?? result);
}

async function readResults(path: string): Promise<CompiledTrialResult[]> {
  return JSON.parse(await readFile(resolve(path), "utf8")) as CompiledTrialResult[];
}

async function writeJson(path: string, value: unknown): Promise<void> {
  const output = resolve(path);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1] ?? fallback;
}

export async function refreshArtifacts({
  basePath = "data/compiled/trials.backtranslated.json",
  retryPath = "data/compiled/trials.retry.json",
  mergedOutputPath = "data/compiled/trials.final.json",
  landscapePath = "data/compiled/landscape.json",
  coveragePath = "data/compiled/coverage.json",
  reviewQueuePath = "data/compiled/review-queue.json",
}: {
  basePath?: string;
  retryPath?: string;
  mergedOutputPath?: string;
  landscapePath?: string;
  coveragePath?: string;
  reviewQueuePath?: string;
} = {}): Promise<CompiledTrialResult[]> {
  const merged = mergeRetryResults(await readResults(basePath), await readResults(retryPath));
  await writeJson(mergedOutputPath, merged);
  await writeCriteriaLandscape(buildCriteriaLandscape(merged), landscapePath);
  await writeCompilationCoverage(buildCompilationCoverage(merged), coveragePath);
  await writeSemanticReviewQueue(buildSemanticReviewQueue(merged), reviewQueuePath);
  return merged;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  void refreshArtifacts({
    basePath: option("--base", "data/compiled/trials.backtranslated.json"),
    retryPath: option("--retries", "data/compiled/trials.retry.json"),
    mergedOutputPath: option("--out", "data/compiled/trials.final.json"),
    landscapePath: option("--landscape", "data/compiled/landscape.json"),
    coveragePath: option("--coverage", "data/compiled/coverage.json"),
    reviewQueuePath: option("--review-queue", "data/compiled/review-queue.json"),
  }).then((results) => console.log(`Refreshed artifacts from ${results.length} trials.`));
}
