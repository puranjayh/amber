import { asOf, fixturePatientIds, getAssignments, getCube, getPatients, getTrials, meta } from "@/app/_data/source";
// Route must stay free of PageProps<"/market"> — a stale AppRoutes omit 404s the page.
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { MissingData } from "@/components/console/MissingData";
import { DemoSteps } from "@/components/console/DemoSteps";
import { Provenance } from "@/components/console/Provenance";
import { isDemo } from "@/components/console/params";
import { MarketGraph } from "@/components/market/MarketGraph";
import { buildGraph } from "@/components/market/graph";

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = isDemo(await searchParams);
  if (getPatients().length === 0 || getTrials().length === 0) {
    return (
      <>
        <ConsoleHeader asOf={asOf} active="market" demo={demo} />
        <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-6 sm:px-6">
          <MissingData file="app/_data/assignments.json" />
        </main>
      </>
    );
  }
  const assignments = getAssignments();
  const assigned = new Set(assignments.flatMap((a) => a.pairs.map((p) => p.patientId)));
  const fixture = fixturePatientIds();
  const extra = getPatients().map((p) => p.id).filter((id) => assigned.has(id) && !fixture.includes(id));
  const graphIds = [...fixture, ...extra.slice(0, 12)];
  const graph = buildGraph(
    graphIds,
    getTrials().map((t) => ({ nctId: t.nctId, slots: t.slots })),
    getCube(),
    assignments,
  );

  return (
    <>
      <ConsoleHeader asOf={asOf} active="market" demo={demo} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-3 px-3 py-4 sm:px-6 sm:py-6">
        {demo && <DemoSteps current="market" />}
        <div>
          <h1 className="text-[16px] font-medium text-ink">Market</h1>
          <p className="mt-0.5 text-[12px] text-ink-2">
            Patients on the left, trials on the right. Lines are pairs the engine did not eliminate.
            Graph shows the demo cohort plus {Math.min(12, extra.length)} of {assigned.size} assigned
            patients; match() ran over the full {meta.patients} × {meta.trials} cube.
          </p>
        </div>
        <MarketGraph graph={graph} />
        <Provenance meta={meta} call="matchAdhoc() · match() · match({ dapTargets })" />
      </main>
    </>
  );
}
