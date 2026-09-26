import { expect, test } from "vitest";
import { erlotinibFlip, storyNote } from "./invert";

const egfrUnknown = ["INC-2", "INC-3", "INC-4", "INC-5", "INC-6"].map((criterionId) => ({
  criterionId,
  verdict: "UNKNOWN",
}));

test("the hero is unknown on EGFR and still passes the unwindowed ECOG leaf", () => {
  expect(
    storyNote({
      patientId: "PT-4410",
      nctId: "NCT02496663",
      eliminated: false,
      cells: [...egfrUnknown, { criterionId: "INC-9", verdict: "PASS" }, { criterionId: "INC-7", verdict: "PASS" }],
    }),
  ).toMatch(/INC-2 through INC-6/);
});

test("prior erlotinib qualifies the second-line trial and excludes the first-line trial", () => {
  const second = [{ criterionId: "INC-7", verdict: "PASS" }];
  const first = [
    { criterionId: "EXC-1", verdict: "PASS" },
    { criterionId: "INC-3", verdict: "FAIL" },
    { criterionId: "INC-5", verdict: "FAIL" },
  ];
  expect(
    erlotinibFlip({
      patientId: "PT-4410",
      selectedNct: "NCT06281964",
      selectedEliminated: true,
      selectedCells: first,
      otherNct: "NCT02496663",
      otherEliminated: false,
      otherCells: second,
    }),
  ).toBe(
    "Excluded here because she's had erlotinib; that same history is what qualifies her for the other trial. The stage wording on this protocol also does not match the chart (INC-3, INC-5).",
  );
  expect(
    erlotinibFlip({
      patientId: "PT-4410",
      selectedNct: "NCT02496663",
      selectedEliminated: false,
      selectedCells: second,
      otherNct: "NCT06281964",
      otherEliminated: true,
      otherCells: first,
    }),
  ).toMatch(/Qualified here because she's had erlotinib/);
});

test("a documented absence of those three drugs is the second-line no", () => {
  expect(
    storyNote({
      patientId: "PT-4411",
      nctId: "NCT02496663",
      eliminated: true,
      cells: [{ criterionId: "INC-7", verdict: "FAIL" }],
    }),
  ).toMatch(/INC-7 fails/);
});
