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
import { runCube, syntheticCohort, syntheticPatient, syntheticTrial, syntheticTrials } from "./bench";

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
