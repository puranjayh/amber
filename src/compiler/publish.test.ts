import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "vitest";
import { publishCompilationResults } from "@/src/compiler/publish";
import type { CompiledTrialResult } from "@/src/compiler/compile";

function result(nctId: string, compiled: boolean): CompiledTrialResult {
  return {
    sourceText: "Age 18 years or older.",
    trial: {
      nctId,
      title: nctId,
      phase: "PHASE1",
      condition: "Lung cancer",
      slots: 0,
      criteria: compiled ? [{ kind: "leaf", id: "INC-1", type: "inclusion", predicate: "age", operator: ">=", value: 18, tier: 1, sweepable: true, sweepRange: [0, 100], sweepStep: 1, sourceSpan: "Age 18 years or older." }] : [],
      compilerConfidence: compiled ? 1 : 0,
      needsHumanReview: !compiled,
    },
    ...(compiled ? {} : { failure: { nctId, issues: ["provider unavailable"] } }),
  };
}

test("never replaces a stronger existing corpus with a failed provider run", async () => {
  const directory = await mkdtemp(join(tmpdir(), "amber-publish-"));
  const path = join(directory, "trials.json");
  try {
    await publishCompilationResults([result("NCT00000001", true), result("NCT00000002", true)], path);
    await expect(publishCompilationResults([result("NCT00000001", false), result("NCT00000002", false)], path))
      .rejects.toThrow(/Existing corpus was kept/);
    const retained = JSON.parse(await readFile(path, "utf8")) as CompiledTrialResult[];
    expect(retained.map((entry) => entry.trial.criteria.length)).toEqual([1, 1]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
