/**
 * Three-valued (Kleene) logic — docs/CONTRACT.md §4.
 *
 *   AND   any FAIL → FAIL;   else any UNKNOWN → UNKNOWN;   else PASS
 *   OR    any PASS → PASS;   else any UNKNOWN → UNKNOWN;   else FAIL
 *   NOT   PASS ↔ FAIL;       UNKNOWN stays UNKNOWN
 *
 * UNKNOWN is not a failure and it is not a maybe-failure. It is "the record is
 * silent", and it propagates until a FAIL (under AND) or a PASS (under OR)
 * genuinely decides the question. Nothing here can manufacture a FAIL out of
 * UNKNOWN inputs — that invariant is what rule 4 of the contract buys us, and
 * the test suite asserts it directly.
 *
 * Pure: no I/O, no clock, no allocation beyond the return value.
 */
import type { Verdict } from "@/src/contracts";

/** Identity for AND — vacuous truth. An empty conjunction is PASS. */
export const AND_IDENTITY: Verdict = "PASS";

/** Identity for OR — vacuous falsity. An empty disjunction is FAIL. */
export const OR_IDENTITY: Verdict = "FAIL";

/** FAIL absorbs under AND; UNKNOWN only survives if nothing failed. */
export function and(verdicts: readonly Verdict[]): Verdict {
  let sawUnknown = false;
  for (const v of verdicts) {
    if (v === "FAIL") return "FAIL";
    if (v === "UNKNOWN") sawUnknown = true;
  }
  return sawUnknown ? "UNKNOWN" : AND_IDENTITY;
}

/** PASS absorbs under OR; UNKNOWN only survives if nothing passed. */
export function or(verdicts: readonly Verdict[]): Verdict {
  let sawUnknown = false;
  for (const v of verdicts) {
    if (v === "PASS") return "PASS";
    if (v === "UNKNOWN") sawUnknown = true;
  }
  return sawUnknown ? "UNKNOWN" : OR_IDENTITY;
}

/** Swaps PASS and FAIL. Leaves UNKNOWN exactly where it was. */
export function not(v: Verdict): Verdict {
  if (v === "PASS") return "FAIL";
  if (v === "FAIL") return "PASS";
  return "UNKNOWN";
}

/**
 * Combine one group node's child verdicts under its operator.
 *
 * A NOT group with a single child negates that child. With several children it
 * negates their conjunction, because a group's children are implicitly
 * conjoined — De Morgan, so NOT(a, b) is NOT(a AND b), never (NOT a, NOT b).
 */
export function combine(
  op: "AND" | "OR" | "NOT",
  verdicts: readonly Verdict[],
): Verdict {
  switch (op) {
    case "AND":
      return and(verdicts);
    case "OR":
      return or(verdicts);
    case "NOT":
      return not(and(verdicts));
  }
}
