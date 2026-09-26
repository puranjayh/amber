/**
 * Compiled criterion trees, rendered in English a clinician can check at a glance.
 *
 * This exists because of what we are actually trying to measure. The eval harness
 * asks whether the engine evaluates a tree correctly, and with a deterministic
 * engine under 791 tests that is close to tautological. The unmeasured risk is one
 * step upstream: does the tree mean what the protocol sentence meant? Only a human
 * can answer that, and a human cannot read JSON quickly enough to answer it 77
 * times. So the tree has to become a sentence.
 *
 * Two rendering choices are deliberate and worth defending:
 *
 * 1. **OR is upper-cased.** The error mode under review is a flattened
 *    disjunction — a protocol that said "A or B" compiled into a tree that demands
 *    both. A reviewer scanning for that needs the disjunction to jump off the
 *    page, so `OR` is shouted and `and` is not.
 *
 * 2. **Nothing is smoothed away.** A recency window, a unit, a drug-class member
 *    list all appear even when they make the sentence clumsier, because the
 *    reviewer is checking for omissions and a fluent sentence that quietly drops
 *    `maxAgeDays` would hide exactly the kind of error we are hunting.
 *
 * Pure: a tree in, a string out. No clock, no I/O.
 */
import type { CriterionLeaf, CriterionNode, Operator, Predicate } from "@/src/contracts";

/** How each predicate names its subject when the compiler gave no analyte. */
const SUBJECT: Record<Predicate, string> = {
  age: "age",
  lab_value: "lab value",
  biomarker: "biomarker",
  prior_therapy: "prior therapy",
  performance_status: "performance status",
  diagnosis: "diagnosis",
  staging: "stage",
  washout: "time since last dose",
  comorbidity: "condition",
  contraindication: "concomitant treatment or contraindication",
};

const COMPARISON: Record<Operator, string> = {
  ">=": "at least",
  "<=": "at most",
  ">": "more than",
  "<": "less than",
  "==": "is",
  "!=": "is not",
  in: "is one of",
  not_in: "is none of",
};

const quote = (v: string): string => `"${v}"`;

/** `["a","b","c"]` → `a, b OR c`, with the disjunction shouted. */
function orList(values: readonly string[]): string {
  if (values.length === 0) return "(nothing)";
  if (values.length === 1) return values[0];
  return `${values.slice(0, -1).join(", ")} OR ${values[values.length - 1]}`;
}

/** `["a","b","c"]` → `a, b and c`. */
function andList(values: readonly string[]): string {
  if (values.length === 0) return "(nothing)";
  if (values.length === 1) return values[0];
  return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
}

/**
 * What a yes/no leaf is actually about.
 *
 * The compiler sometimes encodes a whole protocol sentence as a boolean with no
 * analyte — "Women who are pregnant or lactating" becomes `value: true`. Rendering
 * that as "has present" tells a reviewer nothing and wastes one of 77 slots, so the
 * sentence itself becomes the subject and is labelled a flag, which is exactly what
 * it is: an undecomposed yes/no. That labelling is not editorial. A reviewer seeing
 * it should usually conclude the prose was not parsed, and they cannot conclude
 * that from "has present".
 */
function booleanSubject(leaf: CriterionLeaf): string {
  if (leaf.analyte !== undefined) return leaf.analyte;
  if (leaf.drugClass !== undefined) return leaf.drugClass;
  const span = leaf.sourceSpan.trim();
  const shortened = span.length > 120 ? `${span.slice(0, 117)}…` : span;
  return `flag: ${quote(shortened)}`;
}

function valuePhrase(leaf: CriterionLeaf): string {
  const { value, unit } = leaf;
  if (Array.isArray(value)) return orList(value.map(quote));
  if (typeof value === "boolean") return value ? "present" : "absent";
  const rendered = typeof value === "number" ? String(value) : quote(value);
  return unit === undefined ? rendered : `${rendered} ${unit}`;
}

