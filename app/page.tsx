import Link from "next/link";
import { redirect } from "next/navigation";
import { readLoop } from "@/app/_data/loop";
import { syncRegistry } from "@/app/_data/registry-sync";
import {
  DEMO,
  asOf,
  getAnchorRows,
  getDemoWorklist,
  getPair,
  getPatient,
  getTrial,
  meta,
  realProtocols,
} from "@/app/_data/source";
import { ANCHORS, anchorById, isAnchor } from "@/components/console/anchors";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { DemoSteps } from "@/components/console/DemoSteps";
import { erlotinibFlip, storyNote } from "@/components/console/invert";
import { MissingData } from "@/components/console/MissingData";
import { Provenance } from "@/components/console/Provenance";
import { one } from "@/components/console/params";
import { collectLeaves } from "@/components/criteria/rows";
import { toneCounts } from "@/components/criteria/tone";
import { trialPatientPath } from "@/components/hcp/access";
import { Worklist, WorklistHeader, type WorklistItem } from "@/components/worklist/Worklist";
import { WorklistLive } from "@/components/worklist/WorklistLive";
import { screenFailures } from "@/components/worklist/strip";

export default async function WorklistPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  if (one(sp.tab) === "physicians")
    redirect(one(sp.demo) === "static" ? "/hcp?demo=static" : "/hcp");

  const requested = one(sp.trial);
  const anchor = anchorById(isAnchor(requested) ? requested : undefined);
  const other = ANCHORS.find((trial) => trial.nctId !== anchor.nctId) ?? ANCHORS[1];
  const worklist = getAnchorRows(anchor.nctId);
  const staticDemo = one(sp.demo) === "static";
  const pinned = one(sp.demo) === "1" || Boolean(requested);
  if (worklist.length === 0) {
    return (
      <ConsoleHeader asOf={asOf} active="worklist" trial={anchor.nctId}>
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-8">
          <MissingData file="app/_data/anchors.json" />
        </main>
      </ConsoleHeader>
    );
  }

  const rows: WorklistItem[] = worklist.map((row) => {
    const trial = getTrial(row.nctId);
    const leaves = trial ? collectLeaves(trial.criteria) : new Map();
    const pair = getPair(row.patientId, row.nctId);
    const otherPair = getPair(row.patientId, other.nctId);
    const cells = pair?.cells ?? [];
    const note =
      storyNote({
        patientId: row.patientId,
        nctId: row.nctId,
        eliminated: row.eliminated,
        cells,
      }) ??
      (otherPair
        ? erlotinibFlip({
            patientId: row.patientId,
            selectedNct: row.nctId,
            selectedEliminated: row.eliminated,
            selectedCells: cells,
            otherNct: other.nctId,
            otherEliminated: otherPair.eliminated,
            otherCells: otherPair.cells,
          })
        : null);
    return {
      ...row,
      patient: getPatient(row.patientId),
      trial,
      favourable: toneCounts(cells, (id) => leaves.get(id)?.type).green,
      total: leaves.size,
      note: note ?? undefined,
    };
  });
  if (!staticDemo) await syncRegistry();
  const loop = staticDemo ? null : await readLoop(getDemoWorklist());
  const strip = {
    pairsEvaluated: rows.length,
    eligibleNow: rows.filter((row) => !row.eliminated && row.unknownCount === 0).length,
    oneTier0Away: rows.filter(
      (row) => !row.eliminated && row.unknownCount === 1 && row.resolutionTier === 0,
    ).length,
  };

  return (
    <ConsoleHeader
      asOf={asOf}
      active="worklist"
      demo={staticDemo || one(sp.demo) === "1"}
      demoMode={staticDemo ? "static" : "1"}
      trial={anchor.nctId}
    >
      <main className="mx-auto w-full max-w-[1600px] flex-1 space-y-6 px-4 py-6 sm:px-8 sm:py-8">
        {staticDemo && <DemoSteps current="worklist" mode="static" />}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[28px] font-semibold text-ink">Worklist</h1>
            <p className="mt-1 max-w-2xl text-[15px] text-ink-2">
              Ranked on {anchor.short}, {anchor.line}. {anchor.note} The four highlighted charts are
              synthetic. Every criterion is a sentence from the compiled protocol.
              {realProtocols > 0 ? ` ${realProtocols} other real protocols stay in the cube.` : ""}
              {loop ? " Missing preferences count as an unknown." : ""}
              {pinned ? ` Hero is ${DEMO.patientId}.` : ""}
            </p>
          </div>
          <Link
            href={trialPatientPath(DEMO.patientId, {
              trialId: anchor.nctId,
              demo: staticDemo ? "static" : null,
            })}
            className="shrink-0 rounded-md bg-brand px-3 py-2 text-[13px] font-medium text-on-brand"
          >
            {DEMO.patientId} × {anchor.nctId} →
          </Link>
        </div>
        <WorklistHeader
          strip={strip}
          failures={screenFailures(rows)}
          realProtocols={realProtocols}
        />
        {loop ? (
          <WorklistLive rows={rows} initial={loop} trial={anchor.nctId} />
        ) : (
          <Worklist rows={rows} demo={staticDemo} trial={anchor.nctId} />
        )}
        <Provenance
          meta={meta}
          call={loop ? "rank(evaluate + preferenceUnknown)" : "rank(evaluate(patient × trial))"}
        />
      </main>
    </ConsoleHeader>
  );
}
