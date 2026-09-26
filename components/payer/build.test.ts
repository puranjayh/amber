import { existsSync } from "node:fs";
import { expect, test } from "vitest";
import { AS_OF, DEMO_POOL, loadClaims, loadFixtureTrials, loadPayerTrials } from "@/app/_data/inputs";
import { buildPayerView, icd9Code, mappedHcpcs, normalizeClaimsFact, normalizeClaimsPatient, tracePayerBuild } from "@/app/_data/payer";
import { CLAIMS_STUB } from "./stub";

const ROOT = process.cwd() + "/";
const fixtures = loadFixtureTrials(ROOT);

test("a drug fill settles first-line; an ILD claim settles the comorbidity trials", () => {
  const view = buildPayerView(CLAIMS_STUB, fixtures, AS_OF, null, "stub");
  expect(view.headline).toMatch(/rule patients out/);
  expect(view.settled.some((r) => r.kind === "drug fill" && r.patientId === "BENE-441201")).toBe(true);
  expect(view.settled.some((r) => r.kind === "comorbidity" && r.patientId === "BENE-441202")).toBe(true);
  expect(view.settled.every((r) => r.claimLine.length > 0)).toBe(true);
});

test("remaining criteria stay UNKNOWN and group by what a chart would need", () => {
  const view = buildPayerView(CLAIMS_STUB, fixtures, AS_OF, null, "stub");
  expect(view.needs.length).toBeGreaterThan(0);
  expect(view.needs.some((n) => n.predicate === "biomarker")).toBe(true);
  expect(view.needs.some((n) => n.predicate === "performance_status")).toBe(true);
  expect(view.needs.every((n) => n.patientIds.length > 0)).toBe(true);
});

test("ICD-9 162.x is NSCLC; 516.3 is ILD; pemetrexed is not an EGFR TKI", () => {
  expect(icd9Code("ICD-9 1623")).toBe("1623");
  expect(normalizeClaimsFact({
    predicate: "diagnosis",
    value: "ICD-9 1623",
    observedAt: "2010-04-13",
    sourceQuote: "1623",
    sourceDoc: "inpatient",
    provenance: "claims",
  }).value).toBe("non-small cell lung cancer");
  const ild = normalizeClaimsFact({
    predicate: "comorbidity",
    value: "ICD-9 5163",
    observedAt: "2010-04-13",
    sourceQuote: "5163",
    sourceDoc: "inpatient",
    provenance: "claims",
  });
  expect(ild.value).toBe("ICD-9 5163");
  expect(ild.sourceQuote).toBe("ICD-9 5163");
  const expanded = normalizeClaimsPatient({
    id: "CMS-S1-TEST",
    age: 70,
    sex: "F",
    race: "White",
    ethnicity: "Not Hispanic or Latino",
    zip: "01",
    travelMinutes: 0,
    facts: [{
      predicate: "prior_therapy",
      value: "cisplatin",
      drugClass: "PLATINUM",
      observedAt: "2009-05-04",
      sourceQuote: "J9060",
      sourceDoc: "outpatient",
      provenance: "claims",
    }],
  });
  expect(expanded.facts.map((f) => f.value)).toEqual(["cisplatin", "chemotherapy"]);
  const chemo = normalizeClaimsFact({
    predicate: "prior_therapy",
    value: "pemetrexed",
    drugClass: "ANTIFOLATE",
    observedAt: "2009-04-28",
    sourceQuote: "J9305",
    sourceDoc: "carrier",
    provenance: "claims",
  });
  expect(chemo.value).toBe("pemetrexed");
  expect(mappedHcpcs("cisplatin", "...J9060,A9270,88331...")).toBe("J9060");
  expect(mappedHcpcs("pemetrexed", "...J1200,J9305...")).toBe("J9305");
  expect(mappedHcpcs("pemetrexed", "...J1200,A9270...")).toBe(null);
  expect(
    normalizeClaimsFact({
      predicate: "prior_therapy",
      value: "cisplatin",
      drugClass: "PLATINUM",
      observedAt: "2009-05-04",
      sourceQuote: "03F1CD46CBCD1C57,542122280981707,1,20090504,J9060,",
      sourceDoc: "outpatient",
      provenance: "claims",
    }).sourceQuote,
  ).toBe("cisplatin · HCPCS J9060");
});

test("real DE-SynPUF extract: un-normalized ICD-9 162.x fails every diagnosis leaf", () => {
  if (!existsSync(`${ROOT}data/claims/patients.json`)) return;
  const claims = loadClaims(ROOT);
  expect(claims?.patients.length).toBe(1296);
  const raw = tracePayerBuild(claims!.patients, fixtures, AS_OF, { normalize: false });
  expect(raw.counts.diagnosisFail).toBe(raw.counts.pairs);
  expect(raw.counts.settled).toBe(0);
  expect(raw.counts.needs).toBe(0);
  expect(raw.samples[0]?.patientId).toMatch(/0085B4F55FFA358D/);
});

test("real DE-SynPUF extract × 133 protocols: drug fills settle, not just ILD", () => {
  if (!existsSync(`${ROOT}data/claims/patients.json`)) return;
  if (!existsSync(`${ROOT}data/compiled/trials.json`)) return;
  const claims = loadClaims(ROOT);
  const protocols = loadPayerTrials(ROOT);
  expect(protocols).toHaveLength(DEMO_POOL);
  expect(protocols.every((t) => !/^NCT07001\d+$/.test(t.nctId))).toBe(true);
  const view = buildPayerView(claims!.patients, protocols, AS_OF, null, "data/claims/patients.json");
  const settledPeople = new Set(view.settled.map((row) => row.patientId));
  const fills = view.settled.filter((row) => row.kind === "drug fill");
  const fillPeople = new Set(fills.map((row) => row.patientId));
  expect(view.beneficiaries).toBe(1296);
  expect(view.protocols).toBe(DEMO_POOL);
  expect(settledPeople.size).toBe(98);
  expect(view.settled.length).toBe(112);
  expect(fills.length).toBe(112);
  expect(fillPeople.size).toBe(98);
  expect(view.settled.some((row) => /carboplatin · HCPCS J9045/.test(row.claimLine))).toBe(true);
  expect(view.settled.some((row) => /docetaxel · HCPCS J9171/.test(row.claimLine))).toBe(true);
  expect(view.settled.every((row) => /^CMS-S1-/.test(row.patientId))).toBe(true);
  expect(view.settled.every((row) => !/^NCT07001\d+$/.test(row.nctId))).toBe(true);
});
