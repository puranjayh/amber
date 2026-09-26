import { asOf, getAssignments, getCube, getPatients, getTrials } from "@/app/_data/source";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { MarketGraph } from "@/components/market/MarketGraph";
import { buildGraph } from "@/components/market/graph";

export default function MarketPage() {
  const graph = buildGraph(
    getPatients().map((p) => p.id),
    getTrials().map((t) => ({ nctId: t.nctId, slots: t.slots })),
    getCube(),
    getAssignments(),
  );

  return (
    <>
      <ConsoleHeader asOf={asOf} active="market" />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-3 px-3 py-4 sm:px-6 sm:py-6">
        <div>
          <h1 className="text-[16px] font-medium text-ink">Market</h1>
          <p className="mt-0.5 text-[12px] text-ink-2">
            Patients on the left, trials on the right. Lines are pairs the engine did not eliminate.
          </p>
        </div>
        <MarketGraph graph={graph} />
        <p className="text-[11px] text-ink-3">
          Candidate lines come from the fixture cube. Assignments are a hand-written placeholder
          until the engine&apos;s matching output ships as a fixture.
        </p>
      </main>
    </>
  );
}
