/**
 * Fidelity sampling: does the compiled tree mean what the protocol sentence meant?
 *
 * WHY THIS AND NOT THE EVAL HARNESS. The eval harness checks that the engine
 * evaluates a tree correctly. The engine is deterministic and has 791 tests, so
 * that check is close to tautological — it mostly proves the engine agrees with
 * itself. The risk that is actually unmeasured sits one step upstream, in the
 * compiler: a protocol that said "A or B" can come out as a tree demanding both,
 * and every downstream number inherits the error silently. Only a human reading
 * the source sentence can catch it, so this builds the sheet a human can work
 * through in twenty minutes.
 *
 * THE UNIT OF REVIEW. In this corpus a trial's top-level `criteria` entries are
 * whole protocol sections — one large AND holding every inclusion, one large OR
 * holding every exclusion. A section is far too big to judge as a unit, so the
 * unit here is the section's direct child: the individual numbered criterion, the
 * granularity the protocol itself uses and the granularity the example
 * "at least one prior platinum therapy, OR platinum-intolerant with a taxane"
 * lives at.
 *
 * THE TWO STRATA, AND WHY THEY ARE SAMPLED DIFFERENTLY.
 *
 * The compiler's semantic flag is trial-level: "possible structural alternative
 * has no OR group", raised against a whole trial, naming no criterion. I tried to
 * localise it and could not — a disjunction-marker heuristic matches all 37
 * flagged trials but also 166 of the 196 unflagged ones, so it is a much looser
 * rule than whatever the compiler used, and pretending otherwise would mean
 * measuring my heuristic's recall instead of the compiler's.
 *
 * So:
 *   - **flagged stratum** — one criterion from each of the 37 flagged trials,
 *     chosen as the most suspicious candidate rather than at random: a criterion
 *     whose source text contains a disjunction marker but whose compiled tree has
 *     no disjunction in it. That is a targeted sample. It puts reviewer time where
 *     the error probably is, and it means the flagged error rate is an UPPER bound
 *     on the flagged trials' average, not an estimate of it. `ingest-fidelity.ts`
 *     says so wherever it reports the number.
 *   - **unflagged stratum** — 40 criteria drawn uniformly at random, seeded, from
 *     every criterion of every unflagged trial. This one has to be unbiased
 *     because it is the control: it estimates the base error rate.
 *
 * Deterministic throughout. Same corpus and same seed give the same 77 rows, so a
 * second reviewer grades the same sheet and two runs can be compared.
 */
import type { CriterionNode, Trial } from "@/src/contracts";
import {
  criterionSide,
  hasDisjunction,
  leavesOf,
  renderCriterion,
  renderOutline,
} from "./render";

/* ------------------------------------------------------------------ sampling */

/** mulberry32. Small, seeded, and identical on every machine. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEFAULT_SEED = 20260926;
export const DEFAULT_UNFLAGGED_SAMPLE = 40;

/**
 * Markers that a protocol sentence offers alternatives.
 *
 * Word-boundaried, because "or" inside "oral" or "prior" is not a disjunction —
 * and "prior" appears in almost every oncology criterion, so a substring match
 * here would flag the entire corpus.
 */
const DISJUNCTION_MARKER = /\b(?:or|either|alternatively)\b|\//i;

export interface ReviewUnit {
  nctId: string;
  /** Criterion ids the unit covers. Usually one; a group covers several. */
  criterionIds: string[];
  side: "inclusion" | "exclusion" | "mixed";
  node: CriterionNode;
}

/**
 * The reviewable criteria of one trial: the children of each top-level section,
 * or the top-level node itself when the compiler emitted a bare leaf.
 */
export function reviewUnits(trial: Trial): ReviewUnit[] {
  const units: ReviewUnit[] = [];
  for (const top of trial.criteria) {
    const nodes: CriterionNode[] =
      top.kind === "group" && top.children.length > 1 ? top.children : [top];
    for (const node of nodes) {
      units.push({
        nctId: trial.nctId,
        criterionIds: leavesOf(node).map((l) => l.id),
        side: criterionSide(node),
        node,
      });
    }
  }
  return units;
}

/** Verbatim protocol spans behind a unit, deduplicated, in document order. */
export function sourceSpansOf(node: CriterionNode): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  if (node.kind === "group" && node.sourceSpan !== undefined) {
    seen.add(node.sourceSpan);
    out.push(node.sourceSpan);
  }
  for (const leaf of leavesOf(node)) {
    if (!seen.has(leaf.sourceSpan)) {
      seen.add(leaf.sourceSpan);
      out.push(leaf.sourceSpan);
    }
  }
  return out;
}

/**
 * The surrounding protocol text, so a reviewer can see a disjunction the tree may
 * have dropped. Without this they can only check what was compiled, never what
 * was left out — and leaving something out is the error mode under review.
 *
 * `sourceText` has to be passed in rather than read off the trial. It lives on the
 * compiler's wrapper record, `{ trial, sourceText, citationFlags }`, and
 * `loadTrials` unwraps to `.trial` and drops it. Reading it off a `Trial` silently
 * yields "" for every row, which would have quietly removed the one field that
 * makes an omission visible.
 */
