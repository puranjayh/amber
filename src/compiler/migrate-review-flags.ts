/** One-time, no-API metadata migration for already compiled corpora. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Trial } from "@/src/contracts";
import type { CompiledTrialResult } from "@/src/compiler/compile";
import { publishCompilationResults } from "@/src/compiler/publish";
import { partitionReviewFlags } from "@/src/compiler/review-flags";

export function migrateReviewFlags(result: CompiledTrialResult): CompiledTrialResult {
  // Legacy backtranslation stored its semantic divergence on failure. Preserve
  // that as an explicit review reason when the compiled tree is still usable.
  const legacyFailureReasons = result.trial.criteria.length ? result.failure?.issues ?? [] : [];
  const partitioned = partitionReviewFlags([
    ...(result.reviewReasons ?? []),
    ...(result.citationFlags ?? []),
    ...legacyFailureReasons,
  ]);
  const semanticReasons = [...new Set(partitioned.semanticReasons)];
  const citationFlags = [...new Set(partitioned.citationFlags)];
  const { reviewReasons: _oldReviewReasons, citationFlags: _oldCitationFlags, ...withoutLegacyFlags } = result;
  return {
    ...withoutLegacyFlags,
    // A failed compilation has no usable tree. Otherwise, only semantic risk gates it.
    trial: Trial.parse({ ...result.trial, needsHumanReview: Boolean(result.failure) || semanticReasons.length > 0 }),
    ...(semanticReasons.length ? { reviewReasons: semanticReasons } : {}),
    ...(citationFlags.length ? { citationFlags } : {}),
  };
}

export async function migrateReviewFlagFile(path: string): Promise<void> {
  const output = resolve(path);
  const results = JSON.parse(await readFile(output, "utf8")) as CompiledTrialResult[];
  await publishCompilationResults(results.map(migrateReviewFlags), output);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const paths = process.argv.slice(2);
  void Promise.all((paths.length ? paths : ["data/compiled/trials.json", "data/compiled/trials.backtranslated.json"])
    .map(migrateReviewFlagFile))
    .then(() => console.log("Migrated citation granularity flags without recompiling."));
}
