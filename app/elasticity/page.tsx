import {
  DEMO,
  asOf,
  fixturePatientIds,
  getAssignments,
  getCube,
  getLandscape,
  getSweep,
  getSweeps,
  getTrial,
  getTrials,
  getWorklist,
  meta,
} from "@/app/_data/source";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { DemoSteps } from "@/components/console/DemoSteps";
import { MissingData } from "@/components/console/MissingData";
import { Provenance } from "@/components/console/Provenance";
import { isDemo, one } from "@/components/console/params";
import { ElasticitySelect } from "@/components/elasticity/ElasticitySelect";
import { ElasticityView } from "@/components/elasticity/ElasticityView";
import { defaultBindingPick, INERT_NOTE, isBinding, landscapeAliases, pickAnalyteSweeps } from "@/components/elasticity/picks";
import { tryBuildSweep } from "@/components/elasticity/sweep";
import { AnalyteStrip, matchAnalyte } from "@/components/landscape/AnalyteStrip";
import { MarketGraph } from "@/components/market/MarketGraph";
import { buildGraph, marketCut } from "@/components/market/graph";

const OPERATOR_GLYPH: Record<string, string> = { ">=": "≥", "<=": "≤", "!=": "≠", "==": "=" };
const CORPUS = "233 real protocols, 5,105 criteria, no consensus.";

export default async function ElasticityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const demo = isDemo(sp);
  const picks = pickAnalyteSweeps(getSweeps(), getTrials(), DEMO.nctId);
  const binding = picks.filter(isBinding);
  const inert = picks.filter((p) => !isBinding(p));
  const requested = one(sp.sweep);
  const pick =
    binding.find((p) => `${p.nctId}:${p.criterionId}` === requested) ?? defaultBindingPick(picks);

  const found = pick ? getSweep(pick.nctId, pick.criterionId) : undefined;
  const sweep =
    found && pick && typeof pick.leaf.value === "number"
      ? tryBuildSweep(found.points, pick.leaf.value, pick.leaf.operator)
      : null;

  const landscape = getLandscape();
  const analyte = pick ? matchAnalyte(landscape.analytes, landscapeAliases(pick.family)) : undefined;

  const assignments = getAssignments();
  const cut = marketCut(fixturePatientIds(), assignments, DEMO.nctId);
  const trialMeta = getTrials().map((t) => ({ nctId: t.nctId, slots: t.slots }));
  const graph = buildGraph(
    cut.patientIds,
    trialMeta.filter((t) => cut.nctIds.includes(t.nctId)),
    getCube(),
    assignments,
  );

  return (
    <>
      <ConsoleHeader asOf={asOf} active="elasticity" demo={demo} demoMode={one(sp.demo) === "static" ? "static" : "1"} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-3 py-4 sm:px-6 sm:py-6">
        {demo && <DemoSteps current="elasticity" mode={one(sp.demo) === "static" ? "static" : "1"} />}

        <section className="space-y-3">
          <div>
            <h1 className="text-[16px] font-medium text-ink">The threshold, and what it costs</h1>
            <p className="mt-0.5 text-[12px] text-ink-2">
              Precomputed sweep. Dragging the slider does not re-run the engine.
            </p>
          </div>
          {picks.length === 0 || !pick || !sweep ? (
            <MissingData file="app/_data/elasticity.json" detail="No ANC / albumin / CrCl / platelet sweep." />
          ) : (
            <>
              <ElasticitySelect
                picks={binding}
                current={`${pick.nctId}:${pick.criterionId}`}
                demo={demo}
              />
              {inert.length > 0 && (
                <ul className="space-y-1 text-[12px] text-ink-2">
                  {inert.map((p) => (
                    <li key={`${p.nctId}:${p.criterionId}`}>
                      <span className="font-mono text-ink-3">
                        {p.label} · {p.nctId} {p.criterionId}
                      </span>
                      {" — "}
                      {INERT_NOTE}
                    </li>
                  ))}
                </ul>
              )}
              <blockquote className="border-l-2 border-ink-3 pl-3 text-[13px] text-ink-2">
                “{pick.leaf.sourceSpan}”
              </blockquote>
              <ElasticityView
                key={`${pick.nctId}:${pick.criterionId}`}
                sweep={sweep}
                label={pick.leaf.analyte ?? pick.leaf.predicate}
                operator={OPERATOR_GLYPH[pick.leaf.operator] ?? pick.leaf.operator}
                unit={pick.leaf.unit}
              />
            </>
          )}
        </section>

        <section className="space-y-3">
          <AnalyteStrip analyte={analyte} caption={CORPUS} />
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-[16px] font-medium text-ink">And the trials compete for the same patients</h2>
          </div>
          {cut.patientIds.length === 0 || cut.nctIds.length === 0 ? (
            <MissingData file="app/_data/assignments.json" />
          ) : (
            <MarketGraph
              graph={graph}
              modes={["adhoc", "stable"]}
              caption="The same algorithm that matches medical students to residencies."
            />
          )}
        </section>

        <Provenance
          meta={meta}
          call={pick ? `sweep(${pick.nctId}, ${pick.criterionId}) · matchAdhoc() · match()` : "sweep · match"}
        />
      </main>
    </>
  );
}
