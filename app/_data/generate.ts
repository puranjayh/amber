/**
 * One-off build step. Writes app/_data/*.json and exits.
 * Never import this file from a Next route — evaluateAll of the 133-trial
 * pool does not belong in the dev-server module graph.
 *
 *   npx vite-node --config vitest.config.ts app/_data/generate.ts
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildLandscape } from "@/components/landscape/build";
import { CLAIMS_STUB } from "@/components/payer/stub";
import { buildEvalReport } from "./eval";
import { AS_OF, DEMO_POOL, PRESENTATION_TRIAL, loadClaims, loadCoverage, loadInputs, loadLandscape, loadPayerTrials } from "./inputs";
import { buildHcpPanel } from "./hcp";
import { buildPayerView } from "./payer";
import { buildReadModels, publishCube } from "./readModels";
import type { Meta } from "./schema";

if (process.env.NEXT_RUNTIME) {
  throw new Error("app/_data/generate.ts is a one-off build step. Do not import it from a route.");
}

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const OUT = fileURLToPath(new URL("./", import.meta.url));
const write = (name: string, value: unknown, pretty = true) =>
  writeFileSync(OUT + name, JSON.stringify(value, null, pretty ? 2 : undefined) + (pretty ? "\n" : "\n"));

const { trials, patients, sources } = loadInputs(ROOT);
const models = buildReadModels(trials, patients, AS_OF);
const compiledLandscape = loadLandscape(ROOT);
const landscape = compiledLandscape?.landscape ?? buildLandscape(trials);
if (compiledLandscape) sources.push(compiledLandscape.source);

const meta: Meta = {
  asOf: AS_OF,
  sources,
  patients: patients.length,
  trials: trials.length,
  cells: models.cube.reduce((n, p) => n + p.cells.length, 0),
  ...models.strip,
  realProtocols: trials.some((t) => t.nctId === PRESENTATION_TRIAL) ? trials.length - 1 : DEMO_POOL,
  engineTree: execSync("git rev-parse --short HEAD:src/engine", { cwd: ROOT }).toString().trim(),
};

const compact = patients.length > 20;
write("trials.json", trials);
write("patients.json", patients, !compact);
write("cube.json", publishCube(models.cube, models.worklist, PRESENTATION_TRIAL), !compact);
write("worklist.json", models.worklist);
write("elasticity.json", models.elasticity, !compact);
write("equity.json", models.equity);
write("assignments.json", models.assignments);
const claims = loadClaims(ROOT);
const payer = buildPayerView(
  claims?.patients ?? CLAIMS_STUB,
  loadPayerTrials(ROOT),
  AS_OF,
  loadCoverage(ROOT),
  claims ? claims.source : "stub",
);
const evalReport = buildEvalReport(ROOT, patients, trials, AS_OF);
write("landscape.json", landscape);
write("payer.json", payer);
write("eval.json", evalReport);
write("hcp.json", buildHcpPanel(models.cube, patients, trials));
write("meta.json", meta);

console.log(
  `generated: ${meta.patients} patients × ${meta.trials} trials, ${meta.cells} cells, ` +
    `${models.elasticity.length} sweeps, ${meta.eligibleNow} eligible now, ` +
    `${meta.oneTier0Away} one-Tier-0-away, engine ${meta.engineTree}`,
);