export function sourceContextOf(text: string, spans: readonly string[], radius = 240): string {
  if (text === "" || spans.length === 0) return "";
  const first = spans[0].slice(0, 60);
  const at = text.indexOf(first);
  if (at === -1) return "";
  const from = Math.max(0, at - radius);
  const to = Math.min(text.length, at + spans[0].length + radius);
  return `${from > 0 ? "…" : ""}${text.slice(from, to).trim()}${to < text.length ? "…" : ""}`;
}

/** Does the source offer alternatives that the compiled tree does not? */
export function looksLikeFlattenedDisjunction(unit: ReviewUnit): boolean {
  const spans = sourceSpansOf(unit.node);
  return spans.some((s) => DISJUNCTION_MARKER.test(s)) && !hasDisjunction(unit.node);
}

/* --------------------------------------------------------------- the sheet */

export interface FidelityRow {
  id: string;
  stratum: "flagged" | "unflagged";
  nctId: string;
  trialTitle: string;
  criterionIds: string[];
  side: "inclusion" | "exclusion" | "mixed";

  /** The protocol's own words. The thing the tree is judged against. */
  sourceSpans: string[];
  /** Text around the span, so an omission is visible and not just an addition. */
  sourceContext: string;

  /** The compiled tree as a sentence. Never JSON — see render.ts. */
  compiledPlainEnglish: string;
  /** The same tree as an indented list, which is what long trees need. */
  compiledOutline: string[];
  /** Whether the tree contains a disjunction at all. The review's crux. */
  treeHasDisjunction: boolean;
  /** Whether the source appears to offer alternatives the tree does not. */
  sourceSuggestsDisjunction: boolean;

  /** The compiler's own trial-level reason, when this row came from a flag. */
  detectorReasons: string[];
  /** How this row was picked — targeted for flagged, random for unflagged. */
  selection: "most-suspicious-in-flagged-trial" | "uniform-random";

  /** BLANK, for the human. true = the tree is faithful to the source. */
  faithful: boolean | null;
  /** BLANK, for the human. Free text when `faithful` is false. */
  failureMode: string | null;
  /** BLANK, optional. Reviewer initials, so two passes can be compared. */
  reviewer: string | null;
}

export interface FidelitySheet {
  seed: number;
  corpus: { sha256: string; records: number; trialsWithCriteria: number };
  /** Rows whose `sourceContext` came back empty, so a reviewer knows why. */
  rowsWithoutSourceContext: number;
  strata: {
    flagged: { trials: number; sampled: number; selection: string };
    unflagged: { trials: number; criteriaAvailable: number; sampled: number; samplingRate: number };
  };
  instructions: string[];
  rows: FidelityRow[];
}

export interface BuildSheetOptions {
  seed?: number;
  unflaggedSample?: number;
  corpusSha256?: string;
  /**
   * Raw eligibility prose by `nctId`, from the compiler's wrapper records. Without
   * it every `sourceContext` is empty and the sheet can only show what WAS
   * compiled, never what was left out.
   */
  sourceText?: ReadonlyMap<string, string>;
}

/** Trial ids the compiler raised a genuine semantic flag against. */
export function flaggedTrialIds(
  reviews: readonly { nctId: string; semanticReasons: string[] }[],
): Map<string, string[]> {
  // The back-translation run exhausted its API credits partway through and wrote
  // the HTTP error into semanticReasons, so 63 of 100 "flags" are infrastructure
  // failures and not findings. Those are not evidence about compilation and must
  // not enter the flagged stratum.
  const infrastructure = /^\s*\d{3}\s|credits|spending limit|rate limit|timeout|ECONN|ENOTFOUND/i;
  const out = new Map<string, string[]>();
  for (const review of reviews) {
    const real = review.semanticReasons.filter((r) => !infrastructure.test(r));
    if (real.length > 0) out.set(review.nctId, real);
  }
  return out;
}

const INSTRUCTIONS = [
  "For each row: read `sourceSpans` (and `sourceContext` if you need more), then " +
    "read `compiledPlainEnglish`. Ask one question — does the tree mean what the " +
    "protocol meant? Set `faithful` to true or false.",
  "If false, put one short phrase in `failureMode`. Suggested vocabulary: " +
    "flattened-disjunction (an 'or' became an 'and'), wrong-predicate, " +
    "wrong-operator, wrong-value, dropped-qualifier, dropped-recency-window, " +
    "invented-criterion, unparseable-prose.",
  "`treeHasDisjunction` and `sourceSuggestsDisjunction` are hints, not answers. " +
    "They are the detector's view and the whole point is to check it.",
  "Judge the tree against the source only. Whether a criterion is a good idea, or " +
    "whether the engine can evaluate it, is a different question and not this one.",
  "Leave a row's `faithful` as null if you genuinely cannot tell; ingest counts " +
    "those separately rather than guessing.",
];

