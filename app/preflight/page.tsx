import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CubeFixture, PatientsFixture, TrialsFixture } from "@/src/contracts";
import {
  Assignments,
  CriteriaLandscape,
  ElasticitySweep,
  EquitySet,
  EvalReport,
  HcpPanel,
  Meta,
  PayerView,
  WorklistRow,
} from "@/app/_data/schema";
import { readLoop } from "@/app/_data/loop";
import { getDemoWorklist } from "@/app/_data/source";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { checkPayload, ready, type FileCheck } from "@/components/preflight/check";
import { ResetDemo } from "@/components/preflight/ResetDemo";
import { z } from "zod";

export const dynamic = "force-dynamic";

const ROOT = process.cwd();

function read(rel: string): string | null {
  const path = join(/*turbopackIgnore: true*/ ROOT, rel);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

function run(): FileCheck[] {
  const required: [string, z.ZodType][] = [
    ["app/_data/trials.json", TrialsFixture],
    ["app/_data/patients.json", PatientsFixture],
    ["app/_data/cube.json", CubeFixture],
    ["app/_data/worklist.json", WorklistRow.array()],
    ["app/_data/elasticity.json", ElasticitySweep.array()],
    ["app/_data/equity.json", EquitySet.array()],
    ["app/_data/assignments.json", Assignments],
    ["app/_data/landscape.json", CriteriaLandscape],
    ["app/_data/payer.json", PayerView],
    ["app/_data/eval.json", EvalReport],
    ["app/_data/hcp.json", HcpPanel],
    ["app/_data/meta.json", Meta],
    ["fixtures/trials.sample.json", TrialsFixture],
    ["fixtures/patients.sample.json", PatientsFixture],
    ["fixtures/cube.sample.json", CubeFixture],
  ];
  const optional: [string, z.ZodType][] = [
    ["data/eval/labels.json", z.array(z.object({}).passthrough())],
    ["data/eval/results.human.json", EvalReport],
    ["data/eval/labels.human.json", z.array(z.object({}).passthrough())],
    ["data/compiled/landscape.json", CriteriaLandscape],
    ["data/synthea/patients.json", PatientsFixture],
    ["data/claims/patients.json", PatientsFixture],
    ["data/compiled/coverage.json", z.object({}).passthrough()],
    ["data/compiled/trials.json", z.array(z.object({}).passthrough())],
  ];
  return [
    ...required.map(([path, schema]) =>
      checkPayload({ path, required: true, raw: read(path), schema }),
    ),
    ...optional.map(([path, schema]) =>
      checkPayload({ path, required: false, raw: read(path), schema }),
    ),
  ];
}

function asOfFromMeta(): string {
  const raw = read("app/_data/meta.json");
  if (!raw) return "—";
  try {
    const parsed = JSON.parse(raw) as { asOf?: unknown };
    return typeof parsed.asOf === "string" ? parsed.asOf : "—";
  } catch {
    return "—";
  }
}

export default async function PreflightPage() {
  const checks = run();
  const ok = ready(checks);
  const required = checks.filter((c) => c.required);
  const optional = checks.filter((c) => !c.required);
  const loop = await readLoop(getDemoWorklist());

  return (
    <ConsoleHeader asOf={asOfFromMeta()} active="preflight">
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-4 py-6 sm:px-8 sm:py-8">
        <div
          className={`rounded-md border px-3 py-3 sm:px-4 ${
            ok ? "border-pass-line bg-pass-bg text-pass" : "border-fail-line bg-fail-bg text-fail"
          }`}
          role="status"
        >
          <p className="text-[18px] font-medium">{ok ? "Ready" : "Not ready"}</p>
          <p className="mt-0.5 text-[13px] opacity-90">
            {required.filter((c) => c.ok).length}/{required.length} required files valid and
            non-empty.
            {ok ? " The demo has data." : " Fix the red rows before going on stage."}
          </p>
        </div>

        <ResetDemo initial={loop} />
        <Section title="Demo reads these" checks={required} />
        <Section title="Upstream (fallback if missing)" checks={optional} />
      </main>
    </ConsoleHeader>
  );
}

function Section({ title, checks }: { title: string; checks: FileCheck[] }) {
  return (
    <section className="overflow-hidden rounded-md border border-line bg-surface">
      <h2 className="border-b border-line px-3 py-2 text-[18px] font-medium text-ink sm:px-4">
        {title}
      </h2>
      <ul>
        {checks.map((c) => (
          <li
            key={c.path}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-line-2 px-3 py-2 last:border-b-0 sm:px-4"
          >
            <span className="min-w-0 font-mono text-[13px] text-ink">{c.path}</span>
            <span className="flex items-baseline gap-2 font-mono text-[13px]">
              <span
                className={
                  !c.exists && !c.required ? "text-ink-3" : c.ok ? "text-pass" : "text-fail"
                }
              >
                {!c.exists && !c.required ? "n/a" : c.ok ? "green" : "red"}
              </span>
              <span className="text-ink-3">{c.rows} rows</span>
              {c.error && <span className="text-ink-2">{c.error}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
