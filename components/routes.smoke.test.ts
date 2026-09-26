import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import {
  DEMO,
  getAssignments,
  getCube,
  getEquity,
  getEval,
  getHcp,
  getLandscape,
  getPair,
  getPayer,
  getPatient,
  getPatients,
  getSweep,
  getSweeps,
  getTrial,
  getTrials,
  getWorklist,
  meta,
  realProtocols,
  subgroupSizes,
} from "@/app/_data/source";
import { blockingUnknown, orderFor } from "@/components/alert/alert";
import { AlertCard } from "@/components/alert/AlertCard";
import { collectLeaves } from "@/components/criteria/rows";
import { buildSections } from "@/components/criteria/rows";
import { CriteriaTable } from "@/components/criteria/CriteriaTable";
import { PairSummary, PatientStrip } from "@/components/criteria/PairSummary";
import { toneCounts } from "@/components/criteria/tone";
import { ElasticityView } from "@/components/elasticity/ElasticityView";
import { tryBuildSweep } from "@/components/elasticity/sweep";
import { EvalView } from "@/components/eval/EvalView";
import { EquityBars } from "@/components/equity/EquityBars";
import { buildEquityView } from "@/components/equity/equity";
import { LandscapeHistogram } from "@/components/landscape/LandscapeHistogram";
import { MarketGraph } from "@/components/market/MarketGraph";
import { buildGraph, graphTrials } from "@/components/market/graph";
import { PayerSplit } from "@/components/payer/PayerView";
import { HcpView } from "@/components/hcp/HcpView";
import { PortalForm } from "@/components/hcp/PortalForm";
import { Worklist, WorklistHeader, type WorklistItem } from "@/components/worklist/Worklist";
import { screenFailures } from "@/components/worklist/strip";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: unknown }) =>
    createElement("a", { href }, children as never),
}));

function html(node: unknown): string {
  return renderToStaticMarkup(node as never);
}

test("/worklist mounts against published worklist.json", () => {
  const worklist = getWorklist();
  expect(worklist.length).toBeGreaterThan(0);
  const rows: WorklistItem[] = worklist.map((row) => {
    const trial = getTrial(row.nctId);
    const leaves = trial ? collectLeaves(trial.criteria) : new Map();
    const cells = getPair(row.patientId, row.nctId)?.cells ?? [];
    return {
      ...row,
      patient: getPatient(row.patientId),
      trial,
      favourable: toneCounts(cells, (id) => leaves.get(id)?.type).green,
      total: leaves.size,
    };
  });
  const markup = html(
    createElement("div", null, [
      createElement(WorklistHeader, {
        key: "h",
        strip: meta,
        failures: screenFailures(rows),
        realProtocols,
      }),
      createElement(Worklist, { key: "w", rows }),
    ]),
  );
  expect(markup).toContain("pairs evaluated");
  expect(markup).toContain("PT-4401");
});

test("/elasticity mounts the published hero sweep", () => {
  const found = getSweep(DEMO.nctId, "INC-5") ?? getSweeps().find((s) => s.nctId === DEMO.nctId);
  const trial = getTrial(DEMO.nctId);
  expect(found && trial).toBeTruthy();
  const leaf = collectLeaves(trial!.criteria).get(found!.criterionId);
  expect(leaf && typeof leaf.value === "number").toBe(true);
  const sweep = tryBuildSweep(found!.points, leaf!.value as number, leaf!.operator);
  expect(sweep).not.toBeNull();
  const markup = html(
    createElement(ElasticityView, {
      sweep: sweep!,
      label: leaf!.analyte ?? leaf!.predicate,
      operator: leaf!.operator,
      unit: leaf!.unit,
    }),
  );
  expect(markup).toContain("eligible");
});

test("/landscape mounts published landscape.json", () => {
  const landscape = getLandscape();
  expect(landscape.analytes.length).toBeGreaterThan(0);
  const markup = html(
    createElement(LandscapeHistogram, {
      landscape,
      caption: "smoke",
    }),
  );
  expect(markup).toContain("Thresholds by analyte");
});

test("/equity mounts the published hero equity set", () => {
  const set = getEquity(DEMO.nctId);
  expect(set).toBeTruthy();
  const markup = html(createElement(EquityBars, { view: buildEquityView(set!.rows), sizes: subgroupSizes() }));
  expect(markup).toContain("Exclusion rate by subgroup");
});

