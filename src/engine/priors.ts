/**
 * Value-of-information priors, resolved from `data/prevalence.json`.
 *
 * Every number the engine uses to rank "which test is worth ordering next" comes
 * from here, with the citation attached, rather than from whatever the compiler
 * guessed while reading protocol prose. A prior with no source is a made-up
 * number, and the whole point of the VOI ranking is that it is defensible.
 *
 * The engine stays pure: the table is passed in, never read from disk.
 *
 * ---------------------------------------------------------------------------
 * pFavorable IS POLARITY-AWARE, AND PREVALENCE IS NOT.
 *
 * `pFavorable` answers "how likely is resolving this to help this patient",
 * which is not the same as "how common is this alteration":
 *
 *   inclusion "EGFR L858R"        favourable = having it        ≈ 0.056
 *   exclusion "known ALK rearr."  favourable = NOT having it    ≈ 0.976
 *
 * Storing bare prevalence in both places would tell the worklist that an ALK
 * exclusion is almost worthless to resolve, when in fact it is nearly certain to
 * come back clear. So the resolver applies the operator's sense and then the
 * criterion's type, in that order — the same asymmetry `eligibilityVerdict`
 * applies to verdicts, in probability form.
 * ---------------------------------------------------------------------------
 *
 * CONDITIONAL ENTRIES ARE THE TRAP. Some rows in the file are not prevalences at
 * all; they are shares of a subgroup. `egfr-ex19del-share` is 45-60% *of EGFR
 * mutations*, not of NSCLC. Reading 0.525 as an absolute prior overstates exon-19
 * deletion in an unselected cohort by about sevenfold. Where the base is stated
 * and present in the same table, the resolver chains them properly
 * (0.525 x 0.1399 = 0.073) and cites both papers. Where the base is a clinical
 * state we cannot quantify — "acquired resistance after a first-generation EGFR
 * TKI" — the entry is refused and recorded in `unusable` rather than being
 * pressed into service. Failing closed is the only safe direction here.
 */
import { z } from "zod";
import type { CriterionLeaf, Predicate } from "@/src/contracts";

/** One row of `data/prevalence.json`. Extra fields are kept and ignored. */
export const PrevalenceRecord = z
  .object({
    id: z.string(),
    biomarker: z.string().optional(),
    alteration: z.string().optional(),
    prevalence: z.number().min(0).max(1).optional(),
    prevalenceMin: z.number().min(0).max(1).optional(),
    prevalenceMax: z.number().min(0).max(1).optional(),
    population: z.string().optional(),
    citation: z.string().optional(),
    note: z.string().optional(),
    /**
     * The id of the entry this one is a share of. Not yet in the file; when the
     * data lane adds it, chaining stops depending on the prose heuristic below.
     */
    conditionalOn: z.string().optional(),
    /** For a prior about something other than a biomarker. */
    predicate: z.string().optional(),
  })
  .loose();
export type PrevalenceRecord = z.infer<typeof PrevalenceRecord>;

export const PrevalenceFile = z.array(PrevalenceRecord);

/** Where a number came from, so a UI or a slide can say. */
export interface ResolvedPrior {
  /** Probability this criterion resolves favourably for the patient. */
  pFavorable: number;
  source:
    | "table" // a direct point prevalence
    | "table-range" // midpoint of a stated range
    | "table-chained" // a conditional share times its base
    | "table-sum" // several alternatives added
    | "table-gene" // the gene-level prior, for an unmatched variant
    | "leaf" // the compiler's value, kept because the table is silent
    | "default"; // documented fallback
  /** Entry ids used, for audit. */
  entryIds: string[];
  /** Citations for those entries. Every prior on screen can carry its source. */
  citations: string[];
  /** One sentence saying how the number was arrived at. */
  basis: string;
}

export interface PriorTableOptions {
  /**
   * Used when the table has nothing for a biomarker leaf. A coin flip: the least
   * informative honest choice, and deliberately not tuned to flatter the demo.
   *
   * It is also a hazard, and worth saying out loud — a uniform 0.5 beats a cited
   * 0.024, so an unpriored criterion outranks a well-sourced rare one. Read
   * `fallbackCount` and prior what you can.
   */
  defaultPFavorable?: number;
}

export const DEFAULT_PFAVORABLE = 0.5;

export interface PriorTable {
  /** The polarity-aware prior for one leaf, with its provenance. */
  resolve(leaf: CriterionLeaf): ResolvedPrior;
  /** Rows that cannot serve as absolute priors, and why. */
  unusable: { id: string; reason: string; suggestion?: string }[];
  /** How many `resolve` calls have fallen back to the default. */
  fallbackCount(): number;
  /** Rows accepted as absolute priors. */
  size: number;
}

