import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { CriterionLeaf, PairResult, Patient } from "@/src/contracts";
import { HcpView } from "./HcpView";
import {
  blockerPhrase,
  clinicBucket,
  clinicFocus,
  describeClinic,
  diagnosisLine,
  displayName,
  visitLine,
} from "./clinic";

const AS_OF = "2026-09-25";

function patient(over: Partial<Patient> & Pick<Patient, "id">): Patient {
  return {
    age: 64,
    sex: "F",
    race: "Asian",
    facts: [],
    ...over,
  };
}

function leaf(over: Partial<CriterionLeaf> & Pick<CriterionLeaf, "id" | "predicate">): CriterionLeaf {
  return {
    kind: "leaf",
    type: "inclusion",
    operator: "==",
    value: true,
    tier: 0,
    sourceSpan: over.id,
    sweepable: false,
    ...over,
  };
}

test("chart codes become a name and an age, and no two codes share one", () => {
  expect(displayName({ id: "SEED-01", age: 66 })).toBe("S. Adler, 66");
  expect(displayName({ id: "SEED-01", age: 66 })).not.toContain("SEED");
  expect(displayName({ id: "LC-A-001", age: 59 })).toBe("A. Chen, 59");
  expect(displayName({ id: "LC-A-001", age: 59 })).not.toBe(displayName({ id: "LC-A-007", age: 65 }));
  expect(displayName({ id: "PT-4410", age: 64 })).toBe("PT-4410, 64");
  const ids = [
    ...Array.from({ length: 90 }, (_, i) => `LC-A-${String(i + 1).padStart(3, "0")}`),
    ...Array.from({ length: 90 }, (_, i) => `LC-C-${String(i + 1).padStart(3, "0")}`),
    ...Array.from({ length: 46 }, (_, i) => `SEED-${String(i + 1).padStart(2, "0")}`),
  ];
  const names = ids.map((id) => displayName({ id, age: 60 }));
  expect(new Set(names).size).toBe(names.length);
});

test("diagnosis comes from the staging sentence on the chart", () => {
  const line = diagnosisLine({
    facts: [
      {
        predicate: "staging",
        value: "stage IV or recurrent/metastatic histologically confirmed non-small cell lung cancer (NSCLC)",
        observedAt: "2026-08-20",
      },
    ],
  });
  expect(line).toBe("NSCLC, stage IV");
});

test("a chart with no cancer fact does not invent one", () => {
  expect(diagnosisLine({ facts: [] })).toBe("Diagnosis not in the chart");
});

test("next visit is absent unless the chart has one", () => {
  const line = visitLine(
    {
      facts: [
        {
          sourceDoc: "synthetic oncology note 2026-09-10",
          sourceQuote: "Synthetic chart. Oncology note.",
          observedAt: "2026-09-10",
        },
        {
          sourceDoc: "synthetic CBC 2026-09-18",
          sourceQuote: "ANC 2400.",
          observedAt: "2026-09-18",
        },
      ],
    },
    AS_OF,
  );
  expect(line).toBe("Last seen 10 Sep 2026. Next visit not on the chart.");
  expect(line).not.toMatch(/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/);
});

test("EGFR never tested, and a stale ECOG asks for a current one", () => {
  const egfr = leaf({
    id: "INC-2",
    predicate: "biomarker",
    analyte: "EGFR",
    value: "EGFR mutation",
  });
  const ecog = leaf({
    id: "INC-9",
    predicate: "performance_status",
    analyte: "ECOG",
    operator: "<=",
    value: 1,
    sourceSpan: "ECOG performance status ≤ 1",
  });
  expect(blockerPhrase(egfr, "absent", patient({ id: "PT" }), false)).toBe("EGFR never tested");
  const exon = leaf({
    id: "INC-3",
    predicate: "biomarker",
    value: "Exon 19 deletion",
    sourceSpan: "NSCLC must harbor at least one of the following EGFR activating mutations: Exon 19 deletion",
  });
  expect(blockerPhrase(exon, "absent", patient({ id: "PT" }), false)).toBe("EGFR never tested");
  expect(blockerPhrase(ecog, "stale", patient({ id: "PT" }), false)).toBe("Needs a current ECOG");
});

