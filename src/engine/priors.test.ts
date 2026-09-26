import { existsSync, readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PFAVORABLE,
  buildPriorTable,
  parsePrevalenceFile,
  type PrevalenceRecord,
} from "./priors";
import { evaluate } from "./evaluate";
import { leaf, patient, trial } from "./testing";

const ASOF = "2026-09-25";

/** A miniature stand-in shaped exactly like data/prevalence.json. */
const RECORDS: PrevalenceRecord[] = [
  {
    id: "egfr-mutation",
    biomarker: "EGFR",
    alteration: "mutation",
    prevalence: 0.1399,
    population: "9,450 NSCLC specimens",
    citation: "Huang 2021",
  },
  {
    id: "alk-rearrangement",
    biomarker: "ALK",
    alteration: "rearrangement",
    prevalence: 0.0241,
    population: "9,450 NSCLC specimens",
    citation: "Huang 2021",
  },
  {
    id: "pdl1-tps-ge-50",
    biomarker: "PD-L1",
    alteration: "TPS ≥ 50%",
    prevalence: 0.3053,
    population: "9,450 NSCLC specimens",
    citation: "Huang 2021",
  },
  {
    id: "egfr-ex19del-share",
    biomarker: "EGFR",
    alteration: "exon 19 deletion",
    prevalenceMin: 0.45,
    prevalenceMax: 0.6,
    population: "EGFR-mutant NSCLC, share of EGFR mutations rather than of all NSCLC",
    citation: "Fois 2021",
  },
  {
    id: "egfr-l858r-share",
    biomarker: "EGFR",
    alteration: "L858R",
    prevalenceMin: 0.35,
    prevalenceMax: 0.45,
    population: "EGFR-mutant NSCLC, share of EGFR mutations rather than of all NSCLC",
    citation: "Fois 2021",
  },
  {
    id: "egfr-t790m-resistance",
    biomarker: "EGFR",
    alteration: "T790M",
    prevalence: 0.5,
    population: "Acquired resistance after a first-generation EGFR TKI",
    citation: "Fois 2021",
  },
  {
    id: "met-exon14-skipping",
    biomarker: "MET",
    alteration: "exon 14 skipping",
    prevalenceMin: 0.01,
    prevalenceMax: 0.1,
    population: "NSCLC",
    citation: "Fois 2021",
  },
];

const table = buildPriorTable(RECORDS);

const bio = (over: Partial<Parameters<typeof leaf>[0]> = {}) =>
  leaf({ id: "L", predicate: "biomarker", operator: "==", tier: 0, ...over });

describe("a direct point prevalence", () => {
  it("is used as-is for an inclusion", () => {
    const p = table.resolve(bio({ analyte: "ALK", value: "rearrangement" }));
    expect(p.pFavorable).toBeCloseTo(0.0241, 6);
    expect(p.source).toBe("table");
    expect(p.citations).toEqual(["Huang 2021"]);
  });

  it("carries the entry id and a readable basis", () => {
    const p = table.resolve(bio({ analyte: "ALK", value: "rearrangement" }));
    expect(p.entryIds).toEqual(["alk-rearrangement"]);
    expect(p.basis).toMatch(/stated prevalence 0.0241/);
  });

  it("joins the compiler's vocabulary to the literature's", () => {
    // "rearranged" in a compiled leaf, "rearrangement" in the paper.
    expect(table.resolve(bio({ analyte: "ALK", value: "rearranged" })).pFavorable).toBeCloseTo(
      0.0241,
      6,
    );
    expect(table.resolve(bio({ analyte: "alk", value: "REARRANGED" })).source).toBe("table");
  });
});

