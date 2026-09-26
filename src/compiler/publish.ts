/** Atomic corpus publication: a bad provider run must never replace a good corpus. */
import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { Trial } from "@/src/contracts";
import type { CompiledTrialResult } from "@/src/compiler/compile";

const ResultEnvelope = z.object({ trial: Trial, sourceText: z.string() }).passthrough();

export function compiledTreeCount(results: readonly CompiledTrialResult[]): number {
  return results.filter((result) => result.trial.compilerConfidence > 0 && result.trial.criteria.length > 0).length;
}

function validateCorpus(results: unknown): CompiledTrialResult[] {
  return z.array(ResultEnvelope).parse(results) as CompiledTrialResult[];
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Writes next to the target, validates the temporary JSON, then atomically swaps
 * it in only when it retains at least the existing number of compiled trees.
 */
export async function publishCompilationResults(
  candidate: readonly CompiledTrialResult[],
  outputPath: string,
): Promise<{ compiledTrees: number; previousCompiledTrees: number | undefined }> {
  const output = resolve(outputPath);
  const checkedCandidate = validateCorpus(candidate);
  const compiledTrees = compiledTreeCount(checkedCandidate);
  const previous = await fileExists(output)
    ? validateCorpus(JSON.parse(await readFile(output, "utf8")))
    : undefined;
  const previousCompiledTrees = previous ? compiledTreeCount(previous) : undefined;

  if (previousCompiledTrees !== undefined && compiledTrees < previousCompiledTrees) {
    throw new Error(
      `Refusing to replace ${output}: new run produced ${compiledTrees} compiled trees, below the existing ${previousCompiledTrees}. Existing corpus was kept.`,
    );
  }

  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(checkedCandidate, null, 2)}\n`, "utf8");
    // Read from disk rather than trusting the in-memory candidate before swap.
    const written = validateCorpus(JSON.parse(await readFile(temporary, "utf8")));
    const writtenTrees = compiledTreeCount(written);
    if (writtenTrees !== compiledTrees) throw new Error(`Temporary corpus validation changed the compiled-tree count for ${output}.`);
    await rename(temporary, output);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  return { compiledTrees, previousCompiledTrees };
}
