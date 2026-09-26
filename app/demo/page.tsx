import {
  DEMO,
  asOf,
  getLandscape,
  getPair,
  getPatient,
  getPayer,
  getSweep,
  getSweeps,
  getTrial,
  getTrials,
  getWorklist,
  meta,
  realProtocols,
} from "@/app/_data/source";
import { MissingData } from "@/components/console/MissingData";
import { Provenance } from "@/components/console/Provenance";
import { StageHeader } from "@/components/console/StageHeader";
import { DemoShell } from "@/components/demo/DemoShell";
import { featuredWorklist } from "@/components/demo/featured";
import { CriteriaTable } from "@/components/criteria/CriteriaTable";
import { PairSummary, PatientStrip } from "@/components/criteria/PairSummary";
import { buildSections, collectLeaves, listLeaves } from "@/components/criteria/rows";
import { toneCounts } from "@/components/criteria/tone";
import { ElasticityView } from "@/components/elasticity/ElasticityView";
import {
  defaultBindingPick,
  landscapeAliases,
  pickAnalyteSweeps,
} from "@/components/elasticity/picks";
import { tryBuildSweep } from "@/components/elasticity/sweep";
import { AnalyteStrip, matchAnalyte } from "@/components/landscape/AnalyteStrip";
import { PayerSplit } from "@/components/payer/PayerView";
import { Worklist, WorklistHeader, type WorklistItem } from "@/components/worklist/Worklist";
import { screenFailures } from "@/components/worklist/strip";

export const dynamic = "force-static";

const OPERATOR_GLYPH: Record<string, string> = { ">=": "≥", "<=": "≤", "!=": "≠", "==": "=" };
const CORPUS = "233 real protocols, 5,105 criteria, no consensus.";

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

  const picks = pickAnalyteSweeps(getSweeps(), getTrials(), DEMO.nctId);
  const pick = defaultBindingPick(picks);
  const found = pick ? getSweep(pick.nctId, pick.criterionId) : undefined;
  const leaves = collectLeaves(trial.criteria);
  const sweep =
    found && pick && typeof pick.leaf.value === "number"
      ? tryBuildSweep(found.points, pick.leaf.value, pick.leaf.operator)
      : null;
  const landscape = getLandscape();
  const analyte = pick
    ? matchAnalyte(landscape.analytes, landscapeAliases(pick.family))
    : undefined;
  const payer = getPayer();

  if (!pick || !sweep) {
    return (
      <>
        <StageHeader asOf={asOf} label="Live story" />
        <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-6 sm:px-6">
          <MissingData
            file="app/_data/elasticity.json"
            detail="Need an ANC / albumin / CrCl / platelet sweep for the live story."
          />
        </main>
      </>
    );
  }

  return (
    <>
      <StageHeader asOf={asOf} label="Live story" />
      <DemoShell>
        <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-3 py-6 pb-24 sm:px-6 sm:py-8">
          <section id="beat-worklist" className="scroll-mt-4">
            <div className="mb-3">
              <h1 className="text-[24px] font-medium text-ink">The worklist</h1>
              <p className="mt-0.5 text-[13px] text-ink-2">
                Evaluated against {realProtocols} real trial protocols. Click {DEMO.patientId} — we
                open them against {DEMO.nctId}, the pair with two unknowns. Or press space.
              </p>
            </div>
            <WorklistHeader
              strip={meta}
              failures={screenFailures(items)}
              realProtocols={realProtocols}
            />
            <div className="mt-3">
              <Worklist
                rows={featuredWorklist(items, DEMO.patientId)}
                selectedId={DEMO.patientId}
                advanceTo={1}
              />
            </div>
          </section>

          <section id="beat-hcp" className="beat-min-1 scroll-mt-4">
            <p className="mb-3 text-[13px] text-ink-2">
              Two amber rows. Nothing in the record answers them. That is not a no.
            </p>
            <PatientStrip patient={patient} />
            <div className="mt-3 space-y-3">
              <PairSummary trial={trial} pair={pair} leaves={leaves} />
              <CriteriaTable
                sections={buildSections(trial.criteria, pair.cells)}
                initialOpen={pair.cells
                  .filter((c) => c.verdict === "UNKNOWN")
                  .map((c) => c.criterionId)}
                patient={patient}
                leaves={listLeaves(trial.criteria)}
              />
            </div>
            <button
              type="button"
              data-advance="2"
              className="beat-max-1 mt-3 w-full rounded-md border border-line bg-surface px-3 py-3 text-left hover:bg-canvas sm:px-4"
            >
              <span className="block text-[15px] font-medium text-ink">
                What does that one number cost?
              </span>
              <span className="mt-0.5 block text-[13px] text-ink-2">
                Move the ANC threshold. The sweep is precomputed — the slider does not re-run the
                engine.
              </span>
            </button>
          </section>

          <section id="beat-elasticity" className="beat-min-2 scroll-mt-4">
            <div className="mb-3 space-y-3">
              <div>
                <h2 className="text-[18px] font-medium text-ink">
                  The threshold, and what it costs
                </h2>
                <p className="mt-0.5 font-mono text-[11px] text-ink-3">
                  {pick.nctId} · {pick.leaf.id} · {sweep.rows.length} precomputed thresholds
                </p>
                <blockquote className="mt-1.5 border-l-2 border-ink-3 pl-3 text-[13px] text-ink-2">
                  “{pick.leaf.sourceSpan}”
                </blockquote>
              </div>
              <ElasticityView
                sweep={sweep}
                label={pick.leaf.analyte ?? pick.leaf.predicate}
                operator={OPERATOR_GLYPH[pick.leaf.operator] ?? pick.leaf.operator}
                unit={pick.leaf.unit}
              />
              <AnalyteStrip analyte={analyte} caption={CORPUS} />
            </div>
          </section>

          <section id="beat-payer" className="beat-min-3 scroll-mt-4">
            {payer.headline || payer.settled.length > 0 || payer.needs.length > 0 ? (
              <PayerSplit view={payer} />
            ) : (
              <MissingData file="app/_data/payer.json" />
            )}
            <div className="mt-3">
              <Provenance meta={meta} call="rank → sweep → claims settle" />
            </div>
          </section>
        </main>
      </DemoShell>
    </>
  );
}