/**
 * Build the review sheet.
 *
 * Rows are ordered flagged-first and then by trial, so a reviewer working top to
 * bottom does the high-yield ones while fresh.
 */
export function buildFidelitySheet(
  trials: readonly Trial[],
  flags: Map<string, string[]>,
  options: BuildSheetOptions = {},
): FidelitySheet {
  const seed = options.seed ?? DEFAULT_SEED;
  const want = options.unflaggedSample ?? DEFAULT_UNFLAGGED_SAMPLE;
  const prose = options.sourceText ?? new Map<string, string>();

  const withCriteria = trials.filter((t) => t.criteria.length > 0);
  const flaggedTrials = withCriteria.filter((t) => flags.has(t.nctId));
  const unflaggedTrials = withCriteria.filter((t) => !flags.has(t.nctId));

  const rows: FidelityRow[] = [];

  const rowOf = (
    unit: ReviewUnit,
    trial: Trial,
    stratum: FidelityRow["stratum"],
    selection: FidelityRow["selection"],
  ): FidelityRow => {
    const spans = sourceSpansOf(unit.node);
    return {
      id: `${stratum === "flagged" ? "F" : "U"}-${unit.nctId}-${unit.criterionIds[0] ?? "x"}`,
      stratum,
      nctId: unit.nctId,
      trialTitle: trial.title,
      criterionIds: unit.criterionIds,
      side: unit.side,
      sourceSpans: spans,
      sourceContext: sourceContextOf(prose.get(unit.nctId) ?? "", spans),
      compiledPlainEnglish: renderCriterion(unit.node),
      compiledOutline: renderOutline(unit.node),
      treeHasDisjunction: hasDisjunction(unit.node),
      sourceSuggestsDisjunction: spans.some((s) => DISJUNCTION_MARKER.test(s)),
      detectorReasons: flags.get(unit.nctId) ?? [],
      selection,
      faithful: null,
      failureMode: null,
      reviewer: null,
    };
  };

  // Flagged: one unit per trial, the most suspicious. Ties break on criterion id
  // so the choice is reproducible rather than dependent on array order.
  for (const trial of [...flaggedTrials].sort((a, b) => (a.nctId < b.nctId ? -1 : 1))) {
    const units = reviewUnits(trial);
    if (units.length === 0) continue;
    const suspicious = units.filter(looksLikeFlattenedDisjunction);
    const pool = suspicious.length > 0 ? suspicious : units;
    const chosen = [...pool].sort((a, b) => {
      // Prefer the unit covering the most leaves: a flattened disjunction shows up
      // as a conjunction of several things that should have been alternatives.
      const byLeaves = leavesOf(b.node).length - leavesOf(a.node).length;
      if (byLeaves !== 0) return byLeaves;
      return (a.criterionIds[0] ?? "") < (b.criterionIds[0] ?? "") ? -1 : 1;
    })[0];
    rows.push(rowOf(chosen, trial, "flagged", "most-suspicious-in-flagged-trial"));
  }

  // Unflagged: uniform random over every unit of every unflagged trial.
  const unflaggedUnits: { unit: ReviewUnit; trial: Trial }[] = [];
  for (const trial of [...unflaggedTrials].sort((a, b) => (a.nctId < b.nctId ? -1 : 1))) {
    for (const unit of reviewUnits(trial)) unflaggedUnits.push({ unit, trial });
  }

  const random = rng(seed);
  // Fisher-Yates over indices, seeded: an unbiased sample without replacement.
  const order = unflaggedUnits.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (const i of order.slice(0, Math.min(want, order.length))) {
    const { unit, trial } = unflaggedUnits[i];
    rows.push(rowOf(unit, trial, "unflagged", "uniform-random"));
  }

  return {
    seed,
    corpus: {
      sha256: options.corpusSha256 ?? "(not supplied)",
      records: trials.length,
      trialsWithCriteria: withCriteria.length,
    },
    strata: {
      flagged: {
        trials: flaggedTrials.length,
        sampled: rows.filter((r) => r.stratum === "flagged").length,
        selection:
          "one criterion per flagged trial, chosen as the most suspicious " +
          "(source offers alternatives, tree has none). Targeted, not random: the " +
          "flagged error rate is an upper bound on these trials' average.",
      },
      unflagged: {
        trials: unflaggedTrials.length,
        criteriaAvailable: unflaggedUnits.length,
        sampled: rows.filter((r) => r.stratum === "unflagged").length,
        samplingRate:
          unflaggedUnits.length === 0
            ? 0
            : Number((Math.min(want, unflaggedUnits.length) / unflaggedUnits.length).toFixed(6)),
      },
    },
    instructions: INSTRUCTIONS,
    rowsWithoutSourceContext: rows.filter((r) => r.sourceContext === "").length,
    rows,
  };
}
