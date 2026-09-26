/**
 * What each source of data is allowed to prove.
 *
 * `Fact.provenance` has been in the contract from the start with a one-line
 * comment — "Claims can prove FAIL, rarely PASS" — and until now nothing
 * enforced it. This module is that enforcement, and it is the architectural
 * claim we make about working with payer data.
 *
 * THE ASYMMETRY. An insurance claim is a bill. It records that something was
 * done and paid for, never what it showed. A claim for a CBC proves a CBC was
 * drawn; it says nothing whatever about the neutrophil count. So a claims fact
 * can *rule a criterion out* and can never *confirm* one — for the predicates
 * where the claim is a proxy for a result rather than the result itself.
 *
 * Where the claim IS the fact, there is no asymmetry. A pharmacy dispense really
 * does establish that a drug was dispensed. A coded diagnosis really is the
 * diagnosis on the record. Dates of service really are dates. For those, claims
 * confirm as well as the chart does — and for washout dates a pharmacy feed is
 * often the better source, because it covers the fills the local chart never saw.
 *
 * PATIENT REPORT IS NOT A MEDICAL RECORD. A patient saying they were on
 * osimertinib is a reason to go and look. It is not evidence either way, and it
 * decides nothing — not in the favourable direction and not in the unfavourable
 * one. So a patient-reported fact caps the verdict at UNKNOWN whichever way it
 * points. Contract §3: "Preferences come from the patient. Medical facts never
 * do." Preferences live in `Patient.preferences`; a medical claim in
 * `Patient.facts` with this provenance is hearsay, and the honest verdict on
 * hearsay is "we need to check".
 *
 * WHAT A CEILING IS NOT. It is never a FAIL. A capped verdict is UNKNOWN with
 * reason `unsupported`, which keeps the patient a candidate and turns the cell
 * into resolvable work — request the records. Rule 4 holds here as everywhere:
 * we are short of evidence, and being short of evidence is not evidence.
 */
import type { CriterionLeaf, Fact, Predicate } from "@/src/contracts";

export type Provenance = Fact["provenance"];

/**
 * How far a source may take a verdict.
 *   none        no restriction
 *   no_confirm  may reach FAIL, never PASS
 *   no_verdict  may reach neither; caps at UNKNOWN
 */
export type ProvenanceCeiling = "none" | "no_confirm" | "no_verdict";

/**
 * Predicates a claim can establish affirmatively, with the reason in each case.
 * Everything absent from this set is a predicate where the claim is a proxy for
 * a result, so the claim can only ever rule the criterion out.
 */
const CLAIMS_CAN_CONFIRM: ReadonlyMap<Predicate, string> = new Map([
  ["age", "the enrollment file carries date of birth"],
  ["prior_therapy", "a dispense or administration claim is the event itself"],
  ["diagnosis", "the coded diagnosis is what the record says"],
  ["comorbidity", "the coded diagnosis is what the record says"],
  ["contraindication", "a concomitant dispense is the event itself"],
  ["washout", "dates of service are dates; a pharmacy feed often beats the chart"],
]);

/** Why a claim cannot confirm these — the sentence a judge will want. */
const CLAIMS_CANNOT_CONFIRM: ReadonlyMap<Predicate, string> = new Map([
  ["lab_value", "a claim shows the panel was billed, not what the result was"],
  ["biomarker", "a claim shows the assay was billed, not what it found"],
  ["performance_status", "performance status is assessed and written down, never billed"],
  ["staging", "a claim shows the scan was billed, not what it showed"],
]);

/** What this source may prove about this predicate. */
export function ceilingFor(provenance: Provenance, predicate: Predicate): ProvenanceCeiling {
  if (provenance === "patient_reported") return "no_verdict";
  if (provenance === "claims") {
    return CLAIMS_CAN_CONFIRM.has(predicate) ? "none" : "no_confirm";
  }
  return "none";
}

/** The note a UI puts next to a capped cell. */
export interface ProvenanceNote {
  provenance: Provenance;
  predicate: Predicate;
  ceiling: Exclude<ProvenanceCeiling, "none">;
  /** One sentence saying what the source can and cannot do here. */
  note: string;
  /** Why, in the terms a pharma reviewer will ask about. */
  because: string;
  /** What would settle it. */
  resolution: string;
}

/**
 * Explain a ceiling, or return undefined when the source is unrestricted.
 *
 * Pure and total: safe to call for any pair, including ones with no restriction.
 */
export function explainCeiling(
  provenance: Provenance,
  predicate: Predicate,
): ProvenanceNote | undefined {
  const ceiling = ceilingFor(provenance, predicate);
  if (ceiling === "none") return undefined;

  if (ceiling === "no_verdict") {
    return {
      provenance,
      predicate,
      ceiling,
      note: "Patient-reported, so this decides nothing either way — needs the chart.",
      because: "a patient's account is a reason to look, not a medical record",
      resolution: "confirm against the chart",
    };
  }

  return {
    provenance,
    predicate,
    ceiling,
    note: "Claims can rule this out but not confirm it — needs the chart.",
    because: CLAIMS_CANNOT_CONFIRM.get(predicate) ?? "a claim records billing, not results",
    resolution: "request the chart, or order the test",
  };
}

