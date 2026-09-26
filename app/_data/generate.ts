/**
 * Build-time generation step: runs the engine over the inputs and writes every read
 * model the app renders to app/_data/*.json. Nothing on screen is hand-written.
 *
 *   npx vite-node --config vitest.config.ts app/_data/generate.ts
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AS_OF, loadInputs } from "./inputs";
import { buildReadModels } from "./readModels";
import type { Meta } from "./schema";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const OUT = fileURLToPath(new URL("./", import.meta.url));
const write = (name: string, value: unknown) =>
  writeFileSync(OUT + name, JSON.stringify(value, null, 2) + "\n");

const { trials, patients, sources } = loadInputs(ROOT);
const models = buildReadModels(trials, patients, AS_OF);

const meta: Meta = {
  asOf: AS_OF,
  sources,
  patients: patients.length,
  trials: trials.length,
  cells: models.cube.reduce((n, p) => n + p.cells.length, 0),
  engineTree: execSync("git rev-parse --short HEAD:src/engine", { cwd: ROOT }).toString().trim(),
};

write("trials.json", trials);
write("patients.json", patients);
write("cube.json", models.cube);
write("worklist.json", models.worklist);
write("elasticity.json", models.elasticity);
write("equity.json", models.equity);
write("assignments.json", models.assignments);
write("meta.json", meta);

console.log(
  `generated: ${meta.patients} patients × ${meta.trials} trials, ${meta.cells} cells, ` +
    `${models.elasticity.length} sweeps, engine ${meta.engineTree}`,
);