test("/market mounts published assignments + cube", () => {
  const assignments = getAssignments();
  const fixture = getPatients()
    .filter((p) => /^PT-\d+$/.test(p.id))
    .map((p) => p.id);
  const graph = buildGraph(
    fixture,
    graphTrials(
      fixture,
      getTrials().map((t) => ({ nctId: t.nctId, slots: t.slots })),
      assignments,
      getWorklist(),
      DEMO.nctId,
    ),
    getCube(),
    assignments,
  );
  const markup = html(createElement(MarketGraph, { graph }));
  expect(markup).toMatch(/Ad hoc|assigned/);
});

test("/eval mounts published eval.json", () => {
  const report = getEval();
  expect(report.evaluatedCells).toBeGreaterThan(0);
  const markup = html(createElement(EvalView, { report }));
  expect(markup).toContain("labelSource");
});

test("/alert mounts a published open pair", () => {
  const pair = getPair(DEMO.patientId, DEMO.nctId);
  const patient = getPatient(DEMO.patientId);
  const trial = getTrial(DEMO.nctId);
  const cell = pair && !pair.eliminated ? blockingUnknown(pair) : undefined;
  const leaves = trial ? collectLeaves(trial.criteria) : undefined;
  const leaf = cell && leaves?.get(cell.criterionId);
  expect(pair && patient && trial && cell && leaf).toBeTruthy();
  const markup = html(
    createElement(AlertCard, {
      patient: patient!,
      trial: trial!,
      pair: pair!,
      cell: cell!,
      leaf: leaf!,
      order: orderFor(leaf!, cell!, patient!),
      favourable: toneCounts(pair!.cells, (id) => leaves!.get(id)?.type).green,
      totalCriteria: leaves!.size,
    }),
  );
  expect(markup).toContain(DEMO.patientId);
});

test("/payer mounts published payer.json", () => {
  const view = getPayer();
  expect(view.beneficiaries).toBeGreaterThan(0);
  const markup = html(createElement(PayerSplit, { view }));
  expect(markup).toMatch(/Claims settled|rule patients out/);
});

test("/hcp mounts published hcp.json", () => {
  const panel = getHcp();
  expect(panel.physicians.reduce((n, p) => n + p.patients.length, 0)).toBeGreaterThan(0);
  const markup = html(createElement(HcpView, { panel }));
  expect(markup).toContain("My patients");
  expect(markup).toContain("PT-4401");
  expect(markup).toContain("Impiricus");
});

test("/patient-portal mounts four questions and no medical facts", () => {
  const hero = getHcp()
    .physicians.flatMap((p) => p.patients)
    .find((p) => p.patientId === DEMO.patientId);
  expect(hero).toBeTruthy();
  const markup = html(createElement(PortalForm, { patientId: DEMO.patientId, initial: hero!.portal }));
  expect(markup).toContain("How far will you travel");
  expect(markup).toContain("How many extra visits a month");
  expect(markup).toContain("Would you accept a placebo arm");
  expect(markup).toContain("Who can drive you");
  expect(markup).not.toMatch(/UNKNOWN|EGFR|ANC|verdict|citation/i);
});

test("/patient mounts a real compiled-trial pair with duplicate leaf ids", () => {
  const row = getWorklist().find((r) => r.nctId === "NCT07631624");
  expect(row).toBeTruthy();
  const patient = getPatient(row!.patientId);
  const trial = getTrial(row!.nctId);
  const pair = getPair(row!.patientId, row!.nctId);
  expect(patient && trial && pair).toBeTruthy();
  const sections = buildSections(trial!.criteria, pair!.cells);
  const keys = sections.flatMap((s) => s.rows.map((r) => r.key));
  expect(new Set(keys).size).toBe(keys.length);
  const markup = html(
    createElement("div", null, [
      createElement(PatientStrip, { key: "s", patient: patient! }),
      createElement(PairSummary, {
        key: "p",
        trial: trial!,
        pair: pair!,
        leaves: collectLeaves(trial!.criteria),
      }),
      createElement(CriteriaTable, { key: "c", sections }),
    ]),
  );
  expect(markup).toContain(row!.patientId);
  expect(markup).toContain("Criteria");
});
