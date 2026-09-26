import Link from "next/link";
import { redirect } from "next/navigation";
import { DEMO, asOf, getCube, getPair, getPatient, getTrial, getWorklist, meta } from "@/app/_data/source";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { MissingData } from "@/components/console/MissingData";
import { Provenance } from "@/components/console/Provenance";
import { isDemo } from "@/components/console/params";
import { collectLeaves } from "@/components/criteria/rows";
import { toneCounts } from "@/components/criteria/tone";
import { Worklist, WorklistHeader, type WorklistItem } from "@/components/worklist/Worklist";
import { screenFailures, worklistStrip } from "@/components/worklist/strip";

export default async function WorklistPage({ searchParams }: PageProps<"/">) {
  if (isDemo(await searchParams)) redirect("/patient?demo=1");

  const worklist = getWorklist();
  if (worklist.length === 0) {
    return (
      <>
        <ConsoleHeader asOf={asOf} active="worklist" />
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
            className="shrink-0 rounded-md bg-ink px-3 py-2 text-[12px] font-medium text-surface hover:bg-ink-2 sm:text-[13px]"
          >
            <span className="sm:hidden">Start demo →</span>
            <span className="hidden sm:inline">
              Start demo — {DEMO.patientId} × {DEMO.nctId} →
            </span>
          </Link>
        </div>
        <WorklistHeader strip={worklistStrip(getCube())} failures={screenFailures(rows)} />
        <Worklist rows={rows} />
        <Provenance meta={meta} call="rank(evaluate(patient × trial))" />
      </main>
    </>
  );
}
