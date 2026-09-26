import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { CriterionLeaf, PairResult, Patient, Trial } from "@/src/contracts";
import { protocolSource } from "@/app/_data/protocolText";
import { getPair, getPatient, getTrial } from "@/app/_data/source";
import { PatientLetter } from "./PatientLetter";
import { buildLetter, protocolBrief } from "./letter";

function heroLetter(protocolText?: string) {
  const patient = getPatient("PT-4410");
  const trial = getTrial("NCT02496663");
  const pair = getPair("PT-4410", "NCT02496663");
  if (!patient || !trial || !pair) throw new Error("hero pair missing");
  return buildLetter({
    patient,
    trial,
    pair,
    physicianName: "Aisha Rahman, MD",
    physicianTalk: "Dr Rahman",
    physicianSite: "Community oncology",
    asOf: "2026-09-25",
    protocolText,
    travelMinutes: patient.travelMinutes ?? null,
    travelFrom: "record",
  });
}

test("protocol brief ignores eligibility wording that is not pay, purpose, or schedule", () => {
  const brief = protocolBrief(
    "Unstable or uncompensated heart failure. Objective progression as determined by radiographic progression. Inability to travel. contraception for the duration of study participation, and for 3 months.",
  );
  expect(brief.objective).toBeUndefined();
  expect(brief.costs).toBeUndefined();
  expect(brief.travelCovered).toBeUndefined();
  expect(brief.duration).toBeUndefined();
  expect(brief.visits).toBeUndefined();
});

test("protocol brief quotes a purpose, a duration, visits, and reimbursement when the text states them", () => {
  const brief = protocolBrief(
    "The purpose of this study is to learn whether the combination shrinks tumors. The study lasts 12 months. 8 clinic visits. Travel costs will be reimbursed.",
  );
  expect(brief.objective).toMatch(/purpose of this study/i);
  expect(brief.duration).toMatch(/12 months/);
  expect(brief.visits).toMatch(/8 clinic visits/);
  expect(brief.travelCovered).toMatch(/reimburse/i);
});

test("the osimertinib eligibility text does not state objectives or pay", () => {
  const text = protocolSource("NCT02496663");
  expect(text && text.length).toBeGreaterThan(100);
  const brief = protocolBrief(text);
  expect(brief.objective).toBeUndefined();
  expect(brief.costs).toBeUndefined();
  expect(brief.travelCovered).toBeUndefined();
  expect(brief.duration).toBeUndefined();
  expect(brief.visits).toBeUndefined();
});

test("hero letter cites the chart for each match and does not invent a protocol schedule", () => {
  const letter = heroLetter(protocolSource("NCT02496663"));
  expect(letter.eliminated).toBe(false);
  expect(letter.scoreLine).toMatch(/Compatibility: \d+ of \d+ checks/);
  expect(letter.reasons.some((row) => row.sentence === "Your cancer type matches what this study is for.")).toBe(true);
  expect(letter.reasons.some((row) => row.sentence.includes("kidney function is in the range"))).toBe(true);
  expect(letter.reasons.some((row) => /targeted drug for the EGFR gene/.test(row.sentence))).toBe(true);
  for (const row of letter.reasons) {
    expect(row.quote).toBeTruthy();
    expect(row.sourceLabel.startsWith("From your chart")).toBe(true);
    if (row.sentence.includes("ECOG")) expect(row.sentence).toMatch(/daily activities/);
    if (/exon 19 deletion/i.test(row.sentence)) expect(row.sentence).toMatch(/EGFR gene/);
  }
  expect(letter.questions.some((group) => /EGFR gene test/.test(group.items.map((item) => item.gap).join(" ")))).toBe(
    true,
  );
  expect(letter.questions.some((group) => group.check.includes("waiting"))).toBe(true);
  expect(letter.questions.find((group) => group.check.includes("waiting"))?.items).toHaveLength(1);
  expect(letter.questions.some((group) => group.check.includes("One blood test"))).toBe(false);
  expect(letter.reasons.filter((row) => row.sentence.includes("another illness"))).toHaveLength(1);
  expect(letter.scoreLine).toMatch(/listed once/);
  expect(letter.objective).toMatch(/^Not stated/);
  expect(letter.visits).toBe("Not stated.");
  expect(letter.duration).toBe("Not stated.");
  expect(letter.costs).toBe("Not stated.");
  expect(letter.travelCovered).toBe("Not stated.");
  expect(letter.travel).toBe("From your record, the trip is about 25 minutes.");
  expect(letter.blockers).toEqual([]);
});