/** The recency window, spelled out — an omitted window is an error we want seen. */
function windowPhrase(leaf: CriterionLeaf): string {
  return leaf.maxAgeDays === undefined ? "" : `, measured within ${leaf.maxAgeDays} days`;
}

/**
 * One leaf as an English clause.
 *
 * The common protocol shapes get purpose-written phrasings, because "age at least
 * 18 years" reads like a machine and "aged 18 years or older" reads like a
 * protocol. Anything unrecognised falls back to subject + comparison + value,
 * which is always correct if occasionally stiff.
 */
export function renderLeaf(leaf: CriterionLeaf): string {
  const { predicate, operator, analyte, drugClass } = leaf;
  const window = windowPhrase(leaf);
  const subject = analyte ?? drugClass ?? SUBJECT[predicate];

  /*
   * An undecomposed yes/no is recognised before any per-predicate phrasing,
   * because those phrasings assume a value worth reading. `staging` with
   * `value: true` came out as "stage present", which says nothing. The three
   * predicates excluded here have their own boolean wording that already reads
   * correctly ("has ...", "no prior ...").
   */
  const ownsBooleanPhrasing =
    predicate === "comorbidity" || predicate === "contraindication" || predicate === "prior_therapy";
  if (
    typeof leaf.value === "boolean" &&
    analyte === undefined &&
    drugClass === undefined &&
    !ownsBooleanPhrasing
  ) {
    const what = booleanSubject(leaf);
    return leaf.value ? `${what} is present${window}` : `${what} is absent${window}`;
  }

  if (predicate === "age" && typeof leaf.value === "number") {
    const unit = leaf.unit ?? "years";
    if (operator === ">=") return `aged ${leaf.value} ${unit} or older`;
    if (operator === ">") return `older than ${leaf.value} ${unit}`;
    if (operator === "<=") return `aged ${leaf.value} ${unit} or younger`;
    if (operator === "<") return `younger than ${leaf.value} ${unit}`;
  }

  if (predicate === "washout" && typeof leaf.value === "number") {
    const unit = leaf.unit ?? "days";
    if (operator === ">=") return `at least ${leaf.value} ${unit} since the last dose`;
    if (operator === ">") return `more than ${leaf.value} ${unit} since the last dose`;
    if (operator === "<=") return `within ${leaf.value} ${unit} of the last dose`;
    if (operator === "<") return `less than ${leaf.value} ${unit} since the last dose`;
  }

  if (predicate === "performance_status" && typeof leaf.value === "number") {
    const name = analyte ?? "performance status";
    if (operator === "<=") return `${name} ${leaf.value} or better${window}`;
    if (operator === ">=") return `${name} ${leaf.value} or worse${window}`;
    if (operator === "==") return `${name} of ${leaf.value}${window}`;
  }

  if (predicate === "diagnosis") {
    if (operator === "==") return `diagnosed with ${valuePhrase(leaf)}`;
    if (operator === "!=") return `not diagnosed with ${valuePhrase(leaf)}`;
    if (operator === "in") return `diagnosed with ${valuePhrase(leaf)}`;
    if (operator === "not_in") return `diagnosed with none of ${valuePhrase(leaf)}`;
  }

  if (predicate === "staging") {
    if (operator === "in" || operator === "==") return `stage ${valuePhrase(leaf)}`;
    if (operator === "not_in" || operator === "!=") return `not stage ${valuePhrase(leaf)}`;
  }

  if (predicate === "prior_therapy") {
    const what = drugClass !== undefined ? `${drugClass}` : valuePhrase(leaf);
    const members =
      drugClass !== undefined && leaf.members !== undefined && leaf.members.length > 0
        ? ` (${orList(leaf.members.map(quote))})`
        : "";
    if (operator === "in" || operator === "==") {
      return typeof leaf.value === "boolean" && leaf.value === false
        ? `no prior ${what}${members}`
        : `has had prior ${what}${members}`;
    }
    if (operator === "not_in" || operator === "!=") return `no prior ${what}${members}`;
  }

  if (predicate === "comorbidity" || predicate === "contraindication") {
    if (typeof leaf.value === "boolean") {
      const what = booleanSubject(leaf);
      return leaf.value ? `has ${what}` : `does not have ${what}`;
    }
    const what = analyte ?? valuePhrase(leaf);
    if (operator === "==" || operator === "in") return `has ${valuePhrase(leaf)}`;
    if (operator === "!=" || operator === "not_in") return `does not have ${valuePhrase(leaf)}`;
  }

  if (predicate === "biomarker") {
    if (typeof leaf.value === "boolean") {
      const name = analyte ?? booleanSubject(leaf);
      return leaf.value ? `${name} positive${window}` : `${name} negative${window}`;
    }
    const name = analyte ?? "biomarker";
    if (operator === "==" || operator === "in") return `${name} ${valuePhrase(leaf)}${window}`;
    if (operator === "!=" || operator === "not_in") {
      return `${name} not ${valuePhrase(leaf)}${window}`;
    }
  }

  return `${subject} ${COMPARISON[operator]} ${valuePhrase(leaf)}${window}`;
}

