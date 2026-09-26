import type { CriterionLeaf, Fact, PairResult, Patient, Reason, Trial } from "@/src/contracts";
import { blockingUnknown } from "@/components/alert/alert";
import { ANCHORS } from "@/components/console/anchors";
import { collectLeaves } from "@/components/criteria/rows";
import { displayTone } from "@/components/criteria/tone";

/** Clinic-day buckets. Rank stays in the engine; a physician works in these. */
export type ClinicBucket = "order" | "waiting" | "discuss" | "ruled-out";

export const CLINIC_BUCKETS: { id: ClinicBucket; label: string }[] = [
  { id: "order", label: "Needs something ordered" },
  { id: "waiting", label: "Waiting on a result" },
  { id: "discuss", label: "Ready to discuss" },
  { id: "ruled-out", label: "Ruled out" },
];

export type ClinicCard = {
  name: string;
  picture: string;
  trialName: string;
  blocker: string;
  resolve: string;
  visit: string;
  bucket: ClinicBucket;
};

/**
 * Chart codes are not names. Each SEED / LC id maps to one pseudonym.
 * Story ids (PT-4410) stay, so the demo patient is still findable.
 */
const GIVEN = ["A.", "B.", "C.", "D.", "E.", "F.", "G.", "H.", "I.", "J.", "K.", "L.", "M.", "N.", "O.", "P.", "Q.", "R.", "S.", "T.", "U.", "V.", "W.", "X.", "Y.", "Z."];
const FAMILY = ["Chen", "Patel", "Nguyen", "Kim", "Singh", "Garcia", "Brooks", "Adler", "Shah", "Morales"];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function displayName(patient: { id: string; age: number }): string {
  const alias = cohortName(patient.id);
  if (alias) return `${alias}, ${patient.age}`;
  const id = patient.id.length > 18 ? `${patient.id.slice(0, 16)}…` : patient.id;
  return `${id}, ${patient.age}`;
}

/** Chart codes (SEED-01, LC-A-001) are not names. Story ids (PT-4410) stay. */
function cohortName(id: string): string | undefined {
  const n = cohortSlot(id);
  if (n === undefined) return undefined;
  const family = FAMILY[Math.floor(n / GIVEN.length)];
  const given = GIVEN[n % GIVEN.length];
  return family && given ? `${given} ${family}` : undefined;
}

function cohortSlot(id: string): number | undefined {
  const seed = /^SEED-(\d+)$/.exec(id);
  if (seed) return 200 + Number(seed[1]) - 1;
  const lc = /^LC-([AC])-(\d+)$/.exec(id);
  if (lc) return (lc[1] === "A" ? 0 : 100) + Number(lc[2]) - 1;
  return undefined;
}

export function trialWords(nctId: string, title: string | undefined): string {
  const anchor = ANCHORS.find((row) => row.nctId === nctId);
  if (anchor) return anchor.short;
  const cleaned = (title ?? "").replace(/\s+/g, " ").trim();
  return cleaned || nctId;
}

export function diagnosisLine(patient: { facts: Pick<Fact, "predicate" | "value" | "observedAt">[] }): string {
  const staging = newest(patient.facts, "staging");
  const diagnosis = newest(patient.facts, "diagnosis");
  const stageRaw = staging ? String(staging.value) : "";
  const dxRaw = diagnosis ? String(diagnosis.value) : "";
  const cancer = cancerName(dxRaw) || cancerName(stageRaw);
  const stage = stageName(stageRaw);
  if (cancer && stage) return `${cancer}, ${stage}`;
  if (cancer) return cancer;
  if (stage) return stage.charAt(0).toUpperCase() + stage.slice(1);
  return "Diagnosis not in the chart";
}

/** Last clinic note we actually have. A missing next visit stays missing. */
export function visitLine(
  patient: { facts: Pick<Fact, "sourceDoc" | "sourceQuote" | "observedAt">[] },
  asOf: string,
): string {
  const dates = patient.facts
    .filter((fact) => /clinic|oncology note|office visit|\bvisit\b/i.test(`${fact.sourceDoc} ${fact.sourceQuote}`))
    .map((fact) => fact.observedAt)
    .filter((date) => /^\d{4}-\d{2}-\d{2}/.test(date))
    .sort();
  const today = asOf.slice(0, 10);
  const future = dates.find((date) => date.slice(0, 10) > today);
  if (future) return `In clinic ${formatChartDate(future)}`;
  const past = dates.filter((date) => date.slice(0, 10) <= today);
  const last = past[past.length - 1];
  if (last) return `Last seen ${formatChartDate(last)}. Next visit not on the chart.`;
  return "Next visit not on the chart.";
}

