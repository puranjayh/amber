import Link from "next/link";
import { DEMO, asOf, getSweep, getSweeps, getTrial, meta } from "@/app/_data/source";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { MissingData } from "@/components/console/MissingData";
import { Provenance } from "@/components/console/Provenance";
import { collectLeaves } from "@/components/criteria/rows";
import { ElasticityView } from "@/components/elasticity/ElasticityView";
import { tryBuildSweep } from "@/components/elasticity/sweep";
import { DemoSteps } from "@/components/console/DemoSteps";
import { isDemo, one } from "@/components/console/params";

const OPERATOR_GLYPH: Record<string, string> = { ">=": "≥", "<=": "≤", "!=": "≠", "==": "=" };
const DEFAULT_CRITERION = "INC-5";

export default async function ElasticityPage({ searchParams }: PageProps<"/elasticity">) {
  const sp = await searchParams;
  const demo = isDemo(sp);
  const nctId = (!demo && one(sp.trial)) || DEMO.nctId;
  const available = getSweeps().filter((s) => s.nctId === nctId);
  const criterionId =
    (!demo && one(sp.criterion)) ||
    (available.some((s) => s.criterionId === DEFAULT_CRITERION) ? DEFAULT_CRITERION : available[0]?.criterionId);

  const trial = getTrial(nctId);
  const found = criterionId ? getSweep(nctId, criterionId) : undefined;
  const leaves = trial ? collectLeaves(trial.criteria) : undefined;
  const leaf = criterionId ? leaves?.get(criterionId) : undefined;
  if (!trial || !found || !leaf || typeof leaf.value !== "number") {
    return (
      <>
        <ConsoleHeader asOf={asOf} active="elasticity" demo={demo} />
        <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-6 sm:px-6">
          <MissingData
            file="app/_data/elasticity.json"
            detail={`No sweep for ${nctId}${criterionId ? ` / ${criterionId}` : ""}.`}
          />
        </main>
      </>
    );
  }

  const sweep = tryBuildSweep(found.points, leaf.value, leaf.operator);
  if (!sweep) {
    return (
      <>
        <ConsoleHeader asOf={asOf} active="elasticity" demo={demo} />
        <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-6 sm:px-6">
          <MissingData
            file="app/_data/elasticity.json"
            detail={`Sweep for ${nctId} / ${criterionId} does not match the leaf threshold.`}
          />
        </main>
      </>
    );
  }
  const qs = (c: string) => `/elasticity?trial=${nctId}&criterion=${c}`;

  return (
    <>
      <ConsoleHeader asOf={asOf} active="elasticity" demo={demo} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-3 px-3 py-4 sm:px-6 sm:py-6">
        {demo && <DemoSteps current="elasticity" />}
        <div>
          <div className="flex flex-wrap items-baseline gap-x-2 font-mono text-[11px] text-ink-3">
            <span className="font-medium text-ink">{trial.nctId}</span>
            <span>· {leaf.id}</span>
            <span>· {sweep.rows.length} precomputed thresholds</span>
          </div>
          <h1 className="mt-1 text-[16px] font-medium text-ink">
            What if {leaf.analyte ?? leaf.predicate} moved?
          </h1>
          <blockquote className="mt-1.5 border-l-2 border-ink-3 pl-3 text-[13px] text-ink-2">
            “{leaf.sourceSpan}”
          </blockquote>
        </div>
        {!demo && (
          <nav aria-label="Sweepable criteria" className="flex flex-wrap gap-1.5">
            {available.map((s) => {
              const l = leaves!.get(s.criterionId);
              const current = s.criterionId === criterionId;
              return (
                <Link
                  key={s.criterionId}
                  href={qs(s.criterionId)}
                  aria-current={current ? "page" : undefined}
                  className={`rounded border px-2 py-1 font-mono text-[11px] ${
                    current ? "border-ink bg-ink text-surface" : "border-line bg-surface text-ink-2 hover:border-ink-3"
                  }`}
                >
                  {s.criterionId} {l?.analyte ?? l?.predicate}
                </Link>
              );
            })}
          </nav>
        )}
        <ElasticityView
          key={`${nctId}:${criterionId}`}
          sweep={sweep}
          label={leaf.analyte ?? leaf.predicate}
          operator={OPERATOR_GLYPH[leaf.operator] ?? leaf.operator}
          unit={leaf.unit}
        />
        <Provenance meta={meta} call={`sweep(${nctId}, ${leaf.id})`} />
      </main>
    </>
  );
}
