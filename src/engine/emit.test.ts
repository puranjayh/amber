/**
 * The report emitter — the one place in this lane that touches the filesystem.
 *
 * The engine modules are pure (contract rule 1). Reading inputs and writing
 * reports has to happen somewhere, so it happens here, in a runner gated behind
 * an environment variable, rather than leaking `fs` into the engine. Vitest is
 * the runner because it is already a dependency and already resolves the `@/`
 * alias; `package.json` belongs to P1, so this needs nothing from anyone.
 *
 *   AMBER_EMIT=1 npm test -- src/engine/emit.test.ts
 *
 * Inputs, each overridable so a report can be produced before the file is merged:
 *   AMBER_TRIALS      default data/compiled/trials.json
 *   AMBER_PREVALENCE  default data/prevalence.json
 *   AMBER_CLAIMS      default data/claims/patients.json
 *
 * Every report carries a `source` block naming the input file, its sha256 and its
 * record count, so a number on a slide can be traced back to the exact bytes it
 * came from — and so a stale report is obvious rather than plausible.
 */
import { createHash } from "node:crypto";
import { cpus } from "node:os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { replicateCohort, timeCube, type BenchmarkRow } from "./bench";
import { claimsCohortEvaluation } from "./claims";
import { claimsCoverage } from "./coverage";
import { indexLeaves } from "./evaluate";
import { loadPatients, loadTrials } from "./load";
import { buildPriorTable, parsePrevalenceFile } from "./priors";

const EMIT = process.env.AMBER_EMIT === "1";

const TRIALS = process.env.AMBER_TRIALS ?? resolve(process.cwd(), "data/compiled/trials.json");
const COHORT = process.env.AMBER_COHORT ?? resolve(process.cwd(), "data/synthea/patients.json");
const CLAIMS = process.env.AMBER_CLAIMS ?? resolve(process.cwd(), "data/claims/patients.json");
const PREVALENCE =
  process.env.AMBER_PREVALENCE ?? resolve(process.cwd(), "data/prevalence.json");

/** The date every report is computed against. Fixed, never `new Date()`. */
const ASOF = process.env.AMBER_ASOF ?? "2026-09-26";

/** Cohort multipliers for the scale run. Override to go bigger or smaller. */
const SCALES = (process.env.AMBER_BENCH_SCALES ?? "1,5,20")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isInteger(n) && n > 0);

interface SourceBlock {
  path: string;
  sha256: string;
  bytes: number;
  records: number;
  rejected: number;
  envelope: string;
}

function readJson(path: string): { raw: unknown; sha256: string; bytes: number } {
  const buf = readFileSync(path);
  return {
    raw: JSON.parse(buf.toString("utf8")),
    sha256: createHash("sha256").update(buf).digest("hex"),
    bytes: buf.byteLength,
  };
}