/**
 * A whole criterion node as one sentence.
 *
 * Parenthesises a nested group so precedence is unambiguous. A reviewer deciding
 * whether "A or (B and C)" was compiled as "(A or B) and C" needs the brackets.
 */
export function renderNode(node: CriterionNode, depth = 0): string {
  if (node.kind === "leaf") return renderLeaf(node);

  const parts = node.children.map((c) => renderNode(c, depth + 1));

  if (node.op === "NOT") {
    const inner = parts.length === 1 ? parts[0] : andList(parts);
    return `NOT (${inner})`;
  }

  const joined = node.op === "OR" ? orList(parts) : andList(parts);
  // Bracket a nested group; leave the outermost one clean.
  const needsBrackets = depth > 0 && node.children.length > 1;
  return needsBrackets ? `(${joined})` : joined;
}

/**
 * The criterion framed as the protocol frames it: a requirement or a bar.
 *
 * The polarity is stated in words rather than left to the reader, because a
 * reviewer who mistakes an exclusion for an inclusion will mark a correct tree
 * wrong, and that noise is indistinguishable from a real finding.
 */
export function renderCriterion(node: CriterionNode): string {
  const type = criterionSide(node);
  const body = renderNode(node);
  if (type === "exclusion") return `Excluded if: ${body}`;
  if (type === "inclusion") return `Must: ${body}`;
  return `Mixed inclusion and exclusion: ${body}`;
}

/** Which protocol section the node's leaves came from. */
export function criterionSide(
  node: CriterionNode,
): "inclusion" | "exclusion" | "mixed" {
  if (node.kind === "leaf") return node.type;
  const kinds = new Set(node.children.map(criterionSide));
  return kinds.size === 1 ? [...kinds][0] : "mixed";
}

/**
 * An indented outline of a tree, for the cases a single sentence cannot carry.
 *
 * A twelve-leaf conjunction reads as a wall; the same thing as a list is checkable
 * line by line. The operator heads each group so the shape is explicit.
 */
export function renderOutline(node: CriterionNode, indent = 0): string[] {
  const pad = "  ".repeat(indent);
  if (node.kind === "leaf") return [`${pad}- ${renderLeaf(node)}`];
  const head = node.op === "OR" ? "ANY of (OR):" : node.op === "NOT" ? "NOT:" : "ALL of (and):";
  return [
    `${pad}- ${head}`,
    ...node.children.flatMap((c) => renderOutline(c, indent + 1)),
  ];
}

/** Does this tree contain a disjunction anywhere? The review's central question. */
export function hasDisjunction(node: CriterionNode): boolean {
  if (node.kind === "leaf") {
    // `in` over several values is a disjunction too: one of these will do.
    return Array.isArray(node.value) && node.value.length > 1 && node.operator === "in";
  }
  return node.op === "OR" || node.children.some(hasDisjunction);
}

/** Leaves in document order, one entry per occurrence. */
export function leavesOf(node: CriterionNode): CriterionLeaf[] {
  if (node.kind === "leaf") return [node];
  return node.children.flatMap(leavesOf);
}
