/**
 * The scale benchmark, and the tests that keep it honest.
 *
 * The benchmark itself is opt-in, because it is a measurement and not an
 * assertion — a CI box under load would fail a wall-clock threshold for reasons
 * that have nothing to do with the engine. Run it with:
 *
 *   AMBER_BENCH=1 npm test -- src/engine/bench.test.ts
 *   AMBER_BENCH=1 AMBER_BENCH_PATIENTS=200,1000,3000 npm test -- src/engine/bench.test.ts
 *
 * The always-on tests below cover the generators and the cube runner, so the
 * benchmark code cannot rot between demos.
 */
import { describe, expect, it } from "vitest";
import { Patient as PatientSchema, Trial as TrialSchema } from "@/src/contracts";
import {
  replicateCohort,
  runCube,
  syntheticCohort,
  syntheticPatient,
  syntheticTrial,
  syntheticTrials,
  timeCube,
} from "./bench";

const ASOF = "2026-09-25";
const BENCH = process.env.AMBER_BENCH === "1";
const SIZES = (process.env.AMBER_BENCH_PATIENTS ?? "100,500,2000")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);

describe("synthetic data is valid and reproducible", () => {
  it("produces trials the frozen schema accepts", () => {
    for (const t of syntheticTrials(20)) expect(() => TrialSchema.parse(t)).not.toThrow();
  });

  it("produces patients the frozen schema accepts", () => {
    for (const p of syntheticCohort(50)) expect(() => PatientSchema.parse(p)).not.toThrow();
  });

  it("is deterministic in the seed", () => {
    expect(syntheticPatient(7, 1)).toEqual(syntheticPatient(7, 1));
    expect(syntheticTrial(7, 1)).toEqual(syntheticTrial(7, 1));
  });

  it("changes with the seed", () => {
    expect(syntheticPatient(7, 1)).not.toEqual(syntheticPatient(7, 2));
  });

  it("never calls Math.random", async () => {
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(new URL("bench.ts", import.meta.url), "utf8");
    expect(src.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/Math\.random/);
  });

  it("builds a realistic criterion count per trial, not a toy one", () => {
    const run = runCube(syntheticCohort(1), syntheticTrials(10), ASOF);
    expect(run.cellsPossible / 10).toBeGreaterThanOrEqual(15);
  });

  it("leaves genuine unknowns, so the cube is not trivially decided", () => {
    const run = runCube(syntheticCohort(50), syntheticTrials(20), ASOF);
    expect(run.unknowns).toBeGreaterThan(0);
    expect(run.eliminated).toBeGreaterThan(0);
    expect(run.eliminated).toBeLessThan(run.pairs);
  });

  it("exercises the provenance path", () => {
    const claims = syntheticCohort(100).flatMap((p) => p.facts).filter((f) => f.provenance === "claims");
    expect(claims.length).toBeGreaterThan(0);
  });
});

describe("runCube", () => {
  it("emits one cell per leaf per pair on a full pass", () => {
    const run = runCube(syntheticCohort(5), syntheticTrials(4), ASOF);
    expect(run.cellsEvaluated).toBe(run.cellsPossible);
    expect(run.pairs).toBe(20);
  });

  it("evaluates fewer cells when short-circuiting", () => {
    const patients = syntheticCohort(30);
    const trials = syntheticTrials(20);
    const full = runCube(patients, trials, ASOF);
    const short = runCube(patients, trials, ASOF, { shortCircuit: true });
    expect(short.cellsEvaluated).toBeLessThan(full.cellsEvaluated);
    expect(short.eliminated).toBe(full.eliminated); // same answer, less work
  });

  it("is deterministic", () => {
    const patients = syntheticCohort(10);
    const trials = syntheticTrials(5);
    expect(runCube(patients, trials, ASOF)).toEqual(runCube(patients, trials, ASOF));
  });
});

describe.skipIf(!BENCH)("scale benchmark", () => {
  it("reports throughput against 300 trials", () => {
    const trials = syntheticTrials(300);
    const leaves = runCube(syntheticCohort(1), trials, ASOF).cellsPossible;
    const rows: string[] = [];

    for (const n of SIZES) {
      const patients = syntheticCohort(n);
      for (const mode of ["full", "short-circuit"] as const) {
        const options = mode === "short-circuit" ? { shortCircuit: true } : {};
        // One untimed pass so JIT warm-up is not charged to the measurement.
        runCube(patients.slice(0, Math.min(20, n)), trials.slice(0, 20), ASOF, options);

        const started = performance.now();
        const run = runCube(patients, trials, ASOF, options);
        const seconds = (performance.now() - started) / 1000;

        rows.push(
          [
            String(n).padStart(6),
            String(run.pairs).padStart(9),
            run.cellsEvaluated.toLocaleString().padStart(14),
            `${seconds.toFixed(2)}s`.padStart(8),
            `${Math.round(run.cellsEvaluated / seconds).toLocaleString()}/s`.padStart(14),
            mode,
          ].join("  "),
        );
      }
    }

    console.log(
      [
        "",
        `300 trials, ${leaves} leaves total (${(leaves / 300).toFixed(1)} per trial), asOf ${ASOF}`,
        ["patnts", "    pairs", "         cells", "    time", "    throughput", "mode"].join("  "),
        "".padEnd(76, "-"),
        ...rows,
        "",
      ].join("\n"),
    );
    expect(rows.length).toBe(SIZES.length * 2);
  }, 600_000);
});

