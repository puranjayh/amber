import { describe, expect, test } from "vitest";
import type { CriterionLeaf, CriterionNode, CubeCell, Verdict } from "../../src/contracts";
import { buildSections, collectLeaves, kleene, unknownCells } from "./rows";

const leaf = (id: string, type: CriterionLeaf["type"] = "inclusion", tier: CriterionLeaf["tier"] = 1): CriterionLeaf => ({
  kind: "leaf",
  id,
  type,
  predicate: "lab_value",
  operator: ">=",
  value: 1,
  tier,
  sweepable: false,
  sourceSpan: `${id} text`,
});

const cell = (criterionId: string, verdict: Verdict, tier: CubeCell["tier"] = 1): CubeCell => ({
  patientId: "PT-1",
  nctId: "NCT00000001",
  criterionId,
  verdict,
  reason: verdict === "PASS" ? "satisfied" : verdict === "FAIL" ? "contradicted" : "absent",
  criterionCitation: `${criterionId} text`,
  tier,
});

describe("kleene", () => {
  test("AND: any FAIL wins, then UNKNOWN, else PASS", () => {
    expect(kleene("AND", ["PASS", "UNKNOWN", "FAIL"])).toBe("FAIL");
    expect(kleene("AND", ["PASS", "UNKNOWN"])).toBe("UNKNOWN");
    expect(kleene("AND", ["PASS", "PASS"])).toBe("PASS");
  });

  test("OR: any PASS wins, then UNKNOWN, else FAIL", () => {
    expect(kleene("OR", ["FAIL", "UNKNOWN", "PASS"])).toBe("PASS");
    expect(kleene("OR", ["FAIL", "UNKNOWN"])).toBe("UNKNOWN");
    expect(kleene("OR", ["FAIL", "FAIL"])).toBe("FAIL");
  });

  test("NOT keeps UNKNOWN as UNKNOWN", () => {
    expect(kleene("NOT", ["PASS"])).toBe("FAIL");
    expect(kleene("NOT", ["FAIL"])).toBe("PASS");
    expect(kleene("NOT", ["UNKNOWN"])).toBe("UNKNOWN");
  });
});

describe("buildSections", () => {
  test("preserves nested groups and splits by type", () => {
    const criteria: CriterionNode[] = [
      leaf("INC-1"),
      { kind: "group", op: "OR", children: [leaf("INC-2a"), leaf("INC-2b")] },
      leaf("EXC-1", "exclusion"),
    ];
    const cells = [
      cell("INC-1", "PASS"),
      cell("INC-2a", "FAIL"),
      cell("INC-2b", "UNKNOWN"),
      cell("EXC-1", "FAIL"),
    ];
    const [inc, exc] = buildSections(criteria, cells);
    expect(inc.type).toBe("inclusion");
    expect(inc.rows.map((r) => [r.kind, r.depth])).toEqual([
      ["leaf", 0],
      ["group", 0],
      ["leaf", 1],
      ["leaf", 1],
    ]);
    expect(inc.rows[1].kind === "group" && inc.rows[1].verdict).toBe("UNKNOWN");
    expect(exc.type).toBe("exclusion");
    expect(exc.rows).toHaveLength(1);
    expect(inc.rows.filter((r) => r.kind === "leaf").map((r) => r.key)).toEqual([
      "0:INC-1",
      "1.0:INC-2a",
      "1.1:INC-2b",
    ]);
  });

  test("duplicate leaf ids still get distinct row keys", () => {
    const criteria: CriterionNode[] = [leaf("INC-1"), leaf("INC-1")];
    const [section] = buildSections(criteria, [cell("INC-1", "PASS")]);
    const keys = section.rows.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("a leaf with no cell is surfaced, and its group verdict is withheld", () => {
    const criteria: CriterionNode[] = [
      { kind: "group", op: "AND", children: [leaf("A"), leaf("B")] },
    ];
    const [section] = buildSections(criteria, [cell("A", "PASS")]);
    const missing = section.rows[2];
    expect(missing.kind === "leaf" && missing.cell).toBeUndefined();
    expect(section.rows[0].kind === "group" && section.rows[0].verdict).toBeNull();
  });
});

test("collectLeaves reaches leaves inside nested groups", () => {
  const criteria: CriterionNode[] = [
    leaf("A"),
    { kind: "group", op: "AND", children: [{ kind: "group", op: "OR", children: [leaf("B")] }] },
  ];
  expect([...collectLeaves(criteria).keys()]).toEqual(["A", "B"]);
});

test("unknownCells sorts by tier, cheapest first", () => {
  const out = unknownCells([cell("X", "UNKNOWN", 3), cell("Y", "PASS", 0), cell("Z", "UNKNOWN", 0)]);
  expect(out.map((c) => c.criterionId)).toEqual(["Z", "X"]);
});
