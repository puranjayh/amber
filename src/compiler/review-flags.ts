/** Separate citation granularity from semantic extraction risk. */
export type ReviewFlagSeverity = "citation_granularity" | "semantic";

/** A real but coarse protocol quote is auditable and must not gate the demo. */
export function classifyReviewFlag(reason: string): ReviewFlagSeverity {
  return /\bsourceSpan near-verbatim\b|\bfull source block retained\b/.test(reason)
    ? "citation_granularity"
    : "semantic";
}

export function partitionReviewFlags(reasons: readonly string[]): {
  citationFlags: string[];
  semanticReasons: string[];
} {
  const citationFlags: string[] = [];
  const semanticReasons: string[] = [];
  for (const reason of reasons) {
    (classifyReviewFlag(reason) === "citation_granularity" ? citationFlags : semanticReasons).push(reason);
  }
  return { citationFlags, semanticReasons };
}