function writeJson(relative: string, body: unknown): void {
  const path = resolve(process.cwd(), relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`, "utf8");
}

if (!EMIT) {
  describe.skip("report emitter — set AMBER_EMIT=1 to run", () => {
    it("writes data/compiled/coverage.json", () => {});
  });
} else {
  describe("report emitter", () => {
    it("writes data/compiled/coverage.json", () => {
      expect(
        existsSync(TRIALS),
        `no compiled trials at ${TRIALS}; set AMBER_TRIALS to point at them`,
      ).toBe(true);

      const { raw, sha256, bytes } = readJson(TRIALS);
      const { records, rejected, envelope } = loadTrials(raw);

      const source: SourceBlock = {
        path: TRIALS,
        sha256,
        bytes,
        records: records.length,
        rejected: rejected.length,
        envelope,
      };

      const all = claimsCoverage(records, { condition: "lung cancer" });
      const demoPool = claimsCoverage(records, {
        condition: "lung cancer",
        demoPoolOnly: true,
      });

      writeJson("data/compiled/coverage.json", {
        generatedAt: new Date().toISOString(),
        generatedBy: "src/engine/coverage.ts via AMBER_EMIT=1",
        source,
        rejectedRecords: rejected.slice(0, 20),
        notes: [
          "The headline counts only criteria a claim records directly. Criteria " +
            "that are sometimes visible in claims are counted as requiring a " +
            "chart, so the quoted share is a lower bound.",
          "`allCompiledTrials` is the headline sample: every compiled trial that " +
            "has at least one criterion. `demoPool` additionally drops trials " +
            "flagged needsHumanReview (contract rule 5); most of those flags are " +
            "citation-fidelity warnings rather than wrong criterion trees, so the " +
            "larger sample is the fairer basis for a coverage statistic.",
          "This report is derived from protocol text only. No patient record of " +
            "any kind is read, so it carries no privacy burden.",
        ],
        allCompiledTrials: all,
        demoPool,
      });

      // The numbers a slide would quote, echoed so a failed run is loud.
      console.log(`\n${all.headline}\n${all.headlineBasis}`);
      console.log(`demo pool only: ${demoPool.headline}`);
      console.log(
        `\nby predicate:\n${all.byPredicate
          .map(
            (r) =>
              `  ${r.predicate.padEnd(19)} n=${String(r.tally.criteria).padStart(5)}  ` +
              `answerable=${(r.tally.shareAnswerable * 100).toFixed(1).padStart(5)}%`,
          )
          .join("\n")}`,
      );

      expect(all.trials).toBeGreaterThan(0);
      expect(all.overall.criteria).toBeGreaterThan(0);
      expect(existsSync(resolve(process.cwd(), "data/compiled/coverage.json"))).toBe(true);
    });

    it("writes data/compiled/benchmark.json", () => {
      expect(existsSync(TRIALS), `no compiled trials at ${TRIALS}`).toBe(true);
      expect(existsSync(COHORT), `no cohort at ${COHORT}`).toBe(true);

      const trialsFile = readJson(TRIALS);
      const cohortFile = readJson(COHORT);
      const trials = loadTrials(trialsFile.raw);
      const cohort = loadPatients(cohortFile.raw);

      const withCriteria = trials.records.filter((t) => t.criteria.length > 0);
      const leaves = withCriteria.reduce((n, t) => n + indexLeaves(t).size, 0);

      const rows: BenchmarkRow[] = [];
      for (const times of SCALES) {
        // Deep-cloned, so each copy pays for its own fact index. Handing the same
        // object back would measure the cache instead of the engine.
        const patients = replicateCohort(cohort.records, times);
        for (const mode of ["full", "short-circuit"] as const) {
          rows.push(timeCube(patients, trials.records, ASOF, mode));
        }
      }

      const headlineRow = rows
        .filter((r) => r.mode === "full")
        .reduce((best, r) => (r.cellsEvaluated > best.cellsEvaluated ? r : best));
      const realRow = rows.find((r) => r.mode === "full" && r.patients === cohort.records.length)!;

      writeJson("data/compiled/benchmark.json", {
        generatedAt: new Date().toISOString(),
        generatedBy: "src/engine/bench.ts via AMBER_EMIT=1",
        machine: {
          platform: process.platform,
          arch: process.arch,
          cpus: cpus().length,
          cpuModel: cpus()[0]?.model,
          node: process.version,
        },
        asOf: ASOF,
        trials: {
          path: TRIALS,
          sha256: trialsFile.sha256,
          records: trials.records.length,
          withCriteria: withCriteria.length,
          criteria: leaves,
          rejected: trials.rejected.length,
          envelope: trials.envelope,
        },
        cohort: {
          path: COHORT,
          sha256: cohortFile.sha256,
          patients: cohort.records.length,
          facts: cohort.records.reduce((n, p) => n + p.facts.length, 0),
          rejected: cohort.rejected.length,
        },
        headline:
          `${headlineRow.cellsEvaluated.toLocaleString()} criterion evaluations across ` +
          `${headlineRow.patients.toLocaleString()} patients and ${withCriteria.length} ` +
          `real trials in ${headlineRow.seconds.toFixed(2)}s ` +
          `(${headlineRow.cellsPerSecond.toLocaleString()} per second).`,
        realCohortHeadline:
          `The real ${cohort.records.length}-patient Synthea cohort against ` +
          `${withCriteria.length} trials is ${realRow.cellsEvaluated.toLocaleString()} ` +
          `evaluations in ${realRow.seconds.toFixed(2)}s.`,
        notes: [
          "Wall clock on the machine named above, single-threaded, after an " +
            "untimed warm-up pass so JIT compilation is not charged to the run.",
          "Cohorts larger than the real one are that cohort deep-cloned with fresh " +
            "ids. That adds throughput, not clinical diversity, and every clone " +
            "pays for its own fact index exactly as a real patient would.",
          "`full` emits every cell, which is what the product needs — the criteria " +
            "table is the deliverable. `short-circuit` stops at the first " +
            "eliminating criterion and reaches the same eliminated set, which the " +
            "identical `eliminated` counts across modes demonstrate.",
        ],
        rows,
      });

      console.log(`\n${headlineRow.cellsEvaluated.toLocaleString()} cells in ${headlineRow.seconds}s`);
      for (const r of rows) {
        console.log(
          `  n=${String(r.patients).padStart(6)} ${r.mode.padEnd(14)} ` +
            `cells=${r.cellsEvaluated.toLocaleString().padStart(12)} ` +
            `${String(r.seconds).padStart(8)}s ` +
            `${r.cellsPerSecond.toLocaleString().padStart(12)}/s ` +
            `eliminated=${r.eliminated}`,
        );
      }

      // The claim that matters: short-circuiting changes cost, never the answer.
      const byScale = new Map<number, BenchmarkRow[]>();
      for (const r of rows) byScale.set(r.patients, [...(byScale.get(r.patients) ?? []), r]);
      for (const [, pair] of byScale) {
        if (pair.length === 2) expect(pair[0].eliminated).toBe(pair[1].eliminated);
      }
      expect(rows.length).toBe(SCALES.length * 2);
    }, 900_000);

    /**
     * Skips itself until the claims cohort lands. The compiler lane has recorded
     * `data/claims/**` as an ownership blocker, so this is written and tested
     * ahead of the file rather than waiting on it — it will produce the report on
     * the first run after the cohort appears.
     */
    it.skipIf(!existsSync(CLAIMS))("writes data/claims/evaluation.json", () => {
      const trialsFile = readJson(TRIALS);
      const claimsFile = readJson(CLAIMS);
      const trials = loadTrials(trialsFile.raw);
      const cohort = loadPatients(claimsFile.raw);

      // Priors only touch pFavorable, but the report is about what claims can
      // settle, so resolve them from the cited file where it is available.
      const priors = existsSync(PREVALENCE)
        ? buildPriorTable(parsePrevalenceFile(readJson(PREVALENCE).raw).records)
        : undefined;

      const report = claimsCohortEvaluation(cohort.records, trials.records, ASOF, { priors });

      writeJson("data/claims/evaluation.json", {
        generatedAt: new Date().toISOString(),
        generatedBy: "src/engine/claims.ts via AMBER_EMIT=1",
        asOf: ASOF,
        trials: {
          path: TRIALS,
          sha256: trialsFile.sha256,
          records: trials.records.length,
          rejected: trials.rejected.length,
        },
        cohort: {
          path: CLAIMS,
          sha256: claimsFile.sha256,
          records: cohort.records.length,
          rejected: cohort.rejected.length,
        },
        notes: [
          "`confirmedEligiblePairs` is expected to be at or near zero. That is " +
            "the finding: ruling a patient in needs lab values, a biomarker and a " +
            "performance status, and a claim carries none of them.",
          "`definitivelyExcludedPairs` is the commercially useful half — " +
            "exclusions resolved at population scale with no chart pulled.",
          "If `cohort.claimsOnly` is false the cohort carries non-claims facts " +
            "and these figures do not describe a claims feed.",
        ],
        report,
      });

      console.log(`\n${report.headline}`);
      expect(report.pairs).toBeGreaterThan(0);
    }, 900_000);
  });
}
