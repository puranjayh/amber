/**
 * Offline CMS DE-SynPUF Sample 1 ingestion.
 *
 * This intentionally treats claims as narrow evidence: it preserves the raw claim
 * line for every emitted fact and never infers an unobserved measurement (notably,
 * lab values).  The input archives are deliberately outside git in data/claims/raw.
 */
import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { Patient } from "@/src/contracts";
import type { Fact, Patient as PatientRecord } from "@/src/contracts";

export const CLAIMS_AS_OF = "2010-12-31";
export const BENEFICIARY_SOURCE = "CMS DE-SynPUF Sample 1 Beneficiary Summary";
export const INPATIENT_SOURCE = "CMS DE-SynPUF Sample 1 Inpatient Claims";
export const PDE_SOURCE = "CMS DE-SynPUF Sample 1 Prescription Drug Events";

export interface IngestionPaths {
  beneficiarySummaryPaths: string[];
  inpatientClaimsPath: string;
  prescriptionDrugEventsPath: string;
  patientsOutputPath: string;
  cohortOutputPath: string;
}

export const defaultIngestionPaths = (): IngestionPaths => ({
  beneficiarySummaryPaths: [
    "data/claims/raw/DE1_0_2008_Beneficiary_Summary_File_Sample_1.csv",
    "data/claims/raw/DE1_0_2009_Beneficiary_Summary_File_Sample_1.csv",
  ],
  inpatientClaimsPath: "data/claims/raw/DE1_0_2008_to_2010_Inpatient_Claims_Sample_1.csv",
  prescriptionDrugEventsPath: "data/claims/raw/DE1_0_2008_to_2010_Prescription_Drug_Events_Sample_1.csv",
  patientsOutputPath: "data/claims/patients.json",
  cohortOutputPath: "data/claims/COHORT.md",
});

type CsvRow = Record<string, string>;

export interface ClaimsPatientBuild {
  patients: PatientRecord[];
  cohortIds: Set<string>;
  lungCancerClaimCount: number;
  mappedPdeFacts: number;
  unresolvedPdeRows: number;
}

/** Minimal RFC-4180 parser; DE-SynPUF rows are comma-delimited but headers are quoted. */
export function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value);
  return values;
}

async function eachCsvRow(path: string, visit: (row: CsvRow, rawLine: string) => void): Promise<void> {
  const input = createInterface({ input: createReadStream(resolve(path), { encoding: "utf8" }), crlfDelay: Infinity });
  let headings: string[] | undefined;
  for await (const line of input) {
    if (!headings) {
      headings = parseCsvLine(line).map((heading) => heading.trim());
      continue;
    }
    if (!line) continue;
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headings.map((heading, index) => [heading, values[index] ?? ""]));
    visit(row, line);
  }
}

function isoDate(value: string): string | undefined {
  const digits = value.replace(/\D/g, "");
  if (!/^\d{8}$/.test(digits)) return undefined;
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

export function ageOn(birthDate: string, asOf = CLAIMS_AS_OF): number | undefined {
  const birth = isoDate(birthDate);
  if (!birth) return undefined;
  const [birthYear, birthMonth, birthDay] = birth.split("-").map(Number);
  const [asOfYear, asOfMonth, asOfDay] = asOf.split("-").map(Number);
  return asOfYear - birthYear - (asOfMonth < birthMonth || (asOfMonth === birthMonth && asOfDay < birthDay) ? 1 : 0);
}

export function isLungCancerIcd9(code: string): boolean {
  return /^162(?:\d|$)/.test(code.trim().replace(".", ""));
}

function normalizedIcd9(code: string): string | undefined {
  const digits = code.trim().toUpperCase().replace(".", "");
  return /^[EV]?\d{3,5}$/.test(digits) ? digits : undefined;
}

function claimDate(row: CsvRow): string {
  return isoDate(row.CLM_ADMSN_DT) ?? isoDate(row.CLM_FROM_DT) ?? isoDate(row.SRVC_DT) ?? CLAIMS_AS_OF;
}

function sex(value: string): PatientRecord["sex"] {
  return value === "1" ? "M" : value === "2" ? "F" : "unknown";
}

function race(value: string): string {
  return ({ "1": "White", "2": "Black", "3": "Other", "4": "Asian", "5": "Hispanic" } as Record<string, string>)[value] ?? "Unknown";
}

/** A transparent geography-only proxy, not a measured travel time. */
export function travelMinutesProxy(stateCode: string, countyCode: string): number | undefined {
  const state = Number(stateCode);
  const county = Number(countyCode);
  if (!Number.isInteger(state) || !Number.isInteger(county)) return undefined;
  return 20 + (state % 8) * 5 + (county % 7) * 5;
}

function claimsFact(fact: Omit<Fact, "provenance">): Fact {
  return { ...fact, provenance: "claims" };
}

/**
 * The only NDC classes we emit are exact, independently curated mappings.  Unknown
 * synthetic NDCs are deliberately omitted rather than guessed as cancer therapy.
 */
export const ONCOLOGY_NDC_CLASSES: Record<string, { drug: string; drugClass: string }> = {
  "00078062815": { drug: "gefitinib", drugClass: "EGFR_TKI" },
  "50242006401": { drug: "erlotinib", drugClass: "EGFR_TKI" },
  "00078069415": { drug: "osimertinib", drugClass: "EGFR_TKI" },
  "63323010202": { drug: "carboplatin", drugClass: "PLATINUM" },
  "07030030501": { drug: "cisplatin", drugClass: "PLATINUM" },
};

function patientId(desynpufId: string): string {
  return `CMS-S1-${desynpufId}`;
}

function diagnosisColumns(row: CsvRow): string[] {
  return [row.ADMTNG_ICD9_DGNS_CD, ...Array.from({ length: 10 }, (_, index) => row[`ICD9_DGNS_CD_${index + 1}`])]
    .map((code) => normalizedIcd9(code ?? ""))
    .filter((code): code is string => Boolean(code));
}

function reportDistribution(items: PatientRecord[], key: (patient: PatientRecord) => string): string {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, count]) => `| ${label} | ${count} | ${(count / items.length * 100).toFixed(1)}% |`)
    .join("\n");
}

