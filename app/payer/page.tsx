import { asOf, getPayer, meta } from "@/app/_data/source";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { MissingData } from "@/components/console/MissingData";
import { DemoSteps } from "@/components/console/DemoSteps";
import { Provenance } from "@/components/console/Provenance";
import { isDemo } from "@/components/console/params";
import { PayerSplit } from "@/components/payer/PayerView";

export default async function PayerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = isDemo(await searchParams);
  const view = getPayer();
  if (!view.headline && view.settled.length === 0 && view.needs.length === 0) {
    return (
      <>
        <ConsoleHeader asOf={asOf} active="payer" demo={demo} />
        <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-6 sm:px-6">
          <MissingData file="app/_data/payer.json" />
        </main>
      </>
    );
  }

  return (
    <>
      <ConsoleHeader asOf={asOf} active="payer" demo={demo} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-3 px-3 py-4 sm:px-6 sm:py-6">
        {demo && <DemoSteps current="payer" />}
        <PayerSplit view={view} />
        <Provenance
          meta={meta}
          call={
            view.source === "stub"
              ? "evaluate(claims stub × fixture trials) — swap when data/claims/patients.json lands"
              : "evaluate(data/claims/patients.json × fixture trials)"
          }
        />
      </main>
    </>
  );
}
