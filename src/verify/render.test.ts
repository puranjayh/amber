import { describe, expect, it } from "vitest";
import {
  criterionSide,
  hasDisjunction,
  leavesOf,
  renderCriterion,
  renderLeaf,
  renderNode,
  renderOutline,
} from "./render";
import { group, leaf } from "@/src/engine/testing";

describe("renderLeaf — the shapes a protocol actually uses", () => {
  it("renders an age floor and ceiling as a protocol would say them", () => {
    expect(renderLeaf(leaf({ id: "A", predicate: "age", operator: ">=", value: 18, unit: "years" })))
      .toBe("aged 18 years or older");
    expect(renderLeaf(leaf({ id: "A", predicate: "age", operator: "<=", value: 75, unit: "years" })))
      .toBe("aged 75 years or younger");
  });

  it("renders a washout from the patient's point of view", () => {
    expect(
      renderLeaf(leaf({ id: "W", predicate: "washout", operator: ">=", value: 21, unit: "days" })),
    ).toBe("at least 21 days since the last dose");
    expect(
      renderLeaf(leaf({ id: "W", predicate: "washout", operator: "<", value: 21, unit: "days" })),
    ).toBe("less than 21 days since the last dose");
  });

  it("renders ECOG the way a clinician says it", () => {
    expect(
      renderLeaf(
        leaf({ id: "P", predicate: "performance_status", analyte: "ECOG", operator: "<=", value: 1 }),
      ),
    ).toBe("ECOG 1 or better");
  });

  it("renders a drug-class exclusion with its resolved members", () => {
    const l = leaf({
      id: "E",
      type: "exclusion",
      predicate: "prior_therapy",
      operator: "in",
      drugClass: "EGFR_TKI",
      members: ["osimertinib", "erlotinib"],
      value: ["osimertinib", "erlotinib"],
    });
    expect(renderLeaf(l)).toBe('has had prior EGFR_TKI ("osimertinib" OR "erlotinib")');
  });

  it("renders a boolean therapy fact in the right direction", () => {
    const base = { id: "E", predicate: "prior_therapy", operator: "==", drugClass: "EGFR_TKI" } as const;
    expect(renderLeaf(leaf({ ...base, value: true }))).toContain("has had prior EGFR_TKI");
    expect(renderLeaf(leaf({ ...base, value: false }))).toContain("no prior EGFR_TKI");
  });

  it("renders a lab threshold with its unit", () => {
    expect(
      renderLeaf(
        leaf({ id: "L", predicate: "lab_value", analyte: "ANC", operator: ">=", value: 1500, unit: "/uL" }),
      ),
    ).toBe("ANC at least 1500 /uL");
  });

  it("spells out a recency window rather than smoothing it away", () => {
    // An omitted window is precisely the kind of error this review hunts, so the
    // sentence must never hide one.
    const l = leaf({
      id: "L",
      predicate: "biomarker",
      analyte: "EGFR",
      operator: "==",
      value: "L858R",
      maxAgeDays: 28,
    });
    expect(renderLeaf(l)).toBe('EGFR "L858R", measured within 28 days');
  });

  it("falls back to subject-comparison-value for anything unrecognised", () => {
    const l = leaf({ id: "L", predicate: "lab_value", analyte: "QTc", operator: ">", value: 470, unit: "ms" });
    expect(renderLeaf(l)).toBe("QTc more than 470 ms");
  });

  it("never emits JSON braces or a raw field name", () => {
    const l = leaf({
      id: "L",
      predicate: "biomarker",
      analyte: "ALK",
      operator: "in",
      value: ["rearranged", "fusion"],
    });
    const out = renderLeaf(l);
    expect(out).not.toMatch(/[{}]|kind|sourceSpan|maxAgeDays|"operator"/);
  });
});

describe("renderNode — the disjunction has to be unmissable", () => {
  const a = leaf({ id: "A", predicate: "diagnosis", operator: "==", value: "NSCLC" });
  const b = leaf({ id: "B", predicate: "staging", operator: "in", value: ["IIIA"] });

  it("shouts OR and whispers and", () => {
    expect(renderNode(group("OR", [a, b]))).toContain(" OR ");
    expect(renderNode(group("AND", [a, b]))).toContain(" and ");
    expect(renderNode(group("AND", [a, b]))).not.toContain(" OR ");
  });

  it("renders the example from the brief in the brief's shape", () => {
    const platinum = leaf({ id: "P1", predicate: "prior_therapy", operator: "in", value: ["platinum"] });
    const intolerant = leaf({ id: "P2", predicate: "comorbidity", operator: "==", value: "platinum-intolerant" });
    const taxane = leaf({ id: "P3", predicate: "prior_therapy", operator: "in", value: ["taxane"] });
    const tree = group("OR", [platinum, group("AND", [intolerant, taxane])]);
    expect(renderNode(tree)).toBe(
      'has had prior "platinum" OR (has "platinum-intolerant" and has had prior "taxane")',
    );
  });

  it("brackets a nested group so precedence cannot be misread", () => {
    const nested = group("AND", [a, group("OR", [b, a])]);
    expect(renderNode(nested)).toMatch(/\(.*OR.*\)/);
  });

  it("does not bracket the outermost group", () => {
    expect(renderNode(group("AND", [a, b])).startsWith("(")).toBe(false);
  });

  it("renders NOT of several children as the negated conjunction", () => {
    // Matches the engine's own De Morgan reading; a reviewer comparing the two
    // must not see them disagree.
    expect(renderNode(group("NOT", [a, b]))).toBe(
      'NOT (diagnosed with "NSCLC" and stage "IIIA")',
    );
  });

  it("frames inclusion and exclusion in words, not left to the reader", () => {
    expect(renderCriterion(a)).toBe('Must: diagnosed with "NSCLC"');
    expect(renderCriterion({ ...a, type: "exclusion" })).toBe('Excluded if: diagnosed with "NSCLC"');
  });

  it("says so when a group mixes both sides", () => {
    const mixed = group("AND", [a, { ...b, type: "exclusion" as const }]);
    expect(criterionSide(mixed)).toBe("mixed");
    expect(renderCriterion(mixed)).toMatch(/^Mixed inclusion and exclusion:/);
  });
});

