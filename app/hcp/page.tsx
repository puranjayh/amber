import { readLoop } from "@/app/_data/loop";
import { asOf, getPair, getPatient, getTrial, getWorklist, meta } from "@/app/_data/source";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { DemoSteps } from "@/components/console/DemoSteps";
import { MissingData } from "@/components/console/MissingData";
import { Provenance } from "@/components/console/Provenance";
import { isStaticDemo, one } from "@/components/console/params";
import { collectLeaves } from "@/components/criteria/rows";
import { toneCounts } from "@/components/criteria/tone";
import { attributePatients } from "@/components/worklist/attribution";
import { Physicians } from "@/components/worklist/Physicians";
import type { WorklistItem } from "@/components/worklist/Worklist";

export const metadata = { title: "AMBER — HCP" };

export default async function HcpRosterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const demo = isStaticDemo(sp);
  const demoMode = one(sp.demo) === "static" ? "static" : "1";
  const worklist = getWorklist();
  if (worklist.length === 0) {
    return (
      <>
        <ConsoleHeader asOf={asOf} active="hcp" demo={demo} demoMode={demoMode} />
        <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-6 sm:px-6">
          <MissingData file="app/_data/worklist.json" />
        </main>
      </>
    );
  }

  const rows: WorklistItem[] = worklist.map((row) => {
    const trial = getTrial(row.nctId);
    const leaves = trial ? collectLeaves(trial.criteria) : new Map();
    const cells = getPair(row.patientId, row.nctId)?.cells ?? [];
    return {
      ...row,
      patient: getPatient(row.patientId),
      trial,
      favourable: toneCounts(cells, (id) => leaves.get(id)?.type).green,
      total: leaves.size,
    };
  });
  const loop = demo ? null : await readLoop(worklist);
  const attributions = attributePatients(rows.map((row) => row.patientId));

  return (
    <>
      <ConsoleHeader asOf={asOf} active="hcp" demo={demo} demoMode={demoMode} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-3 px-3 py-4 sm:px-6 sm:py-6">
        {demo && <DemoSteps current="hcp" mode={demoMode} />}
        <div>
          <h1 className="text-[16px] font-medium text-ink">Physicians</h1>
          <p className="mt-0.5 text-[12px] text-ink-2">
            Coordinator view — you see across physicians. A physician, in the doctor portal, sees only
            their own patients. Assigned means the record had no provider, so the id was hashed.
          </p>
        </div>
        <Physicians
          rows={rows}
          attributions={attributions}
          initial={loop}
          live={Boolean(loop)}
          demoMode={demo ? demoMode : undefined}
        />
        <Provenance meta={meta} call="attribute(patient) · rank(evaluate(patient × trial))" />
      </main>
    </>
  );
}
