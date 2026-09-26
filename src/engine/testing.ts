/**
 * Builders for engine tests. Not part of the engine's public surface — they
 * exist so a test can say "a lab leaf with a 14-day window" in one line and
 * still produce a value the frozen zod schemas accept.
 *
 * Every builder fills the contract's defaults (`sweepable`, `provenance`,
 * `needsHumanReview`) so tests never drift from the schema. `assertValid`
 * parses through zod, which is how we find out that a fixture is wrong rather
 * than finding out that the engine is.
 */
import {
  CriterionLeaf as CriterionLeafSchema,
  Patient as PatientSchema,
  Trial as TrialSchema,
  type CriterionGroup,
  type CriterionLeaf,
  type CriterionNode,
  type Fact,
  type Patient,
  type Trial,
} from "@/src/contracts";

export function leaf(over: Partial<CriterionLeaf> & Pick<CriterionLeaf, "id">): CriterionLeaf {
  return {
    kind: "leaf",
    type: "inclusion",
    predicate: "lab_value",
    operator: ">=",
    value: 0,
    tier: 1,
    sweepable: false,
    sourceSpan: `protocol text for ${over.id}`,
    ...over,
  };
}

export function group(
  op: CriterionGroup["op"],
  children: CriterionNode[],
  sourceSpan?: string,
): CriterionGroup {
  return { kind: "group", op, children, sourceSpan };
}

export function fact(over: Partial<Fact> = {}): Fact {
  return {
    predicate: "lab_value",
    value: 0,
    observedAt: "2026-09-20",
    sourceQuote: "quoted sentence from the record",
    sourceDoc: "note 2026-09-20",
    provenance: "chart",
    ...over,
  };
}

export function patient(over: Partial<Patient> = {}): Patient {
  return {
    id: "PT-0001",
    age: 60,
    sex: "F",
    race: "White",
    facts: [],
    ...over,
  };
}

export function trial(over: Partial<Trial> = {}): Trial {
  return {
    nctId: "NCT00000001",
    title: "A test trial",
    phase: "PHASE2",
    condition: "NSCLC",
    slots: 1,
    criteria: [],
    compilerConfidence: 1,
    needsHumanReview: false,
    ...over,
  };
}

/** Parse through the frozen schemas, so a bad builder call fails as a bad test. */
export function assertValid(t: Trial, ps: readonly Patient[]): void {
  TrialSchema.parse(t);
  ps.forEach((p) => PatientSchema.parse(p));
}

export function assertValidLeaf(l: CriterionLeaf): void {
  CriterionLeafSchema.parse(l);
}
