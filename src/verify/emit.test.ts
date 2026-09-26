/**
 * Writes the fidelity sheet. The one file in this module that touches disk.
 *
 *   AMBER_EMIT=1 npm test -- src/verify/emit.test.ts
 *
 * Inputs, each overridable so a sheet can be cut before the files reach main:
 *   AMBER_TRIALS  default data/compiled/trials.json
 *   AMBER_REVIEW  default data/compiled/review-queue.json
 *   AMBER_SEED    default the module's own, so two runs match
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadTrials } from "@/src/engine";
import { DEFAULT_SEED, buildFidelitySheet, flaggedTrialIds } from "./fidelity";
import { ingestFidelity } from "./ingest-fidelity";

const EMIT = process.env.AMBER_EMIT === "1";
const TRIALS = process.env.AMBER_TRIALS ?? resolve(process.cwd(), "data/compiled/trials.json");
const REVIEW = process.env.AMBER_REVIEW ?? resolve(process.cwd(), "data/compiled/review-queue.json");
const SEED = Number(process.env.AMBER_SEED ?? DEFAULT_SEED);

if (!EMIT) {
  describe.skip("fidelity sheet emitter — set AMBER_EMIT=1 to run", () => {
    it("writes data/eval/fidelity-sheet.json", () => {});
  });
} else {
  describe("fidelity sheet emitter", () => {
    it("writes data/eval/fidelity-sheet.json", () => {
      expect(existsSync(TRIALS), `no corpus at ${TRIALS}`).toBe(true);
      expect(existsSync(REVIEW), `no review queue at ${REVIEW}`).toBe(true);

      const raw = readFileSync(TRIALS);
      const sha256 = createHash("sha256").update(raw).digest("hex");
      const parsed = JSON.parse(raw.toString("utf8")) as unknown[];
      const { records, rejected } = loadTrials(parsed);

      // sourceText lives on the compiler's wrapper, which loadTrials drops.
      const prose = new Map<string, string>();
      for (const row of parsed) {
        if (row === null || typeof row !== "object") continue;
        const rec = row as { trial?: { nctId?: string }; sourceText?: string };
        if (rec.trial?.nctId !== undefined && typeof rec.sourceText === "string") {
          prose.set(rec.trial.nctId, rec.sourceText);
        }
      }

      const queue = JSON.parse(readFileSync(REVIEW, "utf8")) as {
        reviews: { nctId: string; semanticReasons: string[] }[];
      };
      const flags = flaggedTrialIds(queue.reviews);

      const sheet = buildFidelitySheet(records, flags, {
        seed: SEED,
        corpusSha256: sha256,
        sourceText: prose,
      });

      const path = resolve(process.cwd(), "data/eval/fidelity-sheet.json");
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(sheet, null, 2)}\n`, "utf8");

      console.log(
        `\ncorpus ${sha256.slice(0, 16)} — ${records.length} records, ` +
          `${sheet.corpus.trialsWithCriteria} with criteria, ${rejected.length} rejected`,
      );
      console.log(
        `flagged trials ${sheet.strata.flagged.trials} -> ${sheet.strata.flagged.sampled} rows; ` +
          `unflagged ${sheet.strata.unflagged.trials} trials / ` +
          `${sheet.strata.unflagged.criteriaAvailable} criteria -> ` +
          `${sheet.strata.unflagged.sampled} rows ` +
          `(${(sheet.strata.unflagged.samplingRate * 100).toFixed(1)}%)`,
      );
      console.log(`total rows ${sheet.rows.length}, no source context on ${sheet.rowsWithoutSourceContext}`);

      // The empty sheet must already read correctly, or a half-done review will not.
      const dryRun = ingestFidelity(sheet);
      console.log(`\nwith nothing reviewed yet: ${dryRun.headline}`);

      expect(sheet.rows.length).toBeGreaterThan(50);
      expect(sheet.rows.every((r) => r.faithful === null)).toBe(true);
    }, 120_000);
  });
}