export function clinicBucket(input: {
  eliminated: boolean;
  unknownCount: number;
  predicate?: CriterionLeaf["predicate"];
  reason?: Reason;
}): ClinicBucket {
  if (input.eliminated) return "ruled-out";
  if (input.unknownCount === 0) return "discuss";
  if (input.predicate === "washout" || input.reason === "unsupported") return "waiting";
  return "order";
}

export function describeClinic(input: {
  patient: Patient;
  nctId: string;
  trialTitle?: string;
  eliminated: boolean;
  unknownCount: number;
  leaf?: CriterionLeaf;
  reason?: Reason;
  orderTitle?: string;
  asOf: string;
}): ClinicCard {
  const bucket = clinicBucket({
    eliminated: input.eliminated,
    unknownCount: input.unknownCount,
    predicate: input.leaf?.predicate,
    reason: input.reason,
  });
  const blocker =
    bucket === "discuss"
      ? "Nothing open on this trial"
      : blockerPhrase(input.leaf, input.reason, input.patient, input.eliminated);
  return {
    name: displayName(input.patient),
    picture: diagnosisLine(input.patient),
    trialName: trialWords(input.nctId, input.trialTitle),
    blocker,
    resolve: resolveLine(bucket, input.orderTitle),
    visit: visitLine(input.patient, input.asOf),
    bucket,
  };
}

/**
 * The unknown a physician can act on, ahead of a washout or a question no
 * order can answer. An eliminated pair uses the criterion that ruled it out.
 */
export function clinicFocus(
  pair: PairResult,
  trial: Trial,
  listedId?: string,
): { leaf: CriterionLeaf; cell: PairResult["cells"][number] } | undefined {
  const leaves = collectLeaves(trial.criteria);
  if (pair.eliminated) {
    const cell =
      (listedId ? pair.cells.find((row) => row.criterionId === listedId) : undefined) ??
      pair.cells.find((row) => {
        const leaf = leaves.get(row.criterionId);
        return leaf ? displayTone(row, leaf.type) === "red" : false;
      });
    const leaf = cell ? leaves.get(cell.criterionId) : undefined;
    return cell && leaf ? { cell, leaf } : undefined;
  }
  const unknowns = pair.cells.filter((row) => row.verdict === "UNKNOWN");
  const orderable = unknowns.filter((row) => {
    const leaf = leaves.get(row.criterionId);
    return leaf && leaf.predicate !== "washout" && row.reason !== "unsupported";
  });
  const washouts = unknowns.filter((row) => leaves.get(row.criterionId)?.predicate === "washout");
  const pool = orderable.length ? orderable : washouts.length ? washouts : unknowns;
  const cell = blockingUnknown({ ...pair, cells: pool });
  const leaf = cell ? leaves.get(cell.criterionId) : undefined;
  return cell && leaf ? { cell, leaf } : undefined;
}

export function blockerPhrase(
  leaf: CriterionLeaf | undefined,
  reason: Reason | undefined,
  patient: { facts: Fact[] },
  eliminated: boolean,
): string {
  if (!leaf) return eliminated ? "Record rules this trial out" : "Open question on the chart";
  if (eliminated) return rulingPhrase(leaf, patient);
  return openPhrase(leaf, reason ?? "absent");
}

export function resolveLine(bucket: ClinicBucket, orderTitle?: string): string {
  if (bucket === "discuss" || bucket === "ruled-out") return "Nothing to order.";
  if (bucket === "waiting") return orderTitle ?? "Nothing to order. This resolves with time.";
  return orderTitle ? `Order: ${orderTitle}` : "No order mapped from this criterion.";
}

function openPhrase(leaf: CriterionLeaf, reason: Reason): string {
  switch (leaf.predicate) {
    case "biomarker": {
      const gene = markerName(leaf);
      if (reason === "absent") return `${gene} never tested`;
      if (reason === "stale") return `${gene} result is out of date`;
      return `${gene} result does not answer this`;
    }
    case "performance_status": {
      const name = statusName(leaf);
      if (reason === "absent" || reason === "stale") return `Needs a current ${name}`;
      return `${name} does not answer this`;
    }
    case "lab_value": {
      const name = leaf.analyte?.trim() || "Lab";
      if (!leaf.analyte && reason === "unsupported") return "A lab question the chart's numbers cannot answer";
      if (reason === "absent") return `No ${name} on file`;
      if (reason === "stale") return `${name} is out of date`;
      return `${name} does not answer this`;
    }
    case "washout":
      return reason === "absent" ? "Washout not dated" : "Washout still running";
    case "staging":
      if (reason === "absent") return "Stage not documented";
      if (reason === "stale") return "Needs current staging";
      return "Stage does not answer this";
    case "diagnosis":
      return reason === "absent" ? "Diagnosis not documented" : "Diagnosis does not answer this";
    case "prior_therapy":
      return reason === "absent" ? "Prior therapy not in the chart" : "Prior therapy does not answer this";
    case "comorbidity":
      return reason === "absent" ? "History not documented" : "History does not answer this";
    case "contraindication":
      return reason === "absent" ? "Contraindications not reviewed" : "Contraindications do not answer this";
    case "age":
      return "Age not confirmed";
  }
}