/**
 * Is a source able to confirm this predicate at all? Convenience for a UI that
 * wants to grey out a "confirm from claims" affordance before evaluating.
 */
export function canConfirm(provenance: Provenance, predicate: Predicate): boolean {
  return ceilingFor(provenance, predicate) === "none";
}

/** Every predicate a claim can confirm, for documentation and tests. */
export function claimsConfirmablePredicates(): Predicate[] {
  return [...CLAIMS_CAN_CONFIRM.keys()];
}

/* ------------------------------------------------- answerability, per criterion */

/**
 * Whether a criterion could be settled from a given source at all.
 *
 *   yes        the source records this directly
 *   sometimes  it depends on the particular criterion — some instances are
 *              visible in the data and some are not
 *   never      the source cannot answer it in principle
 *
 * This is a different question from `ceilingFor`, and the difference matters.
 * `ceilingFor` governs one fact during evaluation: may THIS fact produce a PASS.
 * `answerableBy` governs a criterion before any patient is involved: could this
 * data source ever settle it. That is what makes the coverage statistic possible
 * — we can size the chart requirement across a whole trial pool without holding
 * a single patient record.
 *
 * The two stay consistent, and coverage.test.ts asserts it: `never` here means a
 * ceiling there, and `yes` or `sometimes` here means no ceiling there.
 */
export type Answerability = "yes" | "never" | "sometimes";

/**
 * Predicates a claim can never settle, because the claim is a proxy for a result
 * it does not contain. Reasons are the ones to say out loud.
 */
const NEVER_FROM_CLAIMS: ReadonlyMap<Predicate, string> = CLAIMS_CANNOT_CONFIRM;

/**
 * Predicates where it genuinely depends on the criterion.
 *
 * A washout is usually visible — a pharmacy fill or a procedure claim carries a
 * date of service — but only when the therapy being waited out bills at all, and
 * a fill date is not always the administration date.
 *
 * A contraindication is visible when it is a concomitant drug, and invisible when
 * it is a clinical judgement: "QTc > 470 ms" and "uncontrolled hypertension" are
 * both contraindications and neither is in a claim.
 */
const SOMETIMES_FROM_CLAIMS: ReadonlyMap<Predicate, string> = new Map([
  [
    "washout",
    "visible when the therapy bills; a fill date is not always an administration date",
  ],
  [
    "contraindication",
    "visible as a concomitant dispense, invisible when it is a clinical judgement",
  ],
]);

/**
 * Does this leaf encode a measurement rather than a coded event?
 *
 * A compiler sometimes files a threshold under a non-lab predicate — an ejection
 * fraction as a comorbidity, a QTc as a contraindication. A numeric threshold on
 * a named analyte with a unit is a measurement whatever it is filed under, and a
 * claim never carries a measurement.
 */
function looksLikeMeasurement(leaf: CriterionLeaf): boolean {
  if (leaf.analyte === undefined || leaf.unit === undefined) return false;
  if (typeof leaf.value !== "number") return false;

  // Demographics are never a billed test. An enrolment file carries date of
  // birth, so an age threshold is answerable however the compiler filed it.
  if (leaf.predicate === "age") return false;

  // The compiler sometimes restates the predicate as the analyte — an `age` leaf
  // with `analyte: "age"`, a `staging` leaf with `analyte: "stage"`. That is not a
  // named measurement, it is the same field twice, so it must not trip this.
  const analyte = leaf.analyte.trim().toLowerCase().replace(/[\s_-]+/g, "");
  const predicate = leaf.predicate.replace(/[_-]+/g, "");
  if (analyte === predicate) return false;

  return true;
}

/** Could this source settle this criterion, and if not, why not. */
export function answerableBy(leaf: CriterionLeaf, provenance: Provenance): Answerability {
  if (provenance === "chart") return "yes";
  // A patient's account is never evidence for a medical criterion; see above.
  if (provenance === "patient_reported") return "never";

  if (NEVER_FROM_CLAIMS.has(leaf.predicate)) return "never";
  if (looksLikeMeasurement(leaf)) return "never";
  if (SOMETIMES_FROM_CLAIMS.has(leaf.predicate)) return "sometimes";
  return "yes";
}

/** The sentence behind an `answerableBy` verdict, for a table cell or a footnote. */
export function explainAnswerability(
  leaf: CriterionLeaf,
  provenance: Provenance,
): { answerable: Answerability; because: string } {
  const answerable = answerableBy(leaf, provenance);
  if (provenance === "chart") {
    return { answerable, because: "the chart is the record" };
  }
  if (provenance === "patient_reported") {
    return { answerable, because: "a patient's account is not a medical record" };
  }
  if (NEVER_FROM_CLAIMS.has(leaf.predicate)) {
    return { answerable, because: NEVER_FROM_CLAIMS.get(leaf.predicate)! };
  }
  if (looksLikeMeasurement(leaf)) {
    return {
      answerable,
      because: `a numeric threshold on ${leaf.analyte} is a measurement, and a claim never carries a measurement`,
    };
  }
  const sometimes = SOMETIMES_FROM_CLAIMS.get(leaf.predicate);
  if (sometimes !== undefined) return { answerable, because: sometimes };
  return {
    answerable,
    because: CLAIMS_CAN_CONFIRM.get(leaf.predicate) ?? "a claim records this directly",
  };
}
