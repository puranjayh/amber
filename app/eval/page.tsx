import { asOf, getDraftEval, getEval, meta } from "@/app/_data/source";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { MissingData } from "@/components/console/MissingData";
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
  const draft = getDraftEval();
  if (report.evaluatedCells === 0) {
    return (
      <>
        <ConsoleHeader asOf={asOf} active="eval" demo={demo} />
        <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-6 sm:px-6">
          <MissingData
            file="data/eval/results.human.json"
            detail="Need the compiler's human-labelled run — 30 cells, not app/_data/eval.json."
          />
        </main>
      </>
    );
  }

  return (
    <>
      <ConsoleHeader asOf={asOf} active="eval" demo={demo} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-3 py-4 sm:px-6 sm:py-6">
        <EvalView report={report} />
        <Provenance meta={meta} call="data/eval/results.human.json" />
        {draft.evaluatedCells > 0 && (
          <section className="space-y-3 border-t border-line pt-6" aria-label="Model-draft run">
            <EvalView report={draft} forceDraft />
          </section>
        )}
      </main>
    </>
  );
}
