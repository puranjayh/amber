import type { CriterionLeaf, CubeCell, Fact, Patient } from "@/src/contracts";

const STOP = new Set([
  "patient",
  "patients",
  "within",
  "prior",
  "study",
  "treatment",
  "starting",
  "protocol",
  "before",
  "after",
  "least",
  "which",
  "their",
  "must",
  "have",
  "from",
  "with",
  "this",
  "that",
  "than",
  "more",
  "days",
  "been",
  "were",
  "will",
  "into",
  "only",
  "also",
  "such",
  "other",
  "receiving",
]);

function norm(value: string): string {
  return value.trim().toLowerCase();
}

function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9-]{4,}/g) ?? []).filter((word) => !STOP.has(word));
}

function overlap(leaf: CriterionLeaf, fact: Fact): number {
  const quote = `${fact.sourceQuote} ${String(fact.value)}`.toLowerCase();
  return tokens(leaf.sourceSpan).filter((word) => quote.includes(word)).length;
}

function sameBucket(a: CriterionLeaf, b: CriterionLeaf): boolean {
  if (a.predicate !== b.predicate) return false;
  return norm(a.analyte ?? "") === norm(b.analyte ?? "");
}

/**
 * The sentence on screen has to be a fact of this criterion. A shared predicate
 * bucket (every washout leaf sees every washout fact) is not enough — the quote
 * has to be about this leaf, not a sibling.
 */
export function shownCitation(
  patient: Pick<Patient, "facts">,
  leaf: CriterionLeaf,
  cell: Pick<CubeCell, "chartCitation"> | undefined,
  leaves: readonly CriterionLeaf[],
): string | undefined {
  const quote = cell?.chartCitation;
  if (!quote) return undefined;
  const fact = patient.facts.find((row) => row.sourceQuote === quote);
  if (!fact) {
    if (leaf.predicate === "age" && /age \d+|structured demographics/i.test(quote)) return quote;
    return undefined;
  }
  if (fact.predicate !== leaf.predicate) return undefined;
  if (leaf.analyte && norm(fact.analyte ?? "") !== norm(leaf.analyte)) return undefined;
  const peers = leaves.filter((other) => other.id !== leaf.id && sameBucket(other, leaf));
  if (peers.length === 0) return quote;
  const mine = overlap(leaf, fact);
  const bestPeer = peers.reduce((best, peer) => Math.max(best, overlap(peer, fact)), 0);
  if (mine === 0) return bestPeer > 0 ? undefined : quote;
  return mine >= bestPeer ? quote : undefined;
}
