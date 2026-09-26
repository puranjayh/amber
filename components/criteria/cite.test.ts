import { expect, test } from "vitest";
import { getPair, getPatient, getTrial } from "@/app/_data/source";
import { listLeaves } from "./rows";
import { shownCitation } from "./cite";

test("each shown citation comes from a fact of that criterion's predicate", () => {
  const patient = getPatient("LC-A-052");
  const trial = getTrial("NCT02496663");
  const pair = getPair("LC-A-052", "NCT02496663");
  expect(patient && trial && pair).toBeTruthy();
  const leaves = listLeaves(trial!.criteria);
  for (const cell of pair!.cells) {
    const leaf = leaves.find((row) => row.id === cell.criterionId);
    if (!leaf) continue;
    const shown = shownCitation(patient!, leaf, cell, leaves);
    if (!shown) continue;
    const fact = patient!.facts.find((row) => row.sourceQuote === shown);
    if (leaf.predicate === "age" && /structured demographics/i.test(shown)) continue;
    expect(fact?.predicate, cell.criterionId).toBe(leaf.predicate);
  }
});

test("EXC-3 does not inherit the surgery sentence that belongs to EXC-1", () => {
  const patient = getPatient("LC-A-052")!;
  const trial = getTrial("NCT02496663")!;
  const pair = getPair("LC-A-052", "NCT02496663")!;
  const leaves = listLeaves(trial.criteria);
  const cell = (id: string) => pair.cells.find((row) => row.criterionId === id);
  const leaf = (id: string) => leaves.find((row) => row.id === id)!;
  expect(cell("EXC-3")?.chartCitation).toMatch(/surgery/i);
  expect(shownCitation(patient, leaf("EXC-3"), cell("EXC-3"), leaves) ?? "").not.toMatch(/surgery/i);
  expect(shownCitation(patient, leaf("EXC-2"), cell("EXC-2"), leaves) ?? "").not.toMatch(/surgery/i);
  expect(shownCitation(patient, leaf("EXC-1"), cell("EXC-1"), leaves)).toMatch(/Last major surgery 12 July 2026/);
});
