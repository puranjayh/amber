import { expect, test } from "vitest";
import { DEFAULT_PHYSICIAN_ID } from "@/components/hcp/roster";
import { attributeFromObserved, attributePatient, physiciansFrom } from "./attribution";

test("fixture patients stay on Rahman and are marked assigned when no provider file hits", () => {
  const row = attributeFromObserved("PT-4401", new Map());
  expect(row.physicianId).toBe(DEFAULT_PHYSICIAN_ID);
  expect(row.source).toBe("assigned");
  expect(row.name).toContain("Rahman");
});

test("same patient hashes to the same assigned physician", () => {
  const a = attributeFromObserved("SYN-19ad9612", new Map());
  const b = attributeFromObserved("SYN-19ad9612", new Map());
  expect(a.physicianId).toBe(b.physicianId);
  expect(a.source).toBe("assigned");
});

test("observed NPI wins and is labelled observed — never silently assigned", () => {
  const found = new Map([["PT-4401", { id: "1234567890", name: "Priya Shah, MD", site: "Memorial" }]]);
  const row = attributeFromObserved("PT-4401", found);
  expect(row.source).toBe("observed");
  expect(row.physicianId).toBe("1234567890");
  expect(row.name).toBe("Priya Shah, MD");
  expect(row.site).toBe("Memorial");
});

test("published attribution without a providers.json file is assigned, not observed", () => {
  expect(attributePatient("PT-4401").source).toBe("assigned");
});

test("physiciansFrom counts observed vs assigned separately", () => {
  const rows = [
    attributeFromObserved("PT-1", new Map()),
    attributeFromObserved("PT-2", new Map([["PT-2", { id: "hcp-rahman", name: "Aisha Rahman, MD" }]])),
  ];
  const docs = physiciansFrom(rows);
  const rahman = docs.find((d) => d.id === "hcp-rahman");
  expect(rahman?.assigned).toBe(1);
  expect(rahman?.observed).toBe(1);
});
