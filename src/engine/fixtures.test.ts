/**
 * Conformance against P4's hand-built fixtures — the 04:00 integration gate.
 *
 * `fixtures/cube.sample.json` is a `PairResult[]` worked out by hand, before
 * the engine ran, for the three demo patients against the three demo trials.
 * That makes it an oracle rather than a snapshot: if the engine and the oracle
 * disagree, one of us is wrong about the contract and it is worth an argument,
 * not a regenerated file. Never overwrite the fixture to make this pass.
 *
 * The suite self-skips while `fixtures/` is absent, so the engine lane is never
 * blocked on the data lane and these tests light up on their own once P1 merges
 * the fixtures to `main`. Point AMBER_FIXTURES at a directory to run them
 * against fixtures that have not landed yet.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CubeFixture,
  PatientsFixture,
  TrialsFixture,
  type PairResult,
  type Patient,
  type Trial,
} from "@/src/contracts";
import { evaluate, indexLeaves } from "./evaluate";
import { equityAudit } from "./equity";
import { rankTrialsForPatient } from "./rank";

/** The oracle's evaluation date. Stated in fixtures/ORACLE.md. */
const ASOF = "2026-09-25";

const DIR = process.env.AMBER_FIXTURES ?? resolve(process.cwd(), "fixtures");
const AVAILABLE =
  existsSync(resolve(DIR, "cube.sample.json")) &&
  existsSync(resolve(DIR, "patients.sample.json")) &&
  existsSync(resolve(DIR, "trials.sample.json"));

const load = <T>(file: string, schema: { parse: (v: unknown) => T }): T =>
  schema.parse(JSON.parse(readFileSync(resolve(DIR, file), "utf8")));

/**
 * Guarded with a plain `if` rather than `describe.skipIf`, because a skipped
 * suite's body still runs at collection time and would read files that are not
 * there yet.
 */