describe("renderOutline", () => {
  const a = leaf({ id: "A", predicate: "diagnosis", operator: "==", value: "NSCLC" });
  const b = leaf({ id: "B", predicate: "staging", operator: "in", value: ["IIIA"] });

  it("heads each group with its operator so the shape is explicit", () => {
    expect(renderOutline(group("OR", [a, b]))[0]).toBe("- ANY of (OR):");
    expect(renderOutline(group("AND", [a, b]))[0]).toBe("- ALL of (and):");
    expect(renderOutline(group("NOT", [a]))[0]).toBe("- NOT:");
  });

  it("indents by depth", () => {
    const lines = renderOutline(group("AND", [group("OR", [a, b])]));
    expect(lines[1]).toMatch(/^ {2}- ANY of \(OR\):/);
    expect(lines[2]).toMatch(/^ {4}- /);
  });

  it("emits one line per leaf plus one per group", () => {
    expect(renderOutline(group("AND", [a, b, group("OR", [a])]))).toHaveLength(5);
  });
});

describe("hasDisjunction — the review's crux", () => {
  const a = leaf({ id: "A", predicate: "diagnosis", operator: "==", value: "NSCLC" });

  it("is true for an OR group at any depth", () => {
    expect(hasDisjunction(group("OR", [a, a]))).toBe(true);
    expect(hasDisjunction(group("AND", [a, group("AND", [group("OR", [a, a])])]))).toBe(true);
  });

  it("is false for a pure conjunction", () => {
    expect(hasDisjunction(group("AND", [a, a]))).toBe(false);
  });

  it("counts an `in` over several values as a disjunction", () => {
    // "one of these will do" is a disjunction however it is encoded, and a
    // reviewer must not be told a tree lacks alternatives when it has them.
    expect(
      hasDisjunction(leaf({ id: "L", predicate: "staging", operator: "in", value: ["IIIA", "IIIB"] })),
    ).toBe(true);
  });

  it("does not count a single-value `in`, or a `not_in`", () => {
    expect(hasDisjunction(leaf({ id: "L", predicate: "staging", operator: "in", value: ["IIIA"] }))).toBe(false);
    expect(
      hasDisjunction(leaf({ id: "L", predicate: "staging", operator: "not_in", value: ["IIIA", "IIIB"] })),
    ).toBe(false);
  });
});

describe("leavesOf", () => {
  it("returns occurrences in document order, including repeats", () => {
    const a = leaf({ id: "A", predicate: "diagnosis", operator: "==", value: "x" });
    expect(leavesOf(group("AND", [a, group("OR", [a])])).map((l) => l.id)).toEqual(["A", "A"]);
  });
});

describe("a yes/no leaf the compiler did not decompose", () => {
  it("uses the protocol sentence as the subject instead of saying 'has present'", () => {
    // NCT03178552 EXC-2 in the real corpus: the whole sentence became value:true.
    const l = leaf({
      id: "EXC-2",
      type: "exclusion",
      predicate: "comorbidity",
      operator: "==",
      value: true,
      sourceSpan: "Women who are pregnant or lactating",
    });
    expect(renderLeaf(l)).toBe('has flag: "Women who are pregnant or lactating"');
    expect(renderLeaf(l)).not.toContain("has present");
  });

  it("negates it in the right direction", () => {
    const l = leaf({
      id: "E",
      predicate: "comorbidity",
      operator: "==",
      value: false,
      sourceSpan: "History of ILD",
    });
    expect(renderLeaf(l)).toBe('does not have flag: "History of ILD"');
  });

  it("prefers a real analyte over the sentence when there is one", () => {
    const l = leaf({
      id: "E",
      predicate: "comorbidity",
      operator: "==",
      value: true,
      analyte: "ILD",
      sourceSpan: "History of interstitial lung disease",
    });
    expect(renderLeaf(l)).toBe("has ILD");
  });

  it("truncates a very long sentence rather than emitting a paragraph", () => {
    const long = "x".repeat(400);
    const out = renderLeaf(
      leaf({ id: "E", predicate: "comorbidity", operator: "==", value: true, sourceSpan: long }),
    );
    expect(out.length).toBeLessThan(150);
    expect(out).toContain("…");
  });

  it("handles a bare boolean on a predicate with no special phrasing", () => {
    const l = leaf({
      id: "E",
      predicate: "staging",
      operator: "==",
      value: true,
      sourceSpan: "Measurable disease per RECIST 1.1",
    });
    expect(renderLeaf(l)).toBe('flag: "Measurable disease per RECIST 1.1" is present');
  });
});