test("clinic buckets follow what the physician would do", () => {
  expect(clinicBucket({ eliminated: false, unknownCount: 2, predicate: "biomarker", reason: "absent" })).toBe("order");
  expect(clinicBucket({ eliminated: false, unknownCount: 1, predicate: "washout", reason: "absent" })).toBe("waiting");
  expect(clinicBucket({ eliminated: false, unknownCount: 1, predicate: "lab_value", reason: "unsupported" })).toBe(
    "waiting",
  );
  expect(clinicBucket({ eliminated: false, unknownCount: 0 })).toBe("discuss");
  expect(clinicBucket({ eliminated: true, unknownCount: 0 })).toBe("ruled-out");
});

test("an orderable gap leads even when a washout is also open", () => {
  const egfr = leaf({ id: "INC-2", predicate: "biomarker", analyte: "EGFR", value: "EGFR", tier: 0 });
  const wash = leaf({ id: "EXC-1", predicate: "washout", type: "exclusion", tier: 4 });
  const trial = {
    nctId: "NCT02496663",
    title: "Osimertinib and Necitumumab",
    phase: "PHASE2",
    condition: "NSCLC",
    slots: 1,
    criteria: [egfr, wash],
    compilerConfidence: 1,
    needsHumanReview: false,
  };
  const pair: PairResult = {
    patientId: "PT-4410",
    nctId: "NCT02496663",
    eliminated: false,
    passCount: 0,
    failCount: 0,
    unknownCount: 2,
    resolutionCost: 1,
    expectedValue: 0,
    cells: [
      {
        patientId: "PT-4410",
        nctId: "NCT02496663",
        criterionId: "EXC-1",
        verdict: "UNKNOWN",
        reason: "absent",
        criterionCitation: "washout",
        tier: 4,
      },
      {
        patientId: "PT-4410",
        nctId: "NCT02496663",
        criterionId: "INC-2",
        verdict: "UNKNOWN",
        reason: "absent",
        criterionCitation: "EGFR",
        tier: 0,
      },
    ],
  };
  expect(clinicFocus(pair, trial)?.leaf.id).toBe("INC-2");
  const card = describeClinic({
    patient: patient({
      id: "PT-4410",
      facts: [
        {
          predicate: "staging",
          value: "stage IV or recurrent/metastatic histologically confirmed non-small cell lung cancer (NSCLC)",
          observedAt: "2026-08-20",
          sourceQuote: "stage IV NSCLC",
          sourceDoc: "synthetic PET-CT 2026-08-20",
        },
      ],
    }),
    nctId: "NCT02496663",
    trialTitle: trial.title,
    eliminated: false,
    unknownCount: 2,
    leaf: egfr,
    reason: "absent",
    orderTitle: "EGFR mutation testing on archived tissue",
    asOf: AS_OF,
  });
  expect(card.name).toBe("PT-4410, 64");
  expect(card.picture).toBe("NSCLC, stage IV");
  expect(card.trialName).toBe("Osimertinib and Necitumumab");
  expect(card.trialName).not.toContain("NCT");
  expect(card.blocker).toBe("EGFR never tested");
  expect(card.resolve).toBe("Order: EGFR mutation testing on archived tissue");
  expect(card.bucket).toBe("order");
});

test("the worklist row does not label the patient by race", () => {
  const markup = renderToStaticMarkup(
    createElement(HcpView, {
      rows: [
        {
          patientId: "SEED-01",
          nctId: "NCT02496663",
          name: "A. Chen, 66",
          picture: "NSCLC, stage IV",
          trialName: "Osimertinib and Necitumumab",
          blocker: "Washout not dated",
          resolve: "No order — wait out the washout",
          visit: "Last seen 10 Sep 2026. Next visit not on the chart.",
          bucket: "waiting",
          draft: null,
        },
      ],
      headline: "Black patients are 4% of your panel and 0% of the patients these criteria admit.",
      panelShare: { Black: 0.04, Asian: 0.76 },
      admittedShare: { Black: 0, Asian: 0.87 },
      physicianId: "hcp-rahman",
    }),
  );
  expect(markup).toContain("Waiting on a result");
  expect(markup).toContain("A. Chen, 66");
  expect(markup).toContain("Washout not dated");
  expect(markup).toContain("Osimertinib and Necitumumab");
  expect(markup).toContain("trial=NCT02496663");
  expect(markup).toContain("Black patients are 4%");
  expect(markup).not.toContain(">SEED-01<");
  expect(markup).not.toContain("White");
  expect(markup).not.toContain(">NCT02496663<");
});
