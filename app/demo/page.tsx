import {
  DEMO,
  asOf,
  fixturePatientIds,
  getAssignments,
  getCube,
  getEquity,
  getPair,
  getPatient,
  getPatients,
  getSweep,
  getSweeps,
  getTrial,
  getTrials,
  getWorklist,
  meta,
  subgroupSizes,
} from "@/app/_data/source";
import { MissingData } from "@/components/console/MissingData";
import { Provenance } from "@/components/console/Provenance";
import { StageHeader } from "@/components/console/StageHeader";
import { DemoShell } from "@/components/demo/DemoShell";
import { featuredWorklist } from "@/components/demo/featured";
import { CriteriaTable } from "@/components/criteria/CriteriaTable";
import { PairSummary, PatientStrip } from "@/components/criteria/PairSummary";
import { buildSections, collectLeaves } from "@/components/criteria/rows";
import { toneCounts } from "@/components/criteria/tone";
import { ElasticityView } from "@/components/elasticity/ElasticityView";
import { buildSweep } from "@/components/elasticity/sweep";
import { EquityBars } from "@/components/equity/EquityBars";
import { buildEquityView } from "@/components/equity/equity";
import { MarketGraph } from "@/components/market/MarketGraph";
import { buildGraph } from "@/components/market/graph";
import { Worklist, WorklistHeader, type WorklistItem } from "@/components/worklist/Worklist";
import { screenFailures, worklistStrip } from "@/components/worklist/strip";

export const dynamic = "force-static";

const DEFAULT_CRITERION = "INC-5";
const OPERATOR_GLYPH: Record<string, string> = { ">=": "≥", "<=": "≤", "!=": "≠", "==": "=" };

