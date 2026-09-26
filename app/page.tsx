import Link from "next/link";
import { redirect } from "next/navigation";
import { readLoop } from "@/app/_data/loop";
import { DEMO, asOf, getPair, getPatient, getTrial, getWorklist, meta, realProtocols } from "@/app/_data/source";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { DemoSteps } from "@/components/console/DemoSteps";
import { MissingData } from "@/components/console/MissingData";
import { Provenance } from "@/components/console/Provenance";
import { isStaticDemo, one } from "@/components/console/params";
import { collectLeaves } from "@/components/criteria/rows";
import { toneCounts } from "@/components/criteria/tone";
import { attributePatients } from "@/components/worklist/attribution";
import { Physicians } from "@/components/worklist/Physicians";
import { Worklist, WorklistHeader, type WorklistItem } from "@/components/worklist/Worklist";
import { WorklistLive } from "@/components/worklist/WorklistLive";
import { screenFailures } from "@/components/worklist/strip";

export default async function WorklistPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  if (one(sp.demo) === "1") redirect("/hcp?demo=1");

  const worklist = getWorklist();
  if (worklist.length === 0) {
    return (
      <>
        <ConsoleHeader asOf={asOf} active="patients" demo={isStaticDemo(sp)} demoMode="static" />
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
  const staticDemo = isStaticDemo(sp);
  const tab = one(sp.tab) === "physicians" ? "physicians" : "patients";
  const loop = staticDemo ? null : await readLoop(worklist);
  const attributions = attributePatients(rows.map((row) => row.patientId));

  return (
    <>
      <ConsoleHeader asOf={asOf} active={tab} demo={staticDemo} demoMode="static" />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-3 px-3 py-4 sm:px-6 sm:py-6">
        {staticDemo && <DemoSteps current="worklist" mode="static" />}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[16px] font-medium text-ink">
              {tab === "physicians" ? "Physicians" : "Patients"}
            </h1>
            <p className="mt-0.5 text-[12px] text-ink-2">
              {tab === "physicians"
                ? "Which physician has the richest pool. Assigned means we hashed the id. Their own login is a separate portal."
                : "Every patient's best trial, ranked: fewest unknowns first, then expected value, then travel."}
              {realProtocols > 0 ? ` Evaluated against ${realProtocols} real trial protocols.` : ""}
              {loop ? " Missing preferences count as an unknown." : ""}
            </p>
          </div>
          <Link
            href="/hcp?demo=1"
            className="shrink-0 rounded-md bg-ink px-3 py-2 text-[12px] font-medium text-surface hover:bg-ink-2 sm:text-[13px]"
          >
            <span className="sm:hidden">Static demo →</span>
            <span className="hidden sm:inline">
              Static demo — {DEMO.patientId} × {DEMO.nctId} →
            </span>
          </Link>
        </div>
        {tab === "patients" && (
          <WorklistHeader
            strip={meta}
            failures={screenFailures(rows)}
            realProtocols={realProtocols}
          />
        )}
        {tab === "physicians" ? (
          <Physicians rows={rows} attributions={attributions} initial={loop} live={Boolean(loop)} />
        ) : loop ? (
          <WorklistLive rows={rows} initial={loop} />
        ) : (
          <Worklist rows={rows} />
        )}
        <Provenance
          meta={meta}
          call={loop ? "rank(evaluate + preferenceUnknown)" : "rank(evaluate(patient × trial))"}
        />
      </main>
    </>
  );
}
