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
import type { Fact, Predicate } from "@/src/contracts";

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
