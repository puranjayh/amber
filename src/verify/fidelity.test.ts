import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEED,
  buildFidelitySheet,
  flaggedTrialIds,
  looksLikeFlattenedDisjunction,
  reviewUnits,
  sourceContextOf,
  sourceSpansOf,
} from "./fidelity";
import { ingestFidelity, wilson95 } from "./ingest-fidelity";
import { group, leaf, trial } from "@/src/engine/testing";

const span = (id: string, text: string, over = {}) =>
  leaf({ id, predicate: "diagnosis", operator: "==", value: id, sourceSpan: text, ...over });

/** A trial shaped like the corpus: one big AND of inclusions, one big OR of exclusions. */
const sectioned = (nctId: string, n: number) =>
  trial({
    nctId,
    criteria: [
      group(
        "AND",
        Array.from({ length: n }, (_, i) => span(`INC-${i + 1}`, `Inclusion sentence ${i + 1}.`)),
      ),
    ],
  });

describe("flaggedTrialIds", () => {
  it("keeps a genuine semantic flag", () => {
    const out = flaggedTrialIds([
      { nctId: "NCT00000001", semanticReasons: ["possible structural alternative has no OR group"] },
    ]);
    expect([...out.keys()]).toEqual(["NCT00000001"]);
  });

  it("discards an API failure written into the flag field", () => {
    // 63 of the 100 review-queue entries are the back-translation run's 403 after
    // it ran out of credits. Those say nothing about compilation.
    const out = flaggedTrialIds([
      {
        nctId: "NCT00000001",
        semanticReasons: ['403 "Your team has either used all available credits or reached its monthly spending limit."'],
      },
      { nctId: "NCT00000002", semanticReasons: ["rate limit exceeded"] },
      { nctId: "NCT00000003", semanticReasons: ["ECONNRESET"] },
    ]);
    expect([...out.keys()]).toEqual([]);
  });

  it("keeps the genuine reasons from a trial that has both", () => {
    const out = flaggedTrialIds([
      {
        nctId: "NCT00000001",
        semanticReasons: ["429 too many requests", "possible structural alternative has no OR group"],
      },
    ]);
    expect(out.get("NCT00000001")).toEqual(["possible structural alternative has no OR group"]);
  });
});

describe("reviewUnits — the granularity a human can judge", () => {
  it("unwraps a section group into its numbered criteria", () => {
    // The whole inclusion section is far too big to judge as one unit.
    expect(reviewUnits(sectioned("NCT00000001", 6))).toHaveLength(6);
  });

  it("keeps a bare top-level leaf as its own unit", () => {
    const t = trial({ nctId: "NCT00000001", criteria: [span("INC-1", "One sentence.")] });
    expect(reviewUnits(t)).toHaveLength(1);
  });

  it("keeps a single-child group whole rather than unwrapping to nothing", () => {
    const t = trial({ nctId: "NCT00000001", criteria: [group("OR", [span("INC-1", "x")])] });
    const units = reviewUnits(t);
    expect(units).toHaveLength(1);
    expect(units[0].node.kind).toBe("group");
  });

  it("records every criterion id the unit covers", () => {
    const t = trial({
      nctId: "NCT00000001",
      criteria: [group("AND", [group("OR", [span("A", "x"), span("B", "y")]), span("C", "z")])],
    });
    const units = reviewUnits(t);
    expect(units.map((u) => u.criterionIds)).toEqual([["A", "B"], ["C"]]);
  });

  it("labels each unit's side", () => {
    const t = trial({
      nctId: "NCT00000001",
      criteria: [group("OR", [span("E1", "x", { type: "exclusion" }), span("E2", "y", { type: "exclusion" })])],
    });
    expect(reviewUnits(t)[0].side).toBe("exclusion");
  });
});

describe("source text", () => {
  it("collects the verbatim spans behind a unit, deduplicated", () => {
    const node = group("AND", [span("A", "Same sentence."), span("B", "Same sentence."), span("C", "Other.")]);
    expect(sourceSpansOf(node)).toEqual(["Same sentence.", "Other."]);
  });

  it("puts a group's own span first when the compiler set one", () => {
    const node = group("OR", [span("A", "Leaf span.")], "Group span.");
    expect(sourceSpansOf(node)).toEqual(["Group span.", "Leaf span."]);
  });

  it("windows the surrounding prose so an omission is visible", () => {
    const prose = `1. First criterion.\n2. Must have had platinum OR be platinum-intolerant.\n3. Third criterion.`;
    const out = sourceContextOf(prose, ["Must have had platinum OR be platinum-intolerant."], 40);
    expect(out).toContain("platinum-intolerant");
    expect(out).toContain("First criterion");
  });

  it("returns empty rather than guessing when the span is not in the prose", () => {
    expect(sourceContextOf("some prose", ["not in there"])).toBe("");
    expect(sourceContextOf("", ["anything"])).toBe("");
  });
});

