import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSections, kleene, unknownCells } from "./rows.ts";

const leaf = (id, type = "inclusion", tier = 1) => ({
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

const cell = (criterionId, verdict, tier = 1) => ({
  patientId: "PT-1",
  nctId: "NCT00000001",
  criterionId,
  verdict,
  reason: verdict === "PASS" ? "satisfied" : verdict === "FAIL" ? "contradicted" : "absent",
  criterionCitation: `${criterionId} text`,
  tier,
});

test("kleene AND: any FAIL wins, then UNKNOWN, else PASS", () => {
  assert.equal(kleene("AND", ["PASS", "UNKNOWN", "FAIL"]), "FAIL");
  assert.equal(kleene("AND", ["PASS", "UNKNOWN"]), "UNKNOWN");
  assert.equal(kleene("AND", ["PASS", "PASS"]), "PASS");
});

test("kleene OR: any PASS wins, then UNKNOWN, else FAIL", () => {
  assert.equal(kleene("OR", ["FAIL", "UNKNOWN", "PASS"]), "PASS");
  assert.equal(kleene("OR", ["FAIL", "UNKNOWN"]), "UNKNOWN");
  assert.equal(kleene("OR", ["FAIL", "FAIL"]), "FAIL");
});

test("kleene NOT keeps UNKNOWN as UNKNOWN", () => {
  assert.equal(kleene("NOT", ["PASS"]), "FAIL");
  assert.equal(kleene("NOT", ["FAIL"]), "PASS");
  assert.equal(kleene("NOT", ["UNKNOWN"]), "UNKNOWN");
});

test("buildSections preserves nested groups and splits by type", () => {
  const criteria = [
    leaf("INC-1"),
    { kind: "group", op: "OR", children: [leaf("INC-2a"), leaf("INC-2b")] },
    leaf("EXC-1", "exclusion"),
  ];
  const cells = [
    cell("INC-1", "PASS"),
    cell("INC-2a", "FAIL"),
    cell("INC-2b", "UNKNOWN"),
    cell("EXC-1", "PASS"),
  ];
  const [inc, exc] = buildSections(criteria, cells);
  assert.equal(inc.type, "inclusion");
  assert.deepEqual(
    inc.rows.map((r) => [r.kind, r.depth]),
    [["leaf", 0], ["group", 0], ["leaf", 1], ["leaf", 1]],
  );
  assert.equal(inc.rows[1].verdict, "UNKNOWN");
  assert.equal(exc.type, "exclusion");
  assert.equal(exc.rows.length, 1);
});

test("a leaf with no cell is surfaced, and its group verdict is withheld", () => {
  const criteria = [{ kind: "group", op: "AND", children: [leaf("A"), leaf("B")] }];
  const [section] = buildSections(criteria, [cell("A", "PASS")]);
  assert.equal(section.rows[2].cell, undefined);
  assert.equal(section.rows[0].verdict, null);
});

test("unknownCells sorts by tier, cheapest first", () => {
  const out = unknownCells([
    cell("X", "UNKNOWN", 3),
    cell("Y", "PASS", 0),
    cell("Z", "UNKNOWN", 0),
  ]);
  assert.deepEqual(out.map((c) => c.criterionId), ["Z", "X"]);
});
