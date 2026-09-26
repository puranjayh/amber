import { describe, expect, it } from "vitest";
import type { Verdict } from "@/src/contracts";
import { AND_IDENTITY, OR_IDENTITY, and, combine, not, or } from "./kleene";

const ALL: Verdict[] = ["PASS", "FAIL", "UNKNOWN"];

/** Every ordered pair of verdicts — 9 of them. Cheap, so be exhaustive. */
const PAIRS: [Verdict, Verdict][] = ALL.flatMap((a) =>
  ALL.map((b) => [a, b] as [Verdict, Verdict]),
);

describe("and", () => {
  it("matches the contract's truth table for every pair", () => {
    const table: Record<string, Verdict> = {
      "PASS,PASS": "PASS",
      "PASS,FAIL": "FAIL",
      "PASS,UNKNOWN": "UNKNOWN",
      "FAIL,PASS": "FAIL",
      "FAIL,FAIL": "FAIL",
      "FAIL,UNKNOWN": "FAIL",
      "UNKNOWN,PASS": "UNKNOWN",
      "UNKNOWN,FAIL": "FAIL",
      "UNKNOWN,UNKNOWN": "UNKNOWN",
    };
    for (const [a, b] of PAIRS) {
      expect(and([a, b]), `and(${a}, ${b})`).toBe(table[`${a},${b}`]);
    }
  });

  it("lets a single FAIL absorb any number of PASSes and UNKNOWNs", () => {
    expect(and(["PASS", "PASS", "UNKNOWN", "FAIL", "PASS"])).toBe("FAIL");
  });

  it("is UNKNOWN when nothing failed but something is silent", () => {
    expect(and(["PASS", "PASS", "UNKNOWN"])).toBe("UNKNOWN");
  });

  it("is PASS only when every child passed", () => {
    expect(and(["PASS", "PASS", "PASS"])).toBe("PASS");
  });

  it("is vacuously PASS for no children", () => {
    expect(and([])).toBe("PASS");
    expect(AND_IDENTITY).toBe("PASS");
  });

  it("is commutative", () => {
    for (const [a, b] of PAIRS) expect(and([a, b])).toBe(and([b, a]));
  });

  it("is associative", () => {
    for (const a of ALL)
      for (const b of ALL)
        for (const c of ALL)
          expect(and([and([a, b]), c]), `${a},${b},${c}`).toBe(
            and([a, and([b, c])]),
          );
  });
});

describe("or", () => {
  it("matches the contract's truth table for every pair", () => {
    const table: Record<string, Verdict> = {
      "PASS,PASS": "PASS",
      "PASS,FAIL": "PASS",
      "PASS,UNKNOWN": "PASS",
      "FAIL,PASS": "PASS",
      "FAIL,FAIL": "FAIL",
      "FAIL,UNKNOWN": "UNKNOWN",
      "UNKNOWN,PASS": "PASS",
      "UNKNOWN,FAIL": "UNKNOWN",
      "UNKNOWN,UNKNOWN": "UNKNOWN",
    };
    for (const [a, b] of PAIRS) {
      expect(or([a, b]), `or(${a}, ${b})`).toBe(table[`${a},${b}`]);
    }
  });

  it("lets a single PASS absorb any number of FAILs and UNKNOWNs", () => {
    expect(or(["FAIL", "UNKNOWN", "FAIL", "PASS"])).toBe("PASS");
  });

  it("is UNKNOWN when nothing passed but something is silent", () => {
    expect(or(["FAIL", "FAIL", "UNKNOWN"])).toBe("UNKNOWN");
  });

  it("is FAIL only when every child failed", () => {
    expect(or(["FAIL", "FAIL"])).toBe("FAIL");
  });

  it("is vacuously FAIL for no children", () => {
    expect(or([])).toBe("FAIL");
    expect(OR_IDENTITY).toBe("FAIL");
  });

  it("is commutative", () => {
    for (const [a, b] of PAIRS) expect(or([a, b])).toBe(or([b, a]));
  });

  it("is associative", () => {
    for (const a of ALL)
      for (const b of ALL)
        for (const c of ALL)
          expect(or([or([a, b]), c]), `${a},${b},${c}`).toBe(or([a, or([b, c])]));
  });
});

describe("not", () => {
  it("swaps PASS and FAIL", () => {
    expect(not("PASS")).toBe("FAIL");
    expect(not("FAIL")).toBe("PASS");
  });

  it("leaves UNKNOWN alone — negating silence does not create knowledge", () => {
    expect(not("UNKNOWN")).toBe("UNKNOWN");
  });

  it("is its own inverse", () => {
    for (const v of ALL) expect(not(not(v))).toBe(v);
  });
});

describe("De Morgan", () => {
  it("NOT(a AND b) === NOT a OR NOT b", () => {
    for (const [a, b] of PAIRS) {
      expect(not(and([a, b])), `${a},${b}`).toBe(or([not(a), not(b)]));
    }
  });

  it("NOT(a OR b) === NOT a AND NOT b", () => {
    for (const [a, b] of PAIRS) {
      expect(not(or([a, b])), `${a},${b}`).toBe(and([not(a), not(b)]));
    }
  });
});

describe("combine", () => {
  it("dispatches to and / or", () => {
    expect(combine("AND", ["PASS", "UNKNOWN"])).toBe("UNKNOWN");
    expect(combine("OR", ["PASS", "UNKNOWN"])).toBe("PASS");
  });

  it("negates a single NOT child", () => {
    for (const v of ALL) expect(combine("NOT", [v])).toBe(not(v));
  });

  it("negates the conjunction of several NOT children, not each one", () => {
    // NOT(PASS AND FAIL) = NOT(FAIL) = PASS.  Per-child negation would give
    // (FAIL, PASS) and lose the grouping entirely.
    expect(combine("NOT", ["PASS", "FAIL"])).toBe("PASS");
    expect(combine("NOT", ["PASS", "PASS"])).toBe("FAIL");
    expect(combine("NOT", ["PASS", "UNKNOWN"])).toBe("UNKNOWN");
  });
});

describe("rule 4 — UNKNOWN never manufactures a FAIL", () => {
  it("holds for AND, OR and NOT over all-UNKNOWN inputs of any arity", () => {
    for (let n = 1; n <= 6; n++) {
      const silent: Verdict[] = Array.from({ length: n }, () => "UNKNOWN");
      expect(and(silent)).toBe("UNKNOWN");
      expect(or(silent)).toBe("UNKNOWN");
      expect(combine("NOT", silent)).toBe("UNKNOWN");
    }
  });

  it("holds when UNKNOWNs are mixed with PASSes only", () => {
    // Nothing contradicts anything, so no operator may report a contradiction.
    expect(and(["PASS", "UNKNOWN", "PASS", "UNKNOWN"])).toBe("UNKNOWN");
    expect(or(["PASS", "UNKNOWN", "PASS", "UNKNOWN"])).toBe("PASS");
  });
});