test("a claims fact is labeled claims, not chart", () => {
  const patient = getPatient("PT-4410");
  const trial = getTrial("NCT02496663");
  const pair = getPair("PT-4410", "NCT02496663");
  if (!patient || !trial || !pair) throw new Error("hero pair missing");
  const kidney = heroLetter().reasons.find((row) => row.sentence.includes("kidney function"));
  expect(kidney?.quote).toBeTruthy();
  const cloned = {
    ...patient,
    facts: patient.facts.map((fact) =>
      fact.sourceQuote === kidney?.quote ? { ...fact, provenance: "claims" as const } : fact,
    ),
  };
  const letter = buildLetter({
    patient: cloned,
    trial,
    pair,
    physicianName: "Aisha Rahman, MD",
    physicianTalk: "Dr Rahman",
    physicianSite: "Community oncology",
    asOf: "2026-09-25",
    travelMinutes: 25,
    travelFrom: "record",
  });
  const labeled = letter.reasons.find((row) => row.sentence.includes("kidney function"));
  expect(labeled?.sourceLabel).toBe("From insurance claims");
});

test("an eliminated patient is not written up as a match", () => {
  const patient = getPatient("PT-4411");
  const trial = getTrial("NCT02496663");
  const pair = getPair("PT-4411", "NCT02496663");
  if (!patient || !trial || !pair) throw new Error("exclusion pair missing");
  const letter = buildLetter({
    patient,
    trial,
    pair,
    physicianName: "Aisha Rahman, MD",
    physicianTalk: "Dr Rahman",
    physicianSite: "Community oncology",
    asOf: "2026-09-25",
    travelMinutes: 40,
    travelFrom: "record",
  });
  expect(letter.eliminated).toBe(true);
  expect(letter.scoreLine).toMatch(/not a match/);
  expect(letter.blockers.some((row) => /have not had a targeted drug/.test(row.sentence))).toBe(true);
  expect(letter.blockers.every((row) => row.quote && row.sourceLabel.startsWith("From"))).toBe(true);
});

test("a missing blood count says one blood test would confirm the fit", () => {
  const leaf: CriterionLeaf = {
    kind: "leaf",
    id: "INC-10",
    type: "inclusion",
    predicate: "lab_value",
    operator: ">=",
    value: 1500,
    unit: "/mcL",
    analyte: "Absolute neutrophil count",
    tier: 1,
    sweepable: true,
    sourceSpan: "Absolute neutrophil count at least 1500/mcL.",
  };
  const patient: Patient = { id: "PT-TEST", age: 60, sex: "F", race: "Asian", facts: [] };
  const trial: Trial = {
    nctId: "NCT02496663",
    title: "A study",
    phase: "PHASE1",
    condition: "NSCLC",
    slots: 1,
    criteria: [leaf],
    compilerConfidence: 1,
    needsHumanReview: false,
  };
  const pair: PairResult = {
    patientId: patient.id,
    nctId: trial.nctId,
    eliminated: false,
    passCount: 0,
    failCount: 0,
    unknownCount: 1,
    resolutionCost: 1,
    expectedValue: 0,
    cells: [
      {
        patientId: patient.id,
        nctId: trial.nctId,
        criterionId: leaf.id,
        verdict: "UNKNOWN",
        reason: "absent",
        criterionCitation: leaf.sourceSpan,
        tier: 1,
      },
    ],
  };
  const letter = buildLetter({
    patient,
    trial,
    pair,
    physicianName: "Aisha Rahman, MD",
    physicianTalk: "Dr Rahman",
    physicianSite: "Community oncology",
    asOf: "2026-09-25",
    travelMinutes: null,
    travelFrom: "none",
  });
  expect(letter.questions[0]?.check).toBe("One blood test would confirm whether this trial fits.");
  expect(letter.questions[0]?.items[0]?.gap).toMatch(/infection-fighting white blood cell count/);
  expect(letter.travel).toBe("Travel time is not in your record.");
});

test("the page is a take-home note and has no enrolment control", () => {
  const markup = renderToStaticMarkup(createElement(PatientLetter, { letter: heroLetter() }));
  expect(markup).toContain("Why you, specifically");
  expect(markup).toContain("What still needs checking");
  expect(markup).toContain("What the trial is trying to find out");
  expect(markup).toContain("What it would involve");
  expect(markup).toContain("What happens next");
  expect(markup).toContain("Aisha Rahman, MD");
  expect(markup).toContain("does not sign you up");
  expect(markup).toContain("does not enrol you");
  expect(markup).toContain("The choice is yours");
  expect(markup).not.toMatch(/<button/i);
});
