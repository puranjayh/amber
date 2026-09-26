/**
 * Fold the four synthetic demo patients into the published read models.
 * Evaluates them (and the answered cohort) against the two anchor trials and
 * the presentation trial. Does not rebuild the 133-trial cube.
 *
 *   npx vite-node --config vitest.config.ts app/_data/pin-demo.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PairResult, Trial } from "@/src/contracts";
import { blockingCriterionIds, evaluate, indexLeaves, sweep } from "@/src/engine";
import { buildHcpPanel } from "./hcp";
import { ANCHOR_TRIALS, AS_OF, PRESENTATION_TRIAL, loadInputs } from "./inputs";
import type { HcpPanel, WorklistRow } from "./schema";

if (process.env.NEXT_RUNTIME) {
  throw new Error("pin-demo.ts is a one-off. Do not import it from a route.");
}

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DATA = fileURLToPath(new URL("./", import.meta.url));

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(DATA + name, "utf8"));
}

function worklistRow(trial: Trial, pair: PairResult): WorklistRow {
  const open = pair.cells.filter((c) => c.verdict === "UNKNOWN");
  const leaves = indexLeaves(trial);
  const alone = pair.eliminated ? blockingCriterionIds(trial, pair) : [];
  const joint =
    pair.eliminated && alone.length === 0
      ? pair.cells.filter((cell) => {
          const leaf = leaves.get(cell.criterionId);
          if (!leaf) return false;
          return leaf.type === "exclusion" ? cell.verdict === "PASS" : cell.verdict === "FAIL";
        })
      : [];
  const blockingIds = new Set(alone.length ? alone : joint.map((c) => c.criterionId));
  const blocking = (pair.eliminated ? pair.cells.filter((c) => blockingIds.has(c.criterionId)) : open).map(
    ({ criterionId, verdict, reason, tier }) => ({ criterionId, verdict, reason, tier }),
  );
  return {
    patientId: pair.patientId,
    nctId: pair.nctId,
    eliminated: pair.eliminated,
    passCount: pair.passCount,
    failCount: pair.failCount,
    unknownCount: pair.unknownCount,
    blocking,
    resolutionTier: open.length ? (Math.max(...open.map((c) => c.tier)) as WorklistRow["resolutionTier"]) : null,
    resolutionCost: pair.resolutionCost,
    expectedValue: pair.expectedValue,
  };
}

const { trials, patients } = loadInputs(ROOT);
const byId = new Map(patients.map((p) => [p.id, p]));
const newIds = new Set(
  patients.filter((p) => p.id.startsWith("PT-441") || p.id.startsWith("SEED-")).map((p) => p.id),
);
const presentation = trials.find((t) => t.nctId === PRESENTATION_TRIAL);
const anchors = ANCHOR_TRIALS.map((id) => {
  const trial = trials.find((t) => t.nctId === id);
  if (!trial) throw new Error(`anchor ${id} is not in the compiled pool`);
  return trial;
});
if (!presentation) throw new Error(`missing ${PRESENTATION_TRIAL}`);

const fresh: PairResult[] = [];
for (const patient of patients) {
  if (newIds.has(patient.id)) fresh.push(evaluate(patient, presentation, AS_OF));
  for (const trial of anchors) fresh.push(evaluate(patient, trial, AS_OF));
}

const prior = readJson("cube.json") as PairResult[];
const anchorSet = new Set<string>(ANCHOR_TRIALS);
const cube = [
  ...prior.filter(
    (pair) =>
      !anchorSet.has(pair.nctId) && !(pair.nctId === PRESENTATION_TRIAL && newIds.has(pair.patientId)),
  ),
  ...fresh,
];

const rows: Record<string, WorklistRow[]> = {};
for (const trial of anchors) {
  rows[trial.nctId] = cube
    .filter((pair) => pair.nctId === trial.nctId)
    .map((pair) => worklistRow(trial, pair))
    .sort((a, b) => Number(a.eliminated) - Number(b.eliminated) || a.unknownCount - b.unknownCount || a.patientId.localeCompare(b.patientId));
}

const panel = readJson("hcp.json") as HcpPanel;
const built = buildHcpPanel(
  fresh.filter((pair) => newIds.has(pair.patientId)),
  patients.filter((p) => newIds.has(p.id)),
  [presentation, ...anchors],
);
for (const doc of built.physicians) {
  const dest = panel.physicians.find((p) => p.id === doc.id);
  if (!dest) continue;
  const have = new Set(dest.patients.map((p) => p.patientId));
  for (const row of doc.patients) {
    if (!have.has(row.patientId)) dest.patients.push(row);
  }
}

const elasticity = readJson("elasticity.json") as { nctId: string; criterionId: string; points: unknown[] }[];
const anc = anchors[0];
const ancSweep = elasticity.find((row) => row.nctId === anc.nctId && row.criterionId === "INC-10");
if (!ancSweep) throw new Error("NCT02496663 INC-10 sweep is missing from elasticity.json");
ancSweep.points = sweep(anc, "INC-10", patients, AS_OF);
const at1500 = ancSweep.points.find((p) => (p as { threshold: number }).threshold === 1500) as
  | { eligibleCount: number; excludedByThisAlone: number }
  | undefined;
const at1400 = ancSweep.points.find((p) => (p as { threshold: number }).threshold === 1400) as
  | { eligibleCount: number; excludedByThisAlone: number }
  | undefined;

writeFileSync(DATA + "patients.json", JSON.stringify(patients) + "\n");
writeFileSync(DATA + "cube.json", JSON.stringify(cube) + "\n");
writeFileSync(
  DATA + "anchors.json",
  JSON.stringify({ trials: ANCHOR_TRIALS, rows }, null, 2) + "\n",
);
writeFileSync(DATA + "hcp.json", JSON.stringify(panel) + "\n");
writeFileSync(DATA + "elasticity.json", JSON.stringify(elasticity) + "\n");

const hero = rows[ANCHOR_TRIALS[0]].find((row) => row.patientId === "PT-4410");
const excl = rows[ANCHOR_TRIALS[0]].find((row) => row.patientId === "PT-4411");
const threshold = rows[ANCHOR_TRIALS[0]].find((row) => row.patientId === "PT-4412");
const nudge = rows[ANCHOR_TRIALS[0]].find((row) => row.patientId === "PT-4413");
const heroOther = rows[ANCHOR_TRIALS[1]].find((row) => row.patientId === "PT-4410");
console.log(
  JSON.stringify(
    {
      patients: patients.length,
      newPatients: newIds.size,
      cube: cube.length,
      hero,
      excl: excl && { eliminated: excl.eliminated, blocking: excl.blocking.map((b) => b.criterionId) },
      threshold: threshold && { eliminated: threshold.eliminated, blocking: threshold.blocking.map((b) => b.criterionId) },
      nudge,
      heroOther: heroOther && { eliminated: heroOther.eliminated, blocking: heroOther.blocking.map((b) => b.criterionId) },
      anc: { at1500, at1400 },
      known: byId.size,
    },
    null,
    2,
  ),
);
