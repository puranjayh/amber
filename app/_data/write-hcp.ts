/**
 * Writes only app/_data/hcp.json. Does not touch the cube or other read models.
 *
 *   npx vite-node --config vitest.config.ts app/_data/write-hcp.ts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { evaluateAll } from "@/src/engine";
import { AS_OF, loadInputs } from "./inputs";
import { buildHcpPanel } from "./hcp";

if (process.env.NEXT_RUNTIME) {
  throw new Error("app/_data/write-hcp.ts is a one-off build step.");
}

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const OUT = fileURLToPath(new URL("./hcp.json", import.meta.url));

const { trials, patients } = loadInputs(ROOT);
const cube = evaluateAll(patients, trials, AS_OF);
const panel = buildHcpPanel(cube, patients, trials);
writeFileSync(OUT, JSON.stringify(panel, null, 2) + "\n");

const n = panel.physicians.reduce((sum, p) => sum + p.patients.length, 0);
const live = panel.physicians.reduce(
  (sum, p) => sum + p.patients.filter((row) => row.liveTrials > 0).length,
  0,
);
console.log(
  `hcp.json: ${n} patients across ${panel.physicians.length} physicians, ${live} with a live trial`,
);