describe("replicateCohort", () => {
  const base = syntheticCohort(3, 7);

  it("returns the cohort unchanged at one copy", () => {
    const out = replicateCohort(base, 1);
    expect(out).toHaveLength(3);
    expect(out.map((p) => p.id)).toEqual(base.map((p) => p.id));
  });

  it("multiplies the cohort and keeps every id distinct", () => {
    const out = replicateCohort(base, 4);
    expect(out).toHaveLength(12);
    expect(new Set(out.map((p) => p.id)).size).toBe(12);
  });

  it("keeps the original ids on the first copy, so a report can name real patients", () => {
    expect(replicateCohort(base, 4).slice(0, 3).map((p) => p.id)).toEqual(base.map((p) => p.id));
  });

  it("deep-clones the facts — a shared array would be a shared cache key", () => {
    // This is the whole reason the function exists rather than Array.fill.
    const out = replicateCohort(base, 2);
    expect(out[3].facts).not.toBe(base[0].facts);
    expect(out[3].facts[0]).not.toBe(base[0].facts[0]);
    expect(out[3].facts).toEqual(base[0].facts);
  });

  it("produces clones that evaluate identically to the original", () => {
    const trials = syntheticTrials(3, 7);
    const out = replicateCohort(base, 2);
    const first = runCube([out[0]], trials, ASOF);
    const clone = runCube([out[3]], trials, ASOF);
    expect(clone.cellsEvaluated).toBe(first.cellsEvaluated);
    expect(clone.eliminated).toBe(first.eliminated);
    expect(clone.unknowns).toBe(first.unknowns);
  });

  it("does not mutate the cohort it was given", () => {
    const before = JSON.stringify(base);
    replicateCohort(base, 3);
    expect(JSON.stringify(base)).toBe(before);
  });

  it("refuses a nonsensical multiplier rather than returning something odd", () => {
    expect(() => replicateCohort(base, 0)).toThrow(RangeError);
    expect(() => replicateCohort(base, -1)).toThrow(RangeError);
    expect(() => replicateCohort(base, 1.5)).toThrow(/positive integer/);
  });

  it("is empty-input safe", () => {
    expect(replicateCohort([], 5)).toEqual([]);
  });
});

describe("timeCube", () => {
  const patients = syntheticCohort(12, 3);
  const trials = syntheticTrials(5, 3);

  it("reports the same counts the untimed runner does", () => {
    const timed = timeCube(patients, trials, ASOF, "full");
    const plain = runCube(patients, trials, ASOF);
    expect(timed.cellsEvaluated).toBe(plain.cellsEvaluated);
    expect(timed.eliminated).toBe(plain.eliminated);
    expect(timed.unknowns).toBe(plain.unknowns);
  });

  it("reports a positive duration even for a run that finishes in under a millisecond", () => {
    const row = timeCube(patients, trials, ASOF, "full");
    expect(row.seconds).toBeGreaterThan(0);
    expect(row.cellsPerSecond).toBeGreaterThan(0);
  });

  it("reports a rate that is the cells over the seconds, so a reader can check it", () => {
    const row = timeCube(patients, trials, ASOF, "full");
    const derived = row.cellsEvaluated / row.seconds;
    // Within 1%: `seconds` is rounded for display, the rate is not.
    expect(Math.abs(row.cellsPerSecond - derived) / derived).toBeLessThan(0.01);
  });

  it("labels the mode it ran", () => {
    expect(timeCube(patients, trials, ASOF, "full").mode).toBe("full");
    expect(timeCube(patients, trials, ASOF, "short-circuit").mode).toBe("short-circuit");
  });

  it("reaches the same eliminated set in both modes, with less work in one", () => {
    const full = timeCube(patients, trials, ASOF, "full");
    const short = timeCube(patients, trials, ASOF, "short-circuit");
    expect(short.eliminated).toBe(full.eliminated);
    expect(short.cellsEvaluated).toBeLessThan(full.cellsEvaluated);
  });

  it("is safe on an empty cohort and does not divide by zero", () => {
    const row = timeCube([], trials, ASOF, "full");
    expect(row.cellsEvaluated).toBe(0);
    expect(Number.isFinite(row.cellsPerSecond)).toBe(true);
  });
});
