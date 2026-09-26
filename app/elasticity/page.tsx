import { notFound } from "next/navigation";
import { asOf, getElasticity, getTrial } from "@/app/_data/source";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { collectLeaves } from "@/components/criteria/rows";
import { ElasticityView } from "@/components/elasticity/ElasticityView";
import { buildSweep } from "@/components/elasticity/sweep";

const OPERATOR_GLYPH: Record<string, string> = { ">=": "≥", "<=": "≤", "!=": "≠", "==": "=" };

export default function ElasticityPage() {
  const { nctId, criterionId, points } = getElasticity();
  const trial = getTrial(nctId);
  const leaf = trial && collectLeaves(trial.criteria).get(criterionId);
  if (!trial || !leaf || typeof leaf.value !== "number") notFound();

  const sweep = buildSweep(points, leaf.value, leaf.operator);

  return (
    <>
      <ConsoleHeader asOf={asOf} active="elasticity" />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-3 px-3 py-4 sm:px-6 sm:py-6">
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
        <ElasticityView
          sweep={sweep}
          label={leaf.analyte ?? leaf.predicate}
          operator={OPERATOR_GLYPH[leaf.operator] ?? leaf.operator}
          unit={leaf.unit}
        />
        <p className="text-[11px] text-ink-3">
          Placeholder sweep, hand-written for layout. Counts are not from the engine yet.
        </p>
      </main>
    </>
  );
}
