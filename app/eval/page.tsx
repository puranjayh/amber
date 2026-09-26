import { asOf, getEval, meta } from "@/app/_data/source";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { DemoSteps } from "@/components/console/DemoSteps";
import { Provenance } from "@/components/console/Provenance";
import { isDemo } from "@/components/console/params";
import { EvalView } from "@/components/eval/EvalView";

export default async function EvalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = isDemo(await searchParams);
  const report = getEval();

  return (
    <>
      <ConsoleHeader asOf={asOf} active="eval" demo={demo} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-3 px-3 py-4 sm:px-6 sm:py-6">
        {demo && <DemoSteps current="eval" />}
        <EvalView report={report} />
        <Provenance meta={meta} call="evaluateHumanLabels(data/eval/labels.json)" />
      </main>
    </>
  );
}
