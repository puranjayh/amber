import { expect, test } from "vitest";
import { notesPdf } from "./notesPdf";

test("a visit note is a branded multi-page PDF", () => {
  const bytes = notesPdf([
    {
      name: "Leila Ferreira",
      code: "PT-4410",
      kicker: "Visit note",
      body: "I have a clinical trial that may be a fit for you.\n\nWhy you, specifically\nYour cancer type matches what this study is for.\nFrom your chart: \"NGS 1 August 2026.\"",
    },
    {
      name: "Malik Elbaz",
      code: "PT-4421",
      kicker: "Patient document",
      body: `${"What still needs checking\nThere is no result for an EGFR gene test in the chart.\n\n".repeat(40)}What happens next\nTalk with your doctor.`,
    },
  ]);
  const text = new TextDecoder().decode(bytes);
  expect(text.startsWith("%PDF-1.4")).toBe(true);
  expect(text).toContain("%%EOF");
  expect(text).toContain("startxref");
  expect(text).toContain("AMBER");
  expect(text).toContain("Leila Ferreira");
  expect(text).toContain("PT-4410");
  expect(text).toContain("Visit note");
  expect(text).toContain("Patient document");
  expect(text).toContain("Helvetica-Bold");
  expect(text).toMatch(/\/Count [2-9]/);
});
