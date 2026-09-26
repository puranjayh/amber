import { DEMO, asOf, getEquity, getTrial, getTrials, meta, subgroupSizes } from "@/app/_data/source";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { MissingData } from "@/components/console/MissingData";
import { Provenance } from "@/components/console/Provenance";
import { DemoSteps } from "@/components/console/DemoSteps";
import { isDemo, one } from "@/components/console/params";
import { TrialSelect } from "@/components/console/TrialSelect";
import { EquityBars } from "@/components/equity/EquityBars";
import { buildEquityView } from "@/components/equity/equity";

const SMALL_N = 30;

export default async function EquityPage({ searchParams }: PageProps<"/equity">) {
  const sp = await searchParams;
  const demo = isDemo(sp);
  const nctId = (!demo && one(sp.trial)) || DEMO.nctId;
  const trial = getTrial(nctId);
  const set = getEquity(nctId);
  if (!trial || !set) {
    return (
      <>
        <ConsoleHeader asOf={asOf} active="equity" demo={demo} />
        <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-6 sm:px-6">
          <MissingData file="app/_data/equity.json" detail={`No equity set for ${nctId}.`} />
        </main>
      </>
    );
  }

  const view = buildEquityView(set.rows);
  const sizes = subgroupSizes();
  const smallest = Math.min(...Object.values(sizes));
  const targets = trial.dapTargets ? Object.entries(trial.dapTargets) : [];

  return (
    <>
      <ConsoleHeader asOf={asOf} active="equity" demo={demo} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-3 px-3 py-4 sm:px-6 sm:py-6">
        {demo && <DemoSteps current="equity" />}
        <div>
          <h1 className="text-[16px] font-medium text-ink">Equity audit</h1>
          <p className="mt-0.5 text-[12px] text-ink-2">
            Share of otherwise-eligible candidates each criterion excludes, per subgroup.
          </p>
        </div>
        {!demo && (
          <TrialSelect
            path="/equity"
            current={nctId}
            trials={getTrials().map((t) => t.nctId)}
          />
        )}
        {targets.length > 0 && (
          <p className="font-mono text-[11px] text-ink-3">
            DAP targets: {targets.map(([g, share]) => `${g} ${Math.round(share * 100)}%`).join(" · ")}
          </p>
        )}
        {smallest < SMALL_N && (
          <p className="rounded border border-line bg-surface px-3 py-2 text-[12px] text-ink-2">
            Smallest subgroup has {smallest} patient{smallest === 1 ? "" : "s"}. At this size one patient
            moves a rate by {Math.round(100 / smallest)} points — read these as a demonstration of the
            audit, not a finding.
          </p>
        )}
        <EquityBars view={view} sizes={sizes} />
        <Provenance meta={meta} call={`equityAudit(${nctId})`} />
      </main>
    </>
  );
}
