import Link from "next/link";
import { notFound } from "next/navigation";
import { DEMO, asOf, getEquity, getTrial, getTrials, meta, subgroupSizes } from "@/app/_data/source";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { Provenance } from "@/components/console/Provenance";
import { DemoSteps } from "@/components/console/DemoSteps";
import { isDemo, one } from "@/components/console/params";
import { EquityBars } from "@/components/equity/EquityBars";
import { buildEquityView } from "@/components/equity/equity";

const SMALL_N = 30;

export default async function EquityPage({ searchParams }: PageProps<"/equity">) {
  const sp = await searchParams;
  const demo = isDemo(sp);
  const nctId = (!demo && one(sp.trial)) || DEMO.nctId;
  const trial = getTrial(nctId);
  const set = getEquity(nctId);
  if (!trial || !set) notFound();

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
          <nav aria-label="Trials" className="flex flex-wrap gap-1.5">
            {getTrials().map((t) => (
              <Link
                key={t.nctId}
                href={`/equity?trial=${t.nctId}`}
                aria-current={t.nctId === nctId ? "page" : undefined}
                className={`rounded border px-2 py-1 font-mono text-[11px] ${
                  t.nctId === nctId ? "border-ink bg-ink text-surface" : "border-line bg-surface text-ink-2 hover:border-ink-3"
                }`}
              >
                {t.nctId}
              </Link>
            ))}
          </nav>
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
