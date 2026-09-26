/** No-API repair for legacy corpora compiled before IDs were made trial-unique. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CriterionNode } from "@/src/contracts";
import type { CompiledTrialResult } from "@/src/compiler/compile";
import { publishCompilationResults } from "@/src/compiler/publish";
import { uniquifyCriterionNodeIds } from "@/src/compiler/compile";

function renameReason(reason: string, renamedIds: Map<string, string>): string {
  for (const [originalId, uniqueId] of renamedIds) {
    if (reason.startsWith(`${originalId} `) || reason.startsWith(`${originalId}:`)) {
      return `${uniqueId}${reason.slice(originalId.length)}`;
    }
  }
  return reason;
}

export function deduplicateTrialCriterionIds(result: CompiledTrialResult): CompiledTrialResult {
  const usedIds = new Set<string>();
  const renamedIds = new Map<string, string>();
  const criteria = result.trial.criteria.map((node) => {
    const unique = uniquifyCriterionNodeIds(node, usedIds);
    for (const [originalId, uniqueId] of unique.renamedIds) renamedIds.set(originalId, uniqueId);
    return unique.node;
  }) as CriterionNode[];
  if (!renamedIds.size) return result;
  return {
    ...result,
    trial: { ...result.trial, criteria },
    ...(result.reviewReasons ? { reviewReasons: result.reviewReasons.map((reason) => renameReason(reason, renamedIds)) } : {}),
    ...(result.citationFlags ? { citationFlags: result.citationFlags.map((reason) => renameReason(reason, renamedIds)) } : {}),
  };
}

export async function deduplicateCriterionIdsFile(path: string): Promise<void> {
  const output = resolve(path);
  const results = JSON.parse(await readFile(output, "utf8")) as CompiledTrialResult[];
  await publishCompilationResults(results.map(deduplicateTrialCriterionIds), output);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const paths = process.argv.slice(2);
  void Promise.all((paths.length ? paths : ["data/compiled/trials.json", "data/compiled/trials.backtranslated.json"])
    .map(deduplicateCriterionIdsFile))
    .then(() => console.log("Made compiled criterion IDs unique without calling an API."));
}
