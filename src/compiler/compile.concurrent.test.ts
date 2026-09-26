import { describe, expect, it } from "vitest";
import { compileRawTrials, withRetry } from "@/src/compiler/compile";
import type { RawClinicalTrial } from "@/src/compiler/fetch-trials";

function raw(index: number): RawClinicalTrial {
  return {
    protocolSection: {
      identificationModule: { nctId: `NCT${String(index).padStart(8, "0")}`, briefTitle: `Trial ${index}` },
      designModule: { studyType: "INTERVENTIONAL" },
      eligibilityModule: { eligibilityCriteria: "Inclusion Criteria:\n- Age 18 years or older." },
    },
  };
}

const validAgeTree = {
  kind: "leaf" as const,
  id: "INC-1",
  type: "inclusion" as const,
  predicate: "age" as const,
  operator: ">=" as const,
  value: 18,
  tier: 1 as const,
  sweepable: true,
  sweepRange: [0, 100] as [number, number],
  sweepStep: 1,
  sourceSpan: "Age 18 years or older.",
};

describe("compiler batch concurrency", () => {
  it("limits in-flight trial work and retains source ordering", async () => {
    let active = 0;
    let maximumActive = 0;
    const results = await compileRawTrials(
      [raw(1), raw(2), raw(3), raw(4)],
      async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));
        active -= 1;
        return validAgeTree;
      },
      { concurrency: 2 },
    );
    expect(maximumActive).toBe(2);
    expect(results.map((result) => result.trial.nctId)).toEqual([
      "NCT00000001", "NCT00000002", "NCT00000003", "NCT00000004",
    ]);
  });

  it("retries a rate limit and does not retry a validation error", async () => {
    let calls = 0;
    await expect(withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw { status: 429 };
        return "ok";
      },
      { sleep: async () => undefined },
    )).resolves.toBe("ok");
    expect(calls).toBe(3);

    calls = 0;
    await expect(withRetry(
      async () => {
        calls += 1;
        throw { status: 400 };
      },
      { sleep: async () => undefined },
    )).rejects.toEqual({ status: 400 });
    expect(calls).toBe(1);
  });
});
