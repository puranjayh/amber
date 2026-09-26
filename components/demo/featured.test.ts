import { expect, test } from "vitest";
import { featuredWorklist } from "./featured";

test("keeps rank order when the hero is already in the window", () => {
  const rows = ["PT-4402", "PT-4401", "A", "B", "C", "D", "E"].map((patientId) => ({ patientId }));
  expect(featuredWorklist(rows, "PT-4401", 6).map((r) => r.patientId)).toEqual([
    "PT-4402",
    "PT-4401",
    "A",
    "B",
    "C",
    "D",
  ]);
});

test("appends the hero when rank would hide them", () => {
  const rows = ["A", "B", "C", "D", "E", "F", "PT-4401"].map((patientId) => ({ patientId }));
  expect(featuredWorklist(rows, "PT-4401", 6).map((r) => r.patientId)).toEqual([
    "A",
    "B",
    "C",
    "D",
    "E",
    "PT-4401",
  ]);
});

test("short lists pass through", () => {
  const rows = [{ patientId: "PT-4401" }];
  expect(featuredWorklist(rows, "PT-4401", 6)).toEqual(rows);
});