/* ------------------------------------------------------------- vocabulary */

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * The compiler writes `ex19del`; the literature writes "exon 19 deletion". This
 * is the join. Kept small and explicit rather than fuzzy-matched — a wrong join
 * here silently substitutes one alteration's prevalence for another's.
 */
const ALTERATION_SYNONYMS: Readonly<Record<string, string>> = {
  ex19del: "exon 19 deletion",
  exon19del: "exon 19 deletion",
  "exon 19 del": "exon 19 deletion",
  "exon 19 deletions": "exon 19 deletion",
  del19: "exon 19 deletion",
  "e746_a750del": "exon 19 deletion",
  ex14skip: "exon 14 skipping",
  exon14skip: "exon 14 skipping",
  "exon 14 skip": "exon 14 skipping",
  rearranged: "rearrangement",
  rearrangements: "rearrangement",
  fusions: "fusion",
  fused: "fusion",
  amplified: "amplification",
  amplifications: "amplification",
  mutated: "mutation",
  mutant: "mutation",
  mutations: "mutation",
  positive: "mutation",
};

const canonicalAlteration = (raw: string): string => {
  const n = norm(raw);
  return ALTERATION_SYNONYMS[n] ?? n;
};

/** A prose signal that a row is a share of a subgroup rather than a prevalence. */
const SHARE_OF = /\bshare of\b/i;

/** Populations we cannot turn into an unselected-cohort prior at all. */
const UNQUANTIFIED_BASE = /\bresistance\b|\bprogress/i;

interface Entry {
  record: PrevalenceRecord;
  biomarker: string;
  alteration: string;
  /** Absolute prevalence, or the conditional share when `conditionalOn` is set. */
  value: number;
  fromRange: boolean;
  /** Id of the entry this is a share of, when it is one. */
  conditionalOn?: string;
}

/** A point value, or the midpoint of a stated range. */
function valueOf(r: PrevalenceRecord): { value: number; fromRange: boolean } | null {
  if (r.prevalence !== undefined) return { value: r.prevalence, fromRange: false };
  if (r.prevalenceMin !== undefined && r.prevalenceMax !== undefined) {
    return { value: (r.prevalenceMin + r.prevalenceMax) / 2, fromRange: true };
  }
  return null;
}

/* ------------------------------------------------------------ construction */

/**
 * Index a prevalence file for lookup.
 *
 * Rejected rows are not dropped silently — they land in `unusable` with a reason
 * and, where there is one, the field the data lane could add to rescue them.
 */