export function renderCohortReport(build: ClaimsPatientBuild): string {
  const platinum = build.patients.filter((patient) => patient.facts.some((fact) => fact.drugClass === "PLATINUM")).length;
  const tki = build.patients.filter((patient) => patient.facts.some((fact) => fact.drugClass === "EGFR_TKI")).length;
  return `# DE-SynPUF Sample 1 lung-cancer cohort

Generated from CMS 2008–2010 Data Entrepreneurs' Synthetic Public Use File (DE-SynPUF), Sample 1. The cohort includes beneficiaries with at least one inpatient claim carrying an ICD-9 162.x diagnosis code. Raw downloads are intentionally excluded from git.

## Cohort

- Beneficiaries: ${build.patients.length}
- Lung-cancer inpatient claims: ${build.lungCancerClaimCount}
- Beneficiaries with a mapped platinum fill: ${platinum}
- Beneficiaries with a mapped EGFR-TKI fill: ${tki}
- PDE rows in cohort without an exact oncology NDC mapping: ${build.unresolvedPdeRows}

Only exact NDC-to-drug mappings are emitted as prior-therapy facts. An unresolved synthetic NDC is not silently treated as an anticancer treatment.

## Race distribution

| Race | Beneficiaries | Share |
| --- | ---: | ---: |
${reportDistribution(build.patients, (patient) => patient.race)}

## State distribution

State codes are the original DE-SynPUF beneficiary summary values, retained as geography rather than patient addresses.

| State code | Beneficiaries | Share |
| --- | ---: | ---: |
${reportDistribution(build.patients, (patient) => patient.zip?.slice(0, 2) ?? "Unknown")}

## What claims structurally cannot tell us

- **No lab values:** this ingest creates no laboratory facts. Claims cannot establish ANC, creatinine clearance, bilirubin, QTc, biomarker status, or a negative test result.
- **Clinical detail is incomplete:** a diagnosis or fill records billing evidence, not staging, ECOG status, disease progression, treatment intent, response, or protocol-specific eligibility.
- **Travel is only a proxy:** travelMinutes is a transparent function of state and county codes, not observed driving time, address, or site selection.
- **Synthetic and historical:** DE-SynPUF covers 2008–2010, uses ICD-9 rather than ICD-10, and CMS deliberately reduced longitudinal coherence during synthesis. It is a safe demonstration corpus, not a clinical population estimate.
- **Sample integrity over coverage:** the current CMS 2010 beneficiary-summary link resolves to Sample 20. This Sample 1 ingest therefore uses the available 2008–09 Sample 1 beneficiary summaries with the 2008–10 Sample 1 inpatient and PDE files; it does not mix in Sample 20 records.
`;
}

