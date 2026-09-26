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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { claimsCoverage } from "./coverage";
import { loadTrials } from "./load";

const EMIT = process.env.AMBER_EMIT === "1";

const TRIALS = process.env.AMBER_TRIALS ?? resolve(process.cwd(), "data/compiled/trials.json");

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
  });
}
