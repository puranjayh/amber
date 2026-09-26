import { asOf, getLandscape, meta } from "@/app/_data/source";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { DemoSteps } from "@/components/console/DemoSteps";
import { Provenance } from "@/components/console/Provenance";
import { isDemo } from "@/components/console/params";
import { LandscapeHistogram } from "@/components/landscape/LandscapeHistogram";

export default async function LandscapePage({ searchParams }: PageProps<"/landscape">) {
  const demo = isDemo(await searchParams);
  const landscape = getLandscape();
  const fromCompiler = meta.sources.includes("data/compiled/landscape.json");

  return (
    <>
      <ConsoleHeader asOf={asOf} active="landscape" demo={demo} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-3 px-3 py-4 sm:px-6 sm:py-6">
        {demo && <DemoSteps current="landscape" />}
        <div>
          <h1 className="text-[16px] font-medium text-ink">Criteria landscape</h1>
          <p className="mt-0.5 text-[12px] text-ink-2">
            Distinct numeric thresholds across compiled trials, per analyte. The dominant
            threshold is the ink bar — that is the consensus, or the lack of one.
          </p>
        </div>
        <LandscapeHistogram
          landscape={landscape}
          caption={
            fromCompiler
              ? "compiler:validate over data/compiled/landscape.json. Counts are de-duplicated by trial."
              : "Derived from the trials in this build — data/compiled/landscape.json had no analytes yet."
          }
        />
        <Provenance meta={meta} call="buildCriteriaLandscape(compiled trials)" />
      </main>
    </>
  );
}