export default function DemoPage() {
  const patient = getPatient(DEMO.patientId);
  const trial = getTrial(DEMO.nctId);
  const pair = getPair(DEMO.patientId, DEMO.nctId);
  if (!patient || !trial || !pair) {
    return (
      <>
        <StageHeader asOf={asOf} label="Live story" />
        <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-6 sm:px-6">
          <MissingData
            file="app/_data/cube.json"
            detail={`Need ${DEMO.patientId} × ${DEMO.nctId} in the generated cube.`}
          />
        </main>
      </>
    );
  }

  const worklist = getWorklist();
  if (worklist.length === 0) {
    return (
      <>
        <StageHeader asOf={asOf} label="Live story" />
        <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-6 sm:px-6">
          <MissingData file="app/_data/worklist.json" />
        </main>
      </>
    );
  }

  const items: WorklistItem[] = worklist.map((row) => {
    const t = getTrial(row.nctId);
    const leaves = t ? collectLeaves(t.criteria) : new Map();
    const cells = getPair(row.patientId, row.nctId)?.cells ?? [];
    return {
      ...row,
      patient: getPatient(row.patientId),
      trial: t,
      favourable: toneCounts(cells, (id) => leaves.get(id)?.type).green,
      total: leaves.size,
    };
  });

  const available = getSweeps().filter((s) => s.nctId === DEMO.nctId);
  const criterionId = available.some((s) => s.criterionId === DEFAULT_CRITERION)
    ? DEFAULT_CRITERION
    : available[0]?.criterionId;
  const found = criterionId ? getSweep(DEMO.nctId, criterionId) : undefined;
  const leaves = collectLeaves(trial.criteria);
  const leaf = criterionId ? leaves.get(criterionId) : undefined;
  const set = getEquity(DEMO.nctId);

  if (!found || !leaf || typeof leaf.value !== "number" || !set) {
    return (
      <>
        <StageHeader asOf={asOf} label="Live story" />
        <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-6 sm:px-6">
          <MissingData
            file="app/_data/elasticity.json"
            detail="Need a numeric sweep and an equity set for the hero trial."
          />
        </main>
      </>
    );
  }

  const assignments = getAssignments();
  const assigned = new Set(assignments.flatMap((a) => a.pairs.map((p) => p.patientId)));
  const fixture = fixturePatientIds();
  const extra = getPatients()
    .map((p) => p.id)
    .filter((id) => assigned.has(id) && !fixture.includes(id));
  const graphIds = [...fixture, ...extra.slice(0, 12)];
  const sizes = subgroupSizes();
  const smallest = Math.min(...Object.values(sizes));
  const sweep = buildSweep(found.points, leaf.value, leaf.operator);

  return (
    <>
      <StageHeader asOf={asOf} label="Live story" />
      <DemoShell>
        <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-3 py-4 pb-24 sm:px-6 sm:py-6">
          <section id="beat-worklist" className="scroll-mt-4">
            <div className="mb-3">
              <h1 className="text-[16px] font-medium text-ink">The worklist</h1>
              <p className="mt-0.5 text-[12px] text-ink-2">
                Every patient&apos;s best trial, cheapest unknown first. Click {DEMO.patientId} — we
                open them against {DEMO.nctId}, the pair with two unknowns. Or press space.
              </p>
            </div>
            <WorklistHeader strip={worklistStrip(getCube())} failures={screenFailures(items)} />
            <div className="mt-3">
              <Worklist rows={featuredWorklist(items, DEMO.patientId)} selectedId={DEMO.patientId} advanceTo={1} />
            </div>
          </section>

          <section id="beat-criteria" className="beat-min-1 scroll-mt-4">
            <p className="mb-3 text-[12px] text-ink-2">
              Two amber rows. Nothing in the record answers them. That is not a no.
            </p>
            <PatientStrip patient={patient} />
            <div className="mt-3 space-y-3">
              <PairSummary trial={trial} pair={pair} leaves={leaves} />
              <CriteriaTable sections={buildSections(trial.criteria, pair.cells)} initialOpen={pair.cells.filter((c) => c.verdict === "UNKNOWN").map((c) => c.criterionId)} />
            </div>
            <button
              type="button"
              data-advance="2"
              className="beat-max-1 mt-3 w-full rounded-md border border-line bg-surface px-3 py-3 text-left hover:bg-canvas sm:px-4"
            >
              <span className="block text-[14px] font-medium text-ink">What does that one number cost?</span>
              <span className="mt-0.5 block text-[12px] text-ink-2">
                Move the ANC threshold. The sweep is precomputed — the slider does not re-run the
                engine.
              </span>
            </button>
          </section>

          <section id="beat-elasticity" className="beat-min-2 scroll-mt-4">
            <div className="mb-3">
              <div className="flex flex-wrap items-baseline gap-x-2 font-mono text-[11px] text-ink-3">
                <span className="font-medium text-ink">{DEMO.nctId}</span>
                <span>· {leaf.id}</span>
                <span>· {sweep.rows.length} precomputed thresholds</span>
              </div>
              <h2 className="mt-1 text-[16px] font-medium text-ink">
                What if {leaf.analyte ?? leaf.predicate} moved?
              </h2>
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
          </section>

          <section id="beat-equity" className="beat-min-3 scroll-mt-4">
            <div className="mb-3">
              <h2 className="text-[16px] font-medium text-ink">Who does this criterion exclude?</h2>
              <p className="mt-0.5 text-[12px] text-ink-2">
                Share of otherwise-eligible candidates each criterion excludes, per subgroup.
              </p>
              {trial.dapTargets && (
                <p className="mt-1 font-mono text-[11px] text-ink-3">
                  DAP targets:{" "}
                  {Object.entries(trial.dapTargets)
                    .map(([g, share]) => `${g} ${Math.round(share * 100)}%`)
                    .join(" · ")}
                </p>
              )}
              {smallest < 30 && (
                <p className="mt-2 rounded border border-line bg-surface px-3 py-2 text-[12px] text-ink-2">
                  Smallest subgroup has {smallest} patient{smallest === 1 ? "" : "s"}. At this size
                  one patient moves a rate by {Math.round(100 / smallest)} points — a demonstration,
                  not a finding.
                </p>
              )}
            </div>
            <EquityBars view={buildEquityView(set.rows)} sizes={sizes} />
          </section>

          <section id="beat-market" className="beat-min-4 scroll-mt-4">
            <div className="mb-3">
              <h2 className="text-[16px] font-medium text-ink">Clear the market</h2>
              <p className="mt-0.5 text-[12px] text-ink-2">
                Patients on the left, trials on the right. Graph shows the demo cohort plus{" "}
                {Math.min(12, extra.length)} of {assigned.size} assigned patients; match() ran over
                the full {meta.patients} × {meta.trials} cube.
              </p>
            </div>
            <MarketGraph
              graph={buildGraph(
                graphIds,
                getTrials().map((t) => ({ nctId: t.nctId, slots: t.slots })),
                getCube(),
                assignments,
              )}
            />
            <div className="mt-3">
              <Provenance meta={meta} call="evaluate → sweep → equityAudit → match" />
            </div>
          </section>
        </main>
      </DemoShell>
    </>
  );
}