export async function ingestClaims(paths: Partial<IngestionPaths> = {}): Promise<ClaimsPatientBuild> {
  const config = { ...defaultIngestionPaths(), ...paths };
  const cohortIds = new Set<string>();
  const inpatientFacts = new Map<string, Fact[]>();
  let lungCancerClaimCount = 0;

  await eachCsvRow(config.inpatientClaimsPath, (row, rawLine) => {
    const codes = diagnosisColumns(row);
    if (!codes.some(isLungCancerIcd9)) return;
    lungCancerClaimCount += 1;
    const id = row.DESYNPUF_ID;
    if (!id) return;
    cohortIds.add(id);
    const facts = inpatientFacts.get(id) ?? [];
    for (const code of codes) {
      facts.push(claimsFact({
        predicate: isLungCancerIcd9(code) ? "diagnosis" : "comorbidity",
        value: `ICD-9 ${code}`,
        observedAt: claimDate(row),
        sourceQuote: rawLine,
        sourceDoc: INPATIENT_SOURCE,
      }));
    }
    inpatientFacts.set(id, facts);
  });

  const demographics = new Map<string, { row: CsvRow; rawLine: string; year: number }>();
  for (const summaryPath of config.beneficiarySummaryPaths) {
    await eachCsvRow(summaryPath, (row, rawLine) => {
      if (!cohortIds.has(row.DESYNPUF_ID)) return;
      const yearMatch = /20\d{2}/.exec(summaryPath);
      const year = yearMatch ? Number(yearMatch[0]) : 0;
      const prior = demographics.get(row.DESYNPUF_ID);
      if (!prior || year >= prior.year) demographics.set(row.DESYNPUF_ID, { row, rawLine, year });
    });
  }

  const pdeFacts = new Map<string, Fact[]>();
  let mappedPdeFacts = 0;
  let unresolvedPdeRows = 0;
  await eachCsvRow(config.prescriptionDrugEventsPath, (row, rawLine) => {
    if (!cohortIds.has(row.DESYNPUF_ID)) return;
    const resolved = ONCOLOGY_NDC_CLASSES[row.PROD_SRVC_ID];
    if (!resolved) {
      unresolvedPdeRows += 1;
      return;
    }
    const facts = pdeFacts.get(row.DESYNPUF_ID) ?? [];
    facts.push(claimsFact({
      predicate: "prior_therapy",
      value: resolved.drug,
      drugClass: resolved.drugClass,
      observedAt: claimDate(row),
      sourceQuote: rawLine,
      sourceDoc: PDE_SOURCE,
    }));
    pdeFacts.set(row.DESYNPUF_ID, facts);
    mappedPdeFacts += 1;
  });

  const patients = [...cohortIds].sort().flatMap((id): PatientRecord[] => {
    const demographic = demographics.get(id);
    if (!demographic) return [];
    const age = ageOn(demographic.row.BENE_BIRTH_DT);
    if (age === undefined) return [];
    const observationDate = `${demographic.year || 2010}-12-31`;
    const facts = [
      claimsFact({
        predicate: "age",
        value: age,
        observedAt: observationDate,
        sourceQuote: demographic.rawLine,
        sourceDoc: BENEFICIARY_SOURCE,
      }),
      ...(inpatientFacts.get(id) ?? []),
      ...(pdeFacts.get(id) ?? []),
    ];
    return [{
      id: patientId(id),
      age,
      sex: sex(demographic.row.BENE_SEX_IDENT_CD),
      race: race(demographic.row.BENE_RACE_CD),
      // DE-SynPUF does not supply ethnicity in this file; absence is intentional.
      zip: demographic.row.SP_STATE_CODE || undefined,
      travelMinutes: travelMinutesProxy(demographic.row.SP_STATE_CODE, demographic.row.BENE_COUNTY_CD),
      facts,
    }];
  });
  const parsedPatients = Patient.array().parse(patients);
  const build = { patients: parsedPatients, cohortIds, lungCancerClaimCount, mappedPdeFacts, unresolvedPdeRows };
  await mkdir(dirname(resolve(config.patientsOutputPath)), { recursive: true });
  await writeFile(resolve(config.patientsOutputPath), `${JSON.stringify(parsedPatients, null, 2)}\n`, "utf8");
  await mkdir(dirname(resolve(config.cohortOutputPath)), { recursive: true });
  await writeFile(resolve(config.cohortOutputPath), renderCohortReport(build), "utf8");
  return build;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  void ingestClaims().then((build) => {
    console.log(`Wrote ${build.patients.length} claims-derived patients; ${build.mappedPdeFacts} exact PDE drug-class mappings.`);
  });
}
