import { asOf, getAssignments, getCube, getPatients, getTrials, meta } from "@/app/_data/source";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { DemoSteps } from "@/components/console/DemoSteps";
import { Provenance } from "@/components/console/Provenance";
import { isDemo } from "@/components/console/params";
import { MarketGraph } from "@/components/market/MarketGraph";
import { buildGraph } from "@/components/market/graph";

export default async function MarketPage({ searchParams }: PageProps<"/market">) {
  const demo = isDemo(await searchParams);
  const graph = buildGraph(
    getPatients().map((p) => p.id),
    getTrials().map((t) => ({ nctId: t.nctId, slots: t.slots })),
    getCube(),
    getAssignments(),
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
          </p>
        </div>
        <MarketGraph graph={graph} />
        <Provenance meta={meta} call="matchAdhoc() · match() · match({ dapTargets })" />
      </main>
    </>
  );
}