describe("looksLikeFlattenedDisjunction", () => {
  const unitFor = (node: Parameters<typeof sourceSpansOf>[0]) => ({
    nctId: "NCT00000001",
    criterionIds: ["A"],
    side: "inclusion" as const,
    node,
  });

  it("fires when the source offers alternatives and the tree has none", () => {
    const node = group("AND", [
      span("A", "Prior platinum or taxane therapy."),
      span("B", "Prior platinum or taxane therapy."),
    ]);
    expect(looksLikeFlattenedDisjunction(unitFor(node))).toBe(true);
  });

  it("does not fire when the tree already has the disjunction", () => {
    const node = group("OR", [
      span("A", "Prior platinum or taxane therapy."),
      span("B", "Prior platinum or taxane therapy."),
    ]);
    expect(looksLikeFlattenedDisjunction(unitFor(node))).toBe(false);
  });

  it("does not fire on prose with no alternatives", () => {
    expect(looksLikeFlattenedDisjunction(unitFor(span("A", "Aged 18 years or older.")))).toBe(true);
    expect(looksLikeFlattenedDisjunction(unitFor(span("A", "Histologically confirmed NSCLC.")))).toBe(false);
  });

  it("is not fooled by `or` inside a word", () => {
    // "prior" and "oral" contain "or" and appear in most oncology criteria; a
    // substring match here would flag the entire corpus.
    expect(looksLikeFlattenedDisjunction(unitFor(span("A", "Prior oral therapy required.")))).toBe(false);
  });
});

describe("buildFidelitySheet", () => {
  const trials = Array.from({ length: 12 }, (_, i) =>
    sectioned(`NCT0000000${i}`.slice(0, 11).padEnd(11, "0"), 5),
  );
  const flags = new Map([[trials[0].nctId, ["possible structural alternative has no OR group"]]]);

  it("takes one row per flagged trial and the requested number of unflagged rows", () => {
    const sheet = buildFidelitySheet(trials, flags, { unflaggedSample: 7 });
    expect(sheet.rows.filter((r) => r.stratum === "flagged")).toHaveLength(1);
    expect(sheet.rows.filter((r) => r.stratum === "unflagged")).toHaveLength(7);
  });

  it("puts the flagged rows first, where a fresh reviewer starts", () => {
    const sheet = buildFidelitySheet(trials, flags, { unflaggedSample: 5 });
    expect(sheet.rows[0].stratum).toBe("flagged");
  });

  it("leaves the human fields blank", () => {
    const sheet = buildFidelitySheet(trials, flags, { unflaggedSample: 5 });
    for (const row of sheet.rows) {
      expect(row.faithful).toBeNull();
      expect(row.failureMode).toBeNull();
      expect(row.reviewer).toBeNull();
    }
  });

  it("keeps the strata distinguishable and records how each was drawn", () => {
    const sheet = buildFidelitySheet(trials, flags, { unflaggedSample: 5 });
    expect(new Set(sheet.rows.map((r) => r.stratum))).toEqual(new Set(["flagged", "unflagged"]));
    for (const row of sheet.rows) {
      expect(row.selection).toBe(
        row.stratum === "flagged" ? "most-suspicious-in-flagged-trial" : "uniform-random",
      );
    }
    expect(sheet.strata.flagged.selection).toMatch(/upper bound/);
  });

  it("records the sampling rate, which ingest needs to reweight", () => {
    const sheet = buildFidelitySheet(trials, flags, { unflaggedSample: 5 });
    expect(sheet.strata.unflagged.criteriaAvailable).toBe(11 * 5);
    expect(sheet.strata.unflagged.samplingRate).toBeCloseTo(5 / 55, 6);
  });

  it("never samples a flagged trial into the unflagged stratum", () => {
    const sheet = buildFidelitySheet(trials, flags, { unflaggedSample: 20 });
    for (const row of sheet.rows.filter((r) => r.stratum === "unflagged")) {
      expect(flags.has(row.nctId)).toBe(false);
    }
  });

  it("is deterministic in the seed", () => {
    const a = buildFidelitySheet(trials, flags, { unflaggedSample: 9 });
    const b = buildFidelitySheet(trials, flags, { unflaggedSample: 9 });
    expect(a.rows.map((r) => r.id)).toEqual(b.rows.map((r) => r.id));
    expect(a.seed).toBe(DEFAULT_SEED);
  });

  it("draws a different sample for a different seed", () => {
    const a = buildFidelitySheet(trials, flags, { unflaggedSample: 9, seed: 1 });
    const b = buildFidelitySheet(trials, flags, { unflaggedSample: 9, seed: 2 });
    expect(a.rows.map((r) => r.id)).not.toEqual(b.rows.map((r) => r.id));
  });

  it("carries plain English and an outline on every row, and no JSON", () => {
    const sheet = buildFidelitySheet(trials, flags, { unflaggedSample: 5 });
    for (const row of sheet.rows) {
      expect(row.compiledPlainEnglish.length).toBeGreaterThan(0);
      expect(row.compiledOutline.length).toBeGreaterThan(0);
      expect(row.compiledPlainEnglish).not.toMatch(/[{}]|"kind"|sourceSpan/);
      expect(row.sourceSpans.length).toBeGreaterThan(0);
    }
  });

  it("asks for no more rows than exist", () => {
    const sheet = buildFidelitySheet(trials, flags, { unflaggedSample: 10_000 });
    expect(sheet.rows.filter((r) => r.stratum === "unflagged")).toHaveLength(55);
  });

  it("is empty-input safe", () => {
    const sheet = buildFidelitySheet([], new Map(), { unflaggedSample: 5 });
    expect(sheet.rows).toEqual([]);
    expect(sheet.strata.unflagged.samplingRate).toBe(0);
  });

  it("does not mutate the corpus", () => {
    const before = JSON.stringify(trials);
    buildFidelitySheet(trials, flags, { unflaggedSample: 5 });
    expect(JSON.stringify(trials)).toBe(before);
  });
});
