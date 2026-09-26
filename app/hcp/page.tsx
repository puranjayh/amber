import { asOf, getHcp, meta } from "@/app/_data/source";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { MissingData } from "@/components/console/MissingData";
import { Provenance } from "@/components/console/Provenance";
import { isDemo, one } from "@/components/console/params";
import { HcpView } from "@/components/hcp/HcpView";

export default async function HcpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const demo = isDemo(sp);
  const panel = getHcp();
  const requested = one(sp.physician);
  const patients = panel.physicians.reduce((n, p) => n + p.patients.length, 0);
  if (patients === 0) {
    return (
      <>
        <ConsoleHeader asOf={asOf} active="hcp" demo={demo} />
        <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-6 sm:px-6">
          <MissingData file="app/_data/hcp.json" />
        </main>
      </>
    );
  }

  const view = requested
    ? {
        ...panel,
        defaultPhysicianId: panel.physicians.some((p) => p.id === requested)
          ? requested
          : panel.defaultPhysicianId,
        physicians: [
          ...panel.physicians.filter((p) => p.id === requested),
          ...panel.physicians.filter((p) => p.id !== requested),
        ],
      }
    : panel;

  return (
    <>
      <ConsoleHeader asOf={asOf} active="hcp" demo={demo} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-3 px-3 py-4 sm:px-6 sm:py-6">
        <HcpView panel={view} />
        <Provenance meta={meta} call="rank(evaluate(patient × trial)) grouped by treating physician" />
      </main>
    </>
  );
}
