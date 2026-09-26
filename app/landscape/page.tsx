import { Predicate } from "@/src/contracts";
import { asOf } from "@/app/_data/source";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { LandscapeHistogram } from "@/components/landscape/LandscapeHistogram";

export default function LandscapePage() {
  const bins = Predicate.options.map((p) => ({
    key: p,
    label: p.replace("_", " "),
    count: null,
  }));

  return (
    <>
      <ConsoleHeader asOf={asOf} active="landscape" />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-3 px-3 py-4 sm:px-6 sm:py-6">
        <div>
          <h1 className="text-[16px] font-medium text-ink">Criteria landscape</h1>
          <p className="mt-0.5 text-[12px] text-ink-2">
            How often each kind of criterion appears across compiled trials.
          </p>
        </div>
        <LandscapeHistogram
          bins={bins}
          total={null}
          caption="Stub — counts arrive from compiler:validate. No numbers are shown until then."
        />
      </main>
    </>
  );
}
