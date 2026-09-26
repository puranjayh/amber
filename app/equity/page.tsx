import { notFound } from "next/navigation";
import { asOf, getEquity, getTrial } from "@/app/_data/source";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { EquityBars } from "@/components/equity/EquityBars";
import { buildEquityView } from "@/components/equity/equity";

export default function EquityPage() {
  const { nctId, rows } = getEquity();
  const trial = getTrial(nctId);
  if (!trial) notFound();

  const view = buildEquityView(rows);
  const targets = trial.dapTargets ? Object.entries(trial.dapTargets) : [];

  return (
    <>
      <ConsoleHeader asOf={asOf} active="equity" />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-3 px-3 py-4 sm:px-6 sm:py-6">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-2 font-mono text-[11px] text-ink-3">
            <span className="font-medium text-ink">{trial.nctId}</span>
            <span>{trial.phase}</span>
          </div>
          <h1 className="mt-1 text-[16px] font-medium text-ink">Equity audit</h1>
          <p className="mt-0.5 text-[12px] text-ink-2">
            Share of otherwise-eligible candidates each criterion excludes, per subgroup.
          </p>
          {targets.length > 0 && (
            <p className="mt-1.5 font-mono text-[11px] text-ink-3">
              DAP targets:{" "}
              {targets.map(([g, share]) => `${g} ${Math.round(share * 100)}%`).join(" · ")}
            </p>
          )}
        </div>
        <EquityBars view={view} />
        <p className="text-[11px] text-ink-3">
          Placeholder rates, hand-written for layout. Not engine output yet.
        </p>
      </main>
    </>
  );
}
