import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { fileURLToPath } from "node:url";
import {
  DEMO_POOL,
  acceptCompiledPool,
  acceptPatients,
  acceptTrials,
  isDemoReady,
  pinPresentationTrial,
  realProtocolCount,
  unwrapTrials,
  loadCoverage,
} from "@/app/_data/inputs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

test("unwrapTrials accepts a bare Trial[] and the compiler { trial } wrapper", () => {
  const bare = { nctId: "NCT00000001", title: "t", phase: "PHASE2", condition: "NSCLC", slots: 1, criteria: [{ kind: "leaf", id: "INC-1", type: "inclusion", predicate: "age", operator: ">=", value: 18, tier: 0, sourceSpan: "Age ≥ 18." }], compilerConfidence: 1, needsHumanReview: false };
  expect(unwrapTrials([bare])).toEqual([bare]);
  expect(unwrapTrials([{ trial: bare, sourceText: "…", failure: null }])).toEqual([bare]);
});

test("acceptTrials drops needsHumanReview and empty criteria", () => {
  const ok = {
    nctId: "NCT00000001",
    title: "t",
    phase: "PHASE2",
    condition: "NSCLC",
    slots: 1,
    criteria: [{ kind: "leaf", id: "INC-1", type: "inclusion", predicate: "age", operator: ">=", value: 18, tier: 0, sourceSpan: "Age ≥ 18." }],
    compilerConfidence: 1,
    needsHumanReview: false,
  };
  const flagged = { ...ok, nctId: "NCT00000002", needsHumanReview: true };
  const empty = { ...ok, nctId: "NCT00000003", criteria: [] };
  expect(acceptTrials([ok, flagged, empty]).map((t) => t.nctId)).toEqual(["NCT00000001"]);
});

test("acceptPatients keeps a valid record and skips a broken one", () => {
  const ok = {
    id: "SYN-1",
    age: 60,
    sex: "F",
    race: "white",
    facts: [
      {
        predicate: "age",
        value: 60,
        observedAt: "2026-01-01",
        sourceQuote: "age 60",
        sourceDoc: "row",
        provenance: "chart",
      },
    ],
  };
  const kept = acceptPatients([ok, { id: "nope" }], "test.json");
  expect(kept.map((p) => p.id)).toEqual(["SYN-1"]);
});

test("loadCoverage is the published file or nothing — never a tree-derived count", () => {
  const coverage = loadCoverage(ROOT);
  if (coverage) expect(coverage.criteria).toBe(5103);
});

const leaf = {
  kind: "leaf" as const,
  id: "INC-1",
  type: "inclusion" as const,
  predicate: "age" as const,
  operator: ">=" as const,
  value: 18,
  tier: 0 as const,
  sourceSpan: "Age ≥ 18.",
};

const trial = (over: { nctId: string; needsHumanReview: boolean }) => ({
  nctId: over.nctId,
  title: over.nctId,
  phase: "PHASE2" as const,
  condition: "NSCLC",
  slots: 1,
  criteria: [leaf],
  compilerConfidence: 1,
  needsHumanReview: over.needsHumanReview,
});

test("citation flags do not gate the compiled pool; semantic reasons and failures do", () => {
  const ready = trial({ nctId: "NCT00000001", needsHumanReview: false });
  const citationOnly = trial({ nctId: "NCT00000002", needsHumanReview: true });
  const semantic = trial({ nctId: "NCT00000003", needsHumanReview: true });
  const failed = trial({ nctId: "NCT00000004", needsHumanReview: true });
  expect(isDemoReady(citationOnly, { trial: citationOnly, citationFlags: ["INC-1 sourceSpan near-verbatim"] })).toBe(
    true,
  );
  expect(isDemoReady(semantic, { trial: semantic, reviewReasons: ["possible structural alternative has no OR group"] })).toBe(
    false,
  );
  expect(isDemoReady(failed, { trial: failed, failure: { nctId: failed.nctId, issues: ["backtranslate"] } })).toBe(
    false,
  );
  const pool = acceptCompiledPool([
    { trial: ready },
    { trial: citationOnly, citationFlags: ["INC-1 sourceSpan near-verbatim"] },
    { trial: semantic, reviewReasons: ["possible structural alternative has no OR group"] },
    { trial: failed, failure: { nctId: failed.nctId, issues: ["backtranslate"] } },
  ]);
  expect(pool.map((t) => t.nctId)).toEqual(["NCT00000001", "NCT00000002"]);
});

test("presentation trial is pinned in front of the compiled pool", () => {
  const compiled = [trial({ nctId: "NCT09999999", needsHumanReview: false })];
  const fixtures = [trial({ nctId: "NCT07001001", needsHumanReview: false })];
  expect(pinPresentationTrial(compiled, fixtures).map((t) => t.nctId)).toEqual(["NCT07001001", "NCT09999999"]);
  expect(realProtocolCount(pinPresentationTrial(compiled, fixtures))).toBe(1);
});

test("on-disk compiled pool is 133 once citation flags no longer gate", () => {
  const path = `${ROOT}data/compiled/trials.json`;
  if (!existsSync(path)) return;
  expect(acceptCompiledPool(JSON.parse(readFileSync(path, "utf8"))).length).toBe(DEMO_POOL);
});