if (!AVAILABLE) {
  describe.skip("fixtures — not landed yet", () => {
    it("lights up on its own once fixtures/ reaches main", () => {});
  });
} else {
  describe("fixtures", () => {
  const patients: Patient[] = load("patients.sample.json", PatientsFixture);
  const trials: Trial[] = load("trials.sample.json", TrialsFixture);
  const oracle: PairResult[] = load("cube.sample.json", CubeFixture);

  const patientOf = (id: string) => {
    const p = patients.find((x) => x.id === id);
    if (!p) throw new Error(`fixture has no patient ${id}`);
    return p;
  };
  const trialOf = (nctId: string) => {
    const t = trials.find((x) => x.nctId === nctId);
    if (!t) throw new Error(`fixture has no trial ${nctId}`);
    return t;
  };

  it("parses against the frozen schemas", () => {
    expect(patients.length).toBeGreaterThan(0);
    expect(trials.length).toBeGreaterThan(0);
    expect(oracle.length).toBeGreaterThan(0);
  });

  describe.each(oracle.map((o) => [`${o.patientId} x ${o.nctId}`, o] as const))(
    "%s",
    (_name, want) => {
      const got = () => evaluate(patientOf(want.patientId), trialOf(want.nctId), ASOF);

      it("agrees on every cell's verdict, reason and both citations", () => {
        const mine = got();
        for (const expectedCell of want.cells) {
          const cell = mine.cells.find((c) => c.criterionId === expectedCell.criterionId);
          expect(cell, `no cell emitted for ${expectedCell.criterionId}`).toBeDefined();
          expect(
            {
              criterionId: cell!.criterionId,
              verdict: cell!.verdict,
              reason: cell!.reason,
              criterionCitation: cell!.criterionCitation,
              chartCitation: cell!.chartCitation,
            },
            `cell ${expectedCell.criterionId}`,
          ).toEqual({
            criterionId: expectedCell.criterionId,
            verdict: expectedCell.verdict,
            reason: expectedCell.reason,
            criterionCitation: expectedCell.criterionCitation,
            chartCitation: expectedCell.chartCitation,
          });
        }
      });

      it("agrees on staleness arithmetic", () => {
        const mine = got();
        for (const expectedCell of want.cells) {
          const cell = mine.cells.find((c) => c.criterionId === expectedCell.criterionId)!;
          expect([cell.ageDays, cell.observedAt], `cell ${expectedCell.criterionId}`).toEqual([
            expectedCell.ageDays,
            expectedCell.observedAt,
          ]);
        }
      });

      it("emits exactly the oracle's cells, in the oracle's order", () => {
        expect(got().cells.map((c) => c.criterionId)).toEqual(want.cells.map((c) => c.criterionId));
      });

      it("agrees on the roll-up", () => {
        const mine = got();
        expect({
          eliminated: mine.eliminated,
          passCount: mine.passCount,
          failCount: mine.failCount,
          unknownCount: mine.unknownCount,
          resolutionCost: mine.resolutionCost,
        }).toEqual({
          eliminated: want.eliminated,
          passCount: want.passCount,
          failCount: want.failCount,
          unknownCount: want.unknownCount,
          resolutionCost: want.resolutionCost,
        });
        expect(mine.expectedValue).toBeCloseTo(want.expectedValue, 9);
      });

      it("carries a criterion citation on every cell", () => {
        for (const cell of got().cells) expect(cell.criterionCitation.length).toBeGreaterThan(0);
      });
    },
  );

  describe("the three stories ORACLE.md tells", () => {
    it("the hero pair has exactly two unknowns and survives", () => {
      const hero = oracle.find((o) => !o.eliminated && o.unknownCount === 2);
      expect(hero, "no hero pair in the oracle").toBeDefined();
      const mine = evaluate(patientOf(hero!.patientId), trialOf(hero!.nctId), ASOF);
      expect(mine.unknownCount).toBe(2);
      expect(mine.eliminated).toBe(false);
    });

    it("the true exclusion eliminates with a zero fail count", () => {
      // Criterion-oriented polarity in the fixture's own numbers: the exclusion
      // cell is PASS, nothing FAILs, and the patient is still out.
      const excluded = oracle.filter((o) => o.eliminated && o.failCount === 0);
      expect(excluded.length, "no true-exclusion pair in the oracle").toBeGreaterThan(0);
      for (const want of excluded) {
        const trial = trialOf(want.nctId);
        const leaves = indexLeaves(trial);
        const mine = evaluate(patientOf(want.patientId), trial, ASOF);
        expect(mine.eliminated).toBe(true);
        expect(mine.failCount).toBe(0);
        const fired = mine.cells.filter(
          (c) => c.verdict === "PASS" && leaves.get(c.criterionId)?.type === "exclusion",
        );
        expect(fired.length, `${want.patientId}: an exclusion must have fired`).toBeGreaterThan(0);
        for (const cell of fired) expect(cell.chartCitation).toBeTruthy();
      }
    });

    it("the stale patient's out-of-window labs are UNKNOWN, never FAIL", () => {
      const staleCells = oracle
        .flatMap((o) => o.cells)
        .filter((c) => c.reason === "stale");
      expect(staleCells.length, "no stale cells in the oracle").toBeGreaterThan(0);
      for (const cell of staleCells) {
        const mine = evaluate(patientOf(cell.patientId), trialOf(cell.nctId), ASOF).cells.find(
          (c) => c.criterionId === cell.criterionId,
        )!;
        expect(mine.verdict, `${cell.patientId}/${cell.criterionId}`).toBe("UNKNOWN");
        expect(mine.reason).toBe("stale");
        // A stale fact is still shown — the UI needs "197 days, window is 14".
        expect(mine.chartCitation).toBeTruthy();
      }
    });
  });

  describe("the read models run on real fixtures", () => {
    it("ranks each patient's trials without throwing", () => {
      for (const p of patients) {
        const ranked = rankTrialsForPatient(p, trials, ASOF);
        expect(ranked.every((r) => !r.eliminated)).toBe(true);
        expect(ranked.length).toBeLessThanOrEqual(trials.length);
      }
    });

    it("audits every trial and produces a row per criterion", () => {
      for (const t of trials) {
        const rows = equityAudit(t, patients, ASOF);
        expect(rows).toHaveLength(indexLeaves(t).size);
        for (const row of rows) expect(row.label.length).toBeGreaterThan(0);
      }
    });

    it("keeps the audit sorted by gap, widest first", () => {
      for (const t of trials) {
        const gaps = equityAudit(t, patients, ASOF).map((r) => r.maxGapPoints);
        for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeLessThanOrEqual(gaps[i - 1]);
      }
    });
  });
});
}