function rulingPhrase(leaf: CriterionLeaf, patient: { facts: Fact[] }): string {
  switch (leaf.predicate) {
    case "lab_value":
      return labOutside(leaf, patient);
    case "prior_therapy": {
      const drugs = drugList(leaf);
      return leaf.type === "inclusion" ? `Has not had ${drugs}` : `Prior ${drugs} rules this trial out`;
    }
    case "biomarker":
      return `${markerName(leaf)} does not match`;
    case "performance_status":
      return `${statusName(leaf)} is outside range`;
    case "staging":
      return "Stage does not match";
    case "diagnosis":
      return "Diagnosis does not match";
    case "age":
      return "Age is outside the range this trial requires";
    case "washout":
      return "Washout has not cleared";
    case "comorbidity":
      return "Another illness rules this trial out";
    case "contraindication":
      return "A contraindication rules this trial out";
  }
}

function labOutside(leaf: CriterionLeaf, patient: { facts: Fact[] }): string {
  const name = leaf.analyte?.trim() || "Lab";
  const fact = [...patient.facts]
    .filter((row) => row.predicate === "lab_value" && (!leaf.analyte || row.analyte === leaf.analyte))
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
  if (fact && typeof fact.value === "number" && typeof leaf.value === "number") {
    const unit = leaf.unit ?? fact.unit;
    const suffix = unit ? ` ${unit}` : "";
    return `${name} is ${fact.value}${suffix}; trial requires ${leaf.operator} ${leaf.value}${suffix}`;
  }
  return `${name} is outside the range this trial requires`;
}

function drugList(leaf: CriterionLeaf): string {
  if (leaf.members?.length) return leaf.members.join(", ");
  if (Array.isArray(leaf.value)) return leaf.value.join(", ");
  if (typeof leaf.value === "string" && leaf.value) return leaf.value;
  return leaf.drugClass || "the therapy this trial asks about";
}

function markerName(leaf: CriterionLeaf): string {
  const value = Array.isArray(leaf.value) ? leaf.value.join(" ") : String(leaf.value ?? "");
  const blob = `${leaf.analyte ?? ""} ${value} ${leaf.sourceSpan}`;
  if (/egfr/i.test(blob)) return "EGFR";
  if (leaf.analyte?.trim()) return leaf.analyte.trim();
  return "Biomarker";
}

function statusName(leaf: CriterionLeaf): string {
  const blob = `${leaf.analyte ?? ""} ${leaf.sourceSpan}`;
  if (/ecog/i.test(blob)) return "ECOG";
  if (/karnofsky/i.test(blob)) return "Karnofsky";
  return "performance status";
}

function newest<T extends { predicate: string; observedAt: string }>(facts: T[], predicate: string): T | undefined {
  return facts
    .filter((fact) => fact.predicate === predicate)
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
}

function cancerName(text: string): string {
  if (!text) return "";
  if (/non-small cell lung|\bnsclc\b/i.test(text)) return "NSCLC";
  const cleaned = text.replace(/\s*\((disorder|finding)\)\s*/gi, "").trim();
  if (!cleaned || /^stage\b/i.test(cleaned) || /^(IV|IIIB|IIIA|III|II|I)[A-C]?$/i.test(cleaned)) return "";
  if (cleaned.length > 80) return "";
  return cleaned;
}

function stageName(text: string): string {
  if (!text) return "";
  if (/IIIB\s*~\s*IV/i.test(text)) return "stage IIIB–IV";
  if (/\bstage\s*iv\b/i.test(text) || /^iv$/i.test(text.trim())) return "stage IV";
  const labeled = text.match(/\bstage\s+([0-9IVX]+[A-C]?)\b/i);
  if (labeled) return `stage ${labeled[1].toUpperCase()}`;
  if (/^(IV|IIIB|IIIA|III|II|I)[A-C]?$/i.test(text.trim())) return `stage ${text.trim().toUpperCase()}`;
  return "";
}

export function formatChartDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return iso;
  return `${Number(match[3])} ${month} ${match[1]}`;
}