describe("polarity — the thing bare prevalence gets wrong", () => {
  it("inverts for an exclusion, because favourable means not having it", () => {
    const p = table.resolve(bio({ analyte: "ALK", value: "rearrangement", type: "exclusion" }));
    expect(p.pFavorable).toBeCloseTo(1 - 0.0241, 6);
    expect(p.basis).toMatch(/inverted because this is an exclusion/);
  });

  it("makes resolving a rare exclusion nearly certain to help, not nearly worthless", () => {
    const inc = table.resolve(bio({ analyte: "ALK", value: "rearrangement" }));
    const exc = table.resolve(bio({ analyte: "ALK", value: "rearrangement", type: "exclusion" }));
    expect(exc.pFavorable).toBeGreaterThan(0.9);
    expect(inc.pFavorable).toBeLessThan(0.1);
  });

  it("inverts again for a negative operator", () => {
    // "not_in [rearrangement]" is satisfied by NOT having it.
    const p = table.resolve(
      bio({ analyte: "ALK", operator: "not_in", value: ["rearrangement"] }),
    );
    expect(p.pFavorable).toBeCloseTo(1 - 0.0241, 6);
  });

  it("double inversion returns to the prevalence itself", () => {
    const p = table.resolve(
      bio({ analyte: "ALK", operator: "not_in", value: ["rearrangement"], type: "exclusion" }),
    );
    expect(p.pFavorable).toBeCloseTo(0.0241, 6);
  });

  it("keeps every prior a probability", () => {
    for (const type of ["inclusion", "exclusion"] as const) {
      for (const operator of ["==", "!=", "in", "not_in"] as const) {
        const value = operator === "in" || operator === "not_in" ? ["rearrangement"] : "rearrangement";
        const p = table.resolve(bio({ analyte: "ALK", operator, value, type }));
        expect(p.pFavorable).toBeGreaterThanOrEqual(0);
        expect(p.pFavorable).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("conditional entries — the sevenfold trap", () => {
  it("chains a share onto its base instead of reading it as a prevalence", () => {
    // 0.525 of EGFR mutations, and EGFR mutations are 0.1399 of NSCLC.
    const p = table.resolve(bio({ analyte: "EGFR", value: "ex19del" }));
    expect(p.pFavorable).toBeCloseTo(0.525 * 0.1399, 6);
    expect(p.source).toBe("table-chained");
  });

  it("never reads the raw share as an absolute prior", () => {
    const p = table.resolve(bio({ analyte: "EGFR", value: "exon 19 deletion" }));
    expect(p.pFavorable).not.toBeCloseTo(0.525, 3);
    expect(p.pFavorable).toBeLessThan(0.1);
  });

  it("cites both papers in the chain", () => {
    const p = table.resolve(bio({ analyte: "EGFR", value: "ex19del" }));
    expect(p.citations.sort()).toEqual(["Fois 2021", "Huang 2021"]);
    expect(p.entryIds).toEqual(["egfr-ex19del-share", "egfr-mutation"]);
  });

  it("refuses a share whose base is a clinical state it cannot size", () => {
    // "Acquired resistance after a first-generation EGFR TKI" is not a cohort we
    // can put a number on, so T790M falls through to the gene-level prior.
    const p = table.resolve(bio({ analyte: "EGFR", value: "T790M" }));
    expect(p.source).toBe("table-gene");
    expect(p.pFavorable).toBeCloseTo(0.1399, 6);
  });

  it("records why a row was refused, and what would rescue it", () => {
    const refused = table.unusable.find((u) => u.id === "egfr-t790m-resistance");
    expect(refused).toBeDefined();
    expect(refused!.reason).toMatch(/clinical state/);
    expect(refused!.suggestion).toMatch(/conditionalOn/);
  });

  it("uses an explicit conditionalOn in preference to the prose", () => {
    const explicit = buildPriorTable([
      RECORDS[0],
      {
        id: "egfr-weird-share",
        biomarker: "EGFR",
        alteration: "G719X",
        prevalence: 0.05,
        population: "some wording the heuristic would never catch",
        conditionalOn: "egfr-mutation",
        citation: "Fois 2021",
      },
    ]);
    const p = explicit.resolve(bio({ analyte: "EGFR", value: "G719X" }));
    expect(p.pFavorable).toBeCloseTo(0.05 * 0.1399, 6);
    expect(p.source).toBe("table-chained");
  });

  it("reports a share whose named base is missing", () => {
    const orphan = buildPriorTable([
      {
        id: "orphan",
        biomarker: "EGFR",
        alteration: "L861Q",
        prevalence: 0.02,
        conditionalOn: "nowhere",
      },
    ]);
    expect(orphan.unusable.some((u) => u.id === "orphan" && /not an absolute entry/.test(u.reason))).toBe(
      true,
    );
  });
});

describe("ranges", () => {
  it("takes the midpoint and says so", () => {
    const p = table.resolve(bio({ analyte: "MET", value: "exon 14 skipping" }));
    expect(p.pFavorable).toBeCloseTo(0.055, 6);
    expect(p.source).toBe("table-range");
    expect(p.basis).toMatch(/midpoint of the stated range/);
  });

  it("prefers a point value over a range for the same alteration", () => {
    const both = buildPriorTable([
      { id: "ranged", biomarker: "ERBB2", alteration: "mutation", prevalenceMin: 0.02, prevalenceMax: 0.03, population: "Lung adenocarcinoma" },
      { id: "point", biomarker: "ERBB2", alteration: "mutation", prevalence: 0.0171, population: "9,450 NSCLC specimens" },
    ]);
    const p = both.resolve(bio({ analyte: "ERBB2", value: "mutation" }));
    expect(p.entryIds).toEqual(["point"]);
    expect(p.pFavorable).toBeCloseTo(0.0171, 6);
  });

  it("resolves the same way whatever order the duplicates appear in", () => {
    const flipped = buildPriorTable([
      { id: "point", biomarker: "ERBB2", alteration: "mutation", prevalence: 0.0171 },
      { id: "ranged", biomarker: "ERBB2", alteration: "mutation", prevalenceMin: 0.02, prevalenceMax: 0.03 },
    ]);
    expect(flipped.resolve(bio({ analyte: "ERBB2", value: "mutation" })).entryIds).toEqual(["point"]);
  });
});

describe("several alternatives", () => {
  it("adds the members of an in-list", () => {
    const p = table.resolve(bio({ analyte: "EGFR", operator: "in", value: ["ex19del", "L858R"] }));
    // (0.525 + 0.40) x 0.1399, each chained onto the gene-level prior.
    expect(p.pFavorable).toBeCloseTo((0.525 + 0.4) * 0.1399, 5);
    expect(p.source).toBe("table-sum");
  });

  it("cites every paper behind the sum, once each", () => {
    const p = table.resolve(bio({ analyte: "EGFR", operator: "in", value: ["ex19del", "L858R"] }));
    expect(p.citations.sort()).toEqual(["Fois 2021", "Huang 2021"]);
  });

  it("falls back to the gene-level prior when a member is missing", () => {
    const p = table.resolve(bio({ analyte: "EGFR", operator: "in", value: ["ex19del", "G719X"] }));
    expect(p.source).toBe("table-gene");
  });

  it("never exceeds one, however sloppy the table", () => {
    const loose = buildPriorTable([
      { id: "a", biomarker: "X", alteration: "one", prevalence: 0.8 },
      { id: "b", biomarker: "X", alteration: "two", prevalence: 0.9 },
    ]);
    expect(loose.resolve(bio({ analyte: "X", operator: "in", value: ["one", "two"] })).pFavorable).toBe(1);
  });
});

describe("numeric thresholds", () => {
  it("matches a continuous marker stated in prose", () => {
    const p = table.resolve(
      bio({ analyte: "PD-L1", operator: ">=", value: 50, unit: "%" }),
    );
    expect(p.pFavorable).toBeCloseTo(0.3053, 6);
    expect(p.basis).toMatch(/TPS ≥ 50%/);
  });

  it("does not match a threshold pointing the other way", () => {
    const p = table.resolve(bio({ analyte: "PD-L1", operator: "<", value: 1 }));
    expect(p.source).not.toBe("table");
  });
});

describe("the fallbacks", () => {
  it("uses the gene-level prior for an unlisted variant, and warns it over-estimates", () => {
    const p = table.resolve(bio({ analyte: "EGFR", value: "G719X" }));
    expect(p.source).toBe("table-gene");
    expect(p.basis).toMatch(/over-estimates a single variant/);
  });

  it("uses the documented default for a biomarker the table has never heard of", () => {
    const p = table.resolve(bio({ analyte: "NRG1", value: "fusion" }));
    expect(p.pFavorable).toBe(DEFAULT_PFAVORABLE);
    expect(p.source).toBe("default");
    expect(p.basis).toMatch(/documented default/);
  });

  it("honours a different default", () => {
    const strict = buildPriorTable(RECORDS, { defaultPFavorable: 0.05 });
    expect(strict.resolve(bio({ analyte: "NRG1", value: "fusion" })).pFavorable).toBe(0.05);
  });

  it("counts the criteria that fell back, so the made-up share is auditable", () => {
    const counted = buildPriorTable(RECORDS);
    expect(counted.fallbackCount()).toBe(0);
    counted.resolve(bio({ id: "A", analyte: "NRG1", value: "fusion" }));
    counted.resolve(bio({ id: "B", analyte: "FGFR1", value: "fusion" }));
    expect(counted.fallbackCount()).toBe(2);
  });

  it("counts a criterion once however often it is resolved", () => {
    // resolve() is memoised per leaf because evaluate() calls it per cell.
    const counted = buildPriorTable(RECORDS);
    const l = bio({ analyte: "NRG1", value: "fusion" });
    for (let i = 0; i < 5; i++) expect(counted.resolve(l).source).toBe("default");
    expect(counted.fallbackCount()).toBe(1);
  });

  it("keeps a compiled prior outside the table's domain rather than overwriting it", () => {
    // A lab threshold is not something a biomarker prevalence file can speak to,
    // so replacing a plausible compiled value with a coin flip would be worse.
    const lab = leaf({ id: "L", predicate: "lab_value", analyte: "ANC", operator: ">=", value: 1500, pFavorable: 0.9 });
    const p = table.resolve(lab);
    expect(p.pFavorable).toBe(0.9);
    expect(p.source).toBe("leaf");
    expect(p.basis).toMatch(/uncited/);
  });

  it("falls to the default for a leaf with no analyte and no compiled prior", () => {
    expect(table.resolve(leaf({ id: "L", predicate: "biomarker", value: "x" })).source).toBe("default");
  });
});

describe("parsing a file another lane is still writing", () => {
  it("keeps the good rows and reports the bad ones", () => {
    const { records, rejected } = parsePrevalenceFile([
      RECORDS[0],
      { id: "bad", prevalence: "not a number" },
      RECORDS[1],
    ]);
    expect(records.map((r) => r.id)).toEqual(["egfr-mutation", "alk-rearrangement"]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].index).toBe(1);
  });

  it("keeps fields it does not know about", () => {
    const { records } = parsePrevalenceFile([{ ...RECORDS[0], pmid: "34257540", nTested: 9450 }]);
    expect(records[0].pmid).toBe("34257540");
  });

  it("refuses something that is not a list of records", () => {
    expect(() => parsePrevalenceFile({ egfr: 0.14 })).toThrow(TypeError);
  });

  it("reports a row with no usable number", () => {
    const t = buildPriorTable([{ id: "empty", biomarker: "EGFR", alteration: "mutation" }]);
    expect(t.unusable[0]).toMatchObject({ id: "empty" });
    expect(t.unusable[0].suggestion).toMatch(/prevalenceMin/);
  });
});

describe("wired into evaluate", () => {
  const alkExclusion = leaf({
    id: "EXC-alk",
    type: "exclusion",
    predicate: "biomarker",
    analyte: "ALK",
    operator: "==",
    value: "rearrangement",
    tier: 0,
    pFavorable: 0.02, // what the compiler guessed
    sourceSpan: "Known ALK rearrangement",
  });

  it("overrides the compiler's guess with the cited prior", () => {
    const t = trial({ criteria: [alkExclusion] });
    const p = patient({ id: "PT-1", age: 60 });
    expect(evaluate(p, t, ASOF).cells[0].pFavorable).toBe(0.02);
    expect(evaluate(p, t, ASOF, { priors: table }).cells[0].pFavorable).toBeCloseTo(0.9759, 4);
  });

  it("changes expectedValue accordingly", () => {
    const t = trial({ criteria: [alkExclusion] });
    const p = patient({ id: "PT-1", age: 60 });
    const without = evaluate(p, t, ASOF).expectedValue;
    const withPriors = evaluate(p, t, ASOF, { priors: table }).expectedValue;
    expect(withPriors).toBeGreaterThan(without);
  });

  it("leaves everything alone when no table is supplied", () => {
    const t = trial({ criteria: [alkExclusion] });
    const p = patient({ id: "PT-1", age: 60 });
    expect(evaluate(p, t, ASOF)).toEqual(evaluate(p, t, ASOF));
  });

  it("does not disturb verdicts, only the priors", () => {
    const t = trial({ criteria: [alkExclusion] });
    const p = patient({ id: "PT-1", age: 60 });
    const a = evaluate(p, t, ASOF);
    const b = evaluate(p, t, ASOF, { priors: table });
    expect(b.cells[0].verdict).toBe(a.cells[0].verdict);
    expect(b.eliminated).toBe(a.eliminated);
  });
});

/* ------------------------------------------ against the real file, once it lands */

/**
 * Point AMBER_PREVALENCE at a file to check against one that has not been merged
 * yet. Guarded with a plain `if` rather than `describe.skipIf`, because a skipped
 * suite's body still runs at collection time and would read a missing file.
 */
const REAL = process.env.AMBER_PREVALENCE ?? resolvePath(process.cwd(), "data/prevalence.json");

if (!existsSync(REAL)) {
  describe.skip("data/prevalence.json — not landed yet", () => {
    it("lights up on its own once the data lane merges it", () => {});
  });
} else {
  describe("data/prevalence.json", () => {
  const { records, rejected } = parsePrevalenceFile(JSON.parse(readFileSync(REAL, "utf8")));
  const real = buildPriorTable(records);

  it("parses with no rejected rows", () => {
    expect(rejected).toEqual([]);
    expect(records.length).toBeGreaterThan(10);
  });

  it("every usable row carries a citation", () => {
    for (const r of records) expect(r.citation, r.id).toBeTruthy();
  });

  it("resolves the fixture's EGFR arm to a cited, chained number", () => {
    const p = real.resolve(
      bio({ analyte: "EGFR", operator: "in", value: ["ex19del", "L858R"] }),
    );
    expect(p.source).toBe("table-sum");
    expect(p.pFavorable).toBeGreaterThan(0.05);
    expect(p.pFavorable).toBeLessThan(0.2);
    expect(p.citations.length).toBeGreaterThan(0);
  });

  it("never turns a conditional share into an absolute prior", () => {
    for (const value of ["ex19del", "L858R"]) {
      const p = real.resolve(bio({ analyte: "EGFR", value }));
      expect(p.pFavorable, value).toBeLessThan(0.2);
    }
  });
});
}
