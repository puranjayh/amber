import Link from "next/link";
import { redirect } from "next/navigation";
import { DEMO, asOf, getCube, getPair, getPatient, getTrial, getWorklist, meta } from "@/app/_data/source";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { Provenance } from "@/components/console/Provenance";
import { isDemo } from "@/components/console/params";
import { collectLeaves } from "@/components/criteria/rows";
import { toneCounts } from "@/components/criteria/tone";
import { Worklist, WorklistHeader, type WorklistItem } from "@/components/worklist/Worklist";
import { worklistStrip } from "@/components/worklist/strip";

export default async function WorklistPage({ searchParams }: PageProps<"/">) {
  if (isDemo(await searchParams)) redirect("/patient?demo=1");

  const rows: WorklistItem[] = getWorklist().map((row) => {
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

  return (
    <>
      <ConsoleHeader asOf={asOf} active="worklist" />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-3 px-3 py-4 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[16px] font-medium text-ink">Worklist</h1>
            <p className="mt-0.5 text-[12px] text-ink-2">
              Every patient&apos;s best trial, ranked: fewest unknowns first, then expected value, then travel.
            </p>
          </div>
          <Link
            href="/patient?demo=1"
            className="rounded-md bg-ink px-3.5 py-2 text-[13px] font-medium text-surface hover:bg-ink-2"
          >
            Start demo — {DEMO.patientId} × {DEMO.nctId} →
          </Link>
        </div>
        <WorklistHeader strip={worklistStrip(getCube())} />
        <Worklist rows={rows} />
        <Provenance meta={meta} call="rank(evaluate(patient × trial))" />
      </main>
    </>
  );
}