export function buildPriorTable(
  records: readonly PrevalenceRecord[],
  options: PriorTableOptions = {},
): PriorTable {
  const fallback = options.defaultPFavorable ?? DEFAULT_PFAVORABLE;
  const unusable: PriorTable["unusable"] = [];

  const byId = new Map<string, Entry>();
  /** `biomarker|alteration` → entry. First usable row wins; see below. */
  const byKey = new Map<string, Entry>();
  /** biomarker → entries, for the gene-level and numeric fallbacks. */
  const byBiomarker = new Map<string, Entry[]>();

  for (const record of records) {
    const v = valueOf(record);
    if (v === null) {
      unusable.push({
        id: record.id,
        reason: "no prevalence and no min/max range",
        suggestion: "add `prevalence`, or `prevalenceMin` and `prevalenceMax`",
      });
      continue;
    }
    if (record.biomarker === undefined || record.alteration === undefined) {
      unusable.push({ id: record.id, reason: "no biomarker/alteration to key on" });
      continue;
    }

    const population = record.population ?? "";
    const isShare = record.conditionalOn !== undefined || SHARE_OF.test(population);

    if (!isShare && UNQUANTIFIED_BASE.test(population)) {
      unusable.push({
        id: record.id,
        reason: `population is a clinical state we cannot size: "${population}"`,
        suggestion: "add `conditionalOn` naming the entry this is a share of",
      });
      continue;
    }

    const entry: Entry = {
      record,
      biomarker: norm(record.biomarker),
      alteration: canonicalAlteration(record.alteration),
      value: v.value,
      fromRange: v.fromRange,
      conditionalOn: record.conditionalOn,
    };

    if (isShare && entry.conditionalOn === undefined) {
      // "share of EGFR mutations" with no explicit base: infer the gene-level row
      // of the same biomarker, which is the only base the wording can mean.
      entry.conditionalOn = `${entry.biomarker}-mutation`;
    }

    byId.set(record.id, entry);
    const key = `${entry.biomarker}|${entry.alteration}`;
    // A point prevalence beats a range for the same key, and otherwise file order
    // decides — so two rows for the same alteration resolve the same way always.
    const held = byKey.get(key);
    if (held === undefined || (held.fromRange && !entry.fromRange)) byKey.set(key, entry);

    const list = byBiomarker.get(entry.biomarker);
    if (list === undefined) byBiomarker.set(entry.biomarker, [entry]);
    else list.push(entry);
  }

  /** Resolve an entry to an absolute prevalence, chaining a share onto its base. */
  const absolute = (
    entry: Entry,
  ): { value: number; ids: string[]; citations: string[]; chained: boolean } | null => {
    if (entry.conditionalOn === undefined) {
      return {
        value: entry.value,
        ids: [entry.record.id],
        citations: entry.record.citation === undefined ? [] : [entry.record.citation],
        chained: false,
      };
    }
    const base = byId.get(entry.conditionalOn);
    if (base === undefined || base.conditionalOn !== undefined) return null;
    return {
      value: entry.value * base.value,
      ids: [entry.record.id, base.record.id],
      citations: [entry.record.citation, base.record.citation].filter(
        (c): c is string => c !== undefined,
      ),
      chained: true,
    };
  };

  // Record the shares whose base is missing, so nobody has to guess why.
  for (const entry of byId.values()) {
    if (entry.conditionalOn !== undefined && absolute(entry) === null) {
      unusable.push({
        id: entry.record.id,
        reason: `a share of "${entry.conditionalOn}", which is not an absolute entry here`,
        suggestion: `add an absolute entry with id "${entry.conditionalOn}", or set conditionalOn`,
      });
    }
  }

  const lookup = (biomarker: string, alteration: string): Entry | undefined =>
    byKey.get(`${norm(biomarker)}|${canonicalAlteration(alteration)}`);

  /**
   * A numeric biomarker threshold — "PD-L1 TPS >= 50%", "TMB >= 10". The file
   * states these in prose, so match on the number plus a comparator pointing the
   * same way. Best-effort and deliberately narrow; an explicit key from the data
   * lane would retire it.
   */
  const numericLookup = (biomarker: string, value: number, operator: string): Entry | undefined => {
    const candidates = byBiomarker.get(norm(biomarker));
    if (candidates === undefined) return undefined;
    const wantsAtLeast = operator === ">=" || operator === ">";
    return candidates.find((e) => {
      if (!e.alteration.includes(String(value))) return false;
      const hasGe = /≥|>=/.test(e.alteration);
      const hasLe = /≤|<=/.test(e.alteration);
      return wantsAtLeast ? hasGe || !hasLe : hasLe || !hasGe;
    });
  };

  /** The gene-level prior, for a variant the file does not break out. */
  const geneLevel = (biomarker: string): Entry | undefined => {
    const list = byBiomarker.get(norm(biomarker));
    if (list === undefined) return undefined;
    return (
      list.find((e) => e.alteration === "mutation" && e.conditionalOn === undefined) ??
      list.find((e) => e.conditionalOn === undefined)
    );
  };

  let fallbacks = 0;

  /**
   * Memoised per leaf, because a prior depends only on the criterion and
   * `evaluate` asks for it once per cell — 21 million times in a full cube run.
   * `fallbackCount` therefore counts distinct criteria that fell back, not
   * calls, which is the number worth knowing anyway: it is coverage.
   */
  const RESOLVED = new WeakMap<CriterionLeaf, ResolvedPrior>();

  const resolveUncached = (leaf: CriterionLeaf): ResolvedPrior => {
    const analyte = leaf.analyte;
    const negativeOperator = leaf.operator === "not_in" || leaf.operator === "!=";

    /** Turn P(predicate holds) into P(this resolves well for the patient). */
    const favourable = (pHolds: number): number => {
      const pSatisfied = negativeOperator ? 1 - pHolds : pHolds;
      return leaf.type === "exclusion" ? 1 - pSatisfied : pSatisfied;
    };

    const polarity = (): string =>
      leaf.type === "exclusion"
        ? "inverted because this is an exclusion (favourable means not having it)"
        : "taken as-is for an inclusion";

    if (analyte !== undefined) {
      const values = Array.isArray(leaf.value) ? leaf.value : [leaf.value];

      // Several named alternatives: add them. Variants of one gene are close
      // enough to disjoint for this to be the right arithmetic, and the cap
      // keeps a sloppy table from producing a probability above one.
      if (values.length > 1 && values.every((v) => typeof v === "string")) {
        const resolvedParts = (values as string[]).map((v) => {
          const e = lookup(analyte, v);
          return e === undefined ? null : absolute(e);
        });
        if (resolvedParts.every((r) => r !== null)) {
          const parts = resolvedParts as NonNullable<(typeof resolvedParts)[number]>[];
          const pHolds = Math.min(1, parts.reduce((sum, r) => sum + r.value, 0));
          return {
            pFavorable: favourable(pHolds),
            source: "table-sum",
            entryIds: parts.flatMap((r) => r.ids),
            citations: [...new Set(parts.flatMap((r) => r.citations))],
            basis: `sum of ${parts.length} alternatives for ${analyte} = ${pHolds.toFixed(4)}, ${polarity()}`,
          };
        }
      }

      // One named alteration.
      if (typeof leaf.value === "string") {
        const entry = lookup(analyte, leaf.value);
        const abs = entry === undefined ? null : absolute(entry);
        if (abs !== null) {
          return {
            pFavorable: favourable(abs.value),
            source: abs.chained ? "table-chained" : entry!.fromRange ? "table-range" : "table",
            entryIds: abs.ids,
            citations: abs.citations,
            basis: abs.chained
              ? `conditional share times its base = ${abs.value.toFixed(4)}, ${polarity()}`
              : `${entry!.fromRange ? "midpoint of the stated range" : "stated prevalence"} ${abs.value.toFixed(4)}, ${polarity()}`,
          };
        }
      }

      // A numeric threshold on a continuous marker.
      if (typeof leaf.value === "number") {
        const entry = numericLookup(analyte, leaf.value, leaf.operator);
        const abs = entry === undefined ? null : absolute(entry);
        if (abs !== null) {
          return {
            pFavorable: favourable(abs.value),
            source: entry!.fromRange ? "table-range" : "table",
            entryIds: abs.ids,
            citations: abs.citations,
            basis: `threshold matched "${entry!.record.alteration}" at ${abs.value.toFixed(4)}, ${polarity()}`,
          };
        }
      }

      // Nothing for this variant: the gene-level prior is the closest honest
      // number, and it is an over-estimate for a specific variant. Say so.
      const gene = geneLevel(analyte);
      const geneAbs = gene === undefined ? null : absolute(gene);
      if (geneAbs !== null && leaf.predicate === "biomarker") {
        return {
          pFavorable: favourable(geneAbs.value),
          source: "table-gene",
          entryIds: geneAbs.ids,
          citations: geneAbs.citations,
          basis: `no entry for this variant; gene-level ${analyte} prior ${geneAbs.value.toFixed(4)} used, which over-estimates a single variant, ${polarity()}`,
        };
      }
    }

    // The table is silent. Keep the compiler's number when it has one, outside
    // the table's own domain — overriding a plausible lab prior with a coin flip
    // would be worse than leaving it alone.
    if (leaf.predicate !== "biomarker" && leaf.pFavorable !== undefined) {
      return {
        pFavorable: leaf.pFavorable,
        source: "leaf",
        entryIds: [],
        citations: [],
        basis: "no entry in the prevalence table; kept the compiled value, which is uncited",
      };
    }

    fallbacks++;
    return {
      pFavorable: fallback,
      source: "default",
      entryIds: [],
      citations: [],
      basis: `no entry in the prevalence table; documented default ${fallback}`,
    };
  };

  const resolve = (leaf: CriterionLeaf): ResolvedPrior => {
    const cached = RESOLVED.get(leaf);
    if (cached !== undefined) return cached;
    const computed = resolveUncached(leaf);
    RESOLVED.set(leaf, computed);
    return computed;
  };

  return { resolve, unusable, fallbackCount: () => fallbacks, size: byKey.size };
}

/**
 * Parse a prevalence file, keeping the rows that validate and reporting the rest.
 *
 * Tolerant on purpose: one malformed row in a file another lane is still writing
 * should cost that row, not the whole VOI ranking. Contract rule 5 says reject
 * rather than coerce, and that is what this does — per row.
 */
export function parsePrevalenceFile(
  raw: unknown,
): { records: PrevalenceRecord[]; rejected: { index: number; error: string }[] } {
  if (!Array.isArray(raw)) {
    throw new TypeError("prevalence file must be a JSON array of records");
  }
  const records: PrevalenceRecord[] = [];
  const rejected: { index: number; error: string }[] = [];
  raw.forEach((row, index) => {
    const parsed = PrevalenceRecord.safeParse(row);
    if (parsed.success) records.push(parsed.data);
    else rejected.push({ index, error: parsed.error.issues.map((i) => i.message).join("; ") });
  });
  return { records, rejected };
}

/** Predicates the prevalence file is expected to cover. */
export const PRIOR_DOMAIN: readonly Predicate[] = ["biomarker"];
