import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import {
  DEMO,
  getAssignments,
  getCube,
  getEquity,
  getDraftEval,
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
  getDemoWorklist,
  getWorklist,
  meta,
  realProtocols,
} from "@/app/_data/source";
import { blockingUnknown, orderFor } from "@/components/alert/alert";
import { collectLeaves } from "@/components/criteria/rows";
import { buildSections } from "@/components/criteria/rows";
import { CriteriaTable } from "@/components/criteria/CriteriaTable";
import { PairSummary, PatientStrip } from "@/components/criteria/PairSummary";
import { toneCounts } from "@/components/criteria/tone";
import { ElasticityView } from "@/components/elasticity/ElasticityView";
import { defaultBindingPick, isBinding, pickAnalyteSweeps } from "@/components/elasticity/picks";
import { tryBuildSweep } from "@/components/elasticity/sweep";
import { EvalView } from "@/components/eval/EvalView";
import { draftOutreach } from "@/components/hcp/outreach";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { HcpPhysician } from "@/components/hcp/HcpPhysician";
import { HcpView } from "@/components/hcp/HcpView";
import { PortalSwitcher } from "@/components/console/PortalSwitcher";
import { compositionHeadline, raceLabel } from "@/components/hcp/race";
import { hitForPair, panelComposition, takePanel } from "@/components/hcp/panel";
import { PortalForm } from "@/components/hcp/PortalForm";
import { AnalyteStrip, matchAnalyte } from "@/components/landscape/AnalyteStrip";
import { landscapeAliases } from "@/components/elasticity/picks";
import { MarketGraph } from "@/components/market/MarketGraph";
import { buildGraph, marketCut } from "@/components/market/graph";
import { PayerSplit } from "@/components/payer/PayerView";
import { attributePatients } from "@/components/worklist/attribution";
import { Physicians } from "@/components/worklist/Physicians";
import { Worklist, WorklistHeader, type WorklistItem } from "@/components/worklist/Worklist";
import { WorklistLive } from "@/components/worklist/WorklistLive";
import { screenFailures } from "@/components/worklist/strip";
import { LOOP_FOCUS, seedPreferenceRows } from "@/components/loop/rank";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: unknown }) =>
    createElement("a", { href }, children as never),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined }),
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
  expect(markup).toContain("/worklist/patient/");
  expect(markup).not.toContain("/doctor?patient=");
});

test("/worklist live first paint ranks the focus patient at #47 until preferences arrive", () => {
  const worklist = getDemoWorklist();
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
    createElement(WorklistLive, {
      rows,
      initial: {
        backend: "file",
        preferences: seedPreferenceRows(worklist, "2026-09-25T00:00:00.000Z"),
        nudges: [],
        notes: [],
      },
    }),
  );
  expect(markup).toContain("ranked #47: clinically strong, preferences unknown.");
  expect(markup).toContain("Ask patient for preferences");
  expect(markup).toContain(LOOP_FOCUS);
});

test("/worklist physicians tab mounts a roster with assigned labels and a readiness bar", () => {
  const worklist = getWorklist();
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
  const attributions = attributePatients(rows.map((row) => row.patientId));
  expect(attributions.every((a) => a.source === "assigned")).toBe(true);
  const markup = html(
    createElement("div", null, [
      createElement(ConsoleHeader, { key: "h", asOf: "2026-09-25", active: "hcp" }),
      createElement(Physicians, {
        key: "p",
        rows,
        attributions,
        initial: { backend: "file", preferences: [], nudges: [], notes: [] },
        live: false,
      }),
    ]),
  );
  expect(markup).toContain(">HCP<");
  expect(markup).toContain("Aisha Rahman");
  expect(markup).toContain("trial-ready");
  expect(markup).toContain("assigned");
  expect(markup).toContain("eligible now");
  expect(markup).toContain("Select all");
  expect(markup).toContain("Open in doctor portal");
  expect(markup).toContain("Medical oncology");
  expect(markup).toContain("/worklist/patient/");
  expect(markup).not.toContain("/doctor?patient=");
});

test("trial tabs stay Worklist · HCP · Elasticity · Payer; the switcher is a different app", () => {
  const consoleNav = html(createElement(ConsoleHeader, { asOf: "2026-09-25", active: "worklist" }));
  expect(consoleNav).toContain("Worklist");
  expect(consoleNav).toContain("HCP");
  expect(consoleNav).toContain("Elasticity");
  expect(consoleNav).toContain("Payer");
  expect(consoleNav).toContain("Trial portal");
  expect(consoleNav).toContain("Doctor portal");
  expect(consoleNav).toContain("Patient portal");
  expect(consoleNav).not.toContain("Deep dives");
  const doctor = html(createElement(PortalSwitcher, { current: "doctor" }));
  expect(doctor).toContain('href="/doctor"');
  const signedIn = html(createElement(HcpPhysician, { physicianId: "hcp-rahman" }));
  expect(signedIn).toContain("Signed in as");
  expect(signedIn).toContain("Aisha Rahman");
  expect(signedIn).not.toContain("Okonkwo");
  expect(signedIn).not.toContain("Vasquez");
});

test("/hcp is the top 25 by rank with equity and drafts", () => {
  const worklist = getWorklist();
  const panel = takePanel(worklist);
  expect(panel).toHaveLength(25);
  const patients = getPatients();
  const composition = panelComposition(panel, worklist, patients);
  expect(composition.headline).toMatch(/Your panel is \d+% .+; the patients these criteria admit are \d+%\./);
  const equity = [...new Set(panel.map((r) => r.nctId))]
    .map((nctId) => getEquity(nctId))
    .filter((e): e is NonNullable<typeof e> => Boolean(e));
  const rows = panel.map((row) => {
    const patient = getPatient(row.patientId);
    const trial = getTrial(row.nctId);
    const pair = getPair(row.patientId, row.nctId);
    const leaves = trial ? collectLeaves(trial.criteria) : undefined;
    const cell = pair && !pair.eliminated ? blockingUnknown(pair) : undefined;
    const leaf = cell && leaves?.get(cell.criterionId);
    const draft =
      patient && trial && cell && leaf
        ? draftOutreach({
            patientId: row.patientId,
            trial,
            cell,
            leaf,
            order: orderFor(leaf, cell, patient),
          })
        : null;
    return {
      patientId: row.patientId,
      nctId: row.nctId,
      unknownCount: row.unknownCount,
      race: patient ? raceLabel(patient.race) : "Unknown",
      groupHit: patient && cell ? hitForPair(row.nctId, cell.criterionId, patient.race, equity) : undefined,
      draft,
    };
  });
  const markup = html(
    createElement(HcpView, {
      rows,
      selectedId: "PT-4401",
      headline: composition.headline,
      panelShare: composition.panel,
      admittedShare: composition.admitted,
      physicianId: "hcp-rahman",
    }),
  );
  expect(markup).toContain("My patients");
  expect(markup).toContain("Impiricus");
  expect(markup).toContain("Draft outreach");
  expect(markup).toContain("PT-4401");
  expect(markup).toContain("/doctor?physician=hcp-rahman");
  expect(markup).not.toContain("/hcp?patient=");
  expect(markup).not.toContain("Suggest this trial");
});

test("/hcp criteria table still carries both citations on a compiled-trial pair", () => {
  const row = getWorklist().find((r) => r.nctId === "NCT07631624") ?? getWorklist()[0];
  const patient = getPatient(row.patientId);
  const trial = getTrial(row.nctId);
  const pair = getPair(row.patientId, row.nctId);
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
  expect(markup).toContain(row.patientId);
  expect(markup).toContain("Criteria");
});

test("/elasticity mounts sweep + corpus strip + three-trial market cut", () => {
  const picks = pickAnalyteSweeps(getSweeps(), getTrials(), DEMO.nctId);
  expect(picks.map((p) => p.family)).toEqual(expect.arrayContaining(["anc"]));
  const pick = defaultBindingPick(picks) ?? picks[0];
  expect(pick).toMatchObject({ nctId: "NCT02496663", criterionId: "INC-10" });
  expect(picks.some((p) => !isBinding(p))).toBe(true);
  const found = getSweep(pick.nctId, pick.criterionId);
  expect(found).toBeTruthy();
  const sweep = tryBuildSweep(found!.points, pick.leaf.value as number, pick.leaf.operator);
  expect(sweep).not.toBeNull();
  const analyte = matchAnalyte(getLandscape().analytes, landscapeAliases(pick.family));
  const cut = marketCut(
    getPatients()
      .filter((p) => /^PT-\d+$/.test(p.id))
      .map((p) => p.id),
    getAssignments(),
    DEMO.nctId,
  );
  expect(cut.patientIds.length).toBeLessThanOrEqual(6);
  expect(cut.nctIds.length).toBeLessThanOrEqual(3);
  expect(cut.nctIds[0]).toBe(DEMO.nctId);
  const markup = html(
    createElement("div", null, [
      createElement(ElasticityView, {
        key: "e",
        sweep: sweep!,
        label: pick.leaf.analyte ?? pick.leaf.predicate,
        operator: pick.leaf.operator,
        unit: pick.leaf.unit,
      }),
      createElement(AnalyteStrip, { key: "a", analyte, caption: "233 real protocols, 5,105 criteria, no consensus." }),
      createElement(MarketGraph, {
        key: "m",
        graph: buildGraph(
          cut.patientIds,
          getTrials()
            .map((t) => ({ nctId: t.nctId, slots: t.slots }))
            .filter((t) => cut.nctIds.includes(t.nctId)),
          getCube(),
          getAssignments(),
        ),
        modes: ["adhoc", "stable"],
        caption: "The same algorithm that matches medical students to residencies.",
      }),
    ]),
  );
  expect(markup).toContain("eligible");
  expect(markup).toContain("5,105");
  expect(markup).toContain("residencies");
});

test("/eval mounts the human 30-cell run, not the model-draft file", () => {
  const report = getEval();
  expect(report.labelSource).toBe("human");
  expect(report.evaluatedCells).toBe(30);
  expect(report.precision).toBeCloseTo(0.833, 2);
  expect(report.recall).toBeCloseTo(0.917, 2);
  expect(report.disagreements).toHaveLength(2);
  expect(report.disagreements.every((d) => d.patientId.startsWith("SYN-19ad9612") && d.criterionId === "INC-2")).toBe(
    true,
  );
  const markup = html(createElement(EvalView, { report }));
  expect(markup).toContain("evaluatedCells");
  expect(markup).toContain("SYN-19ad9612");
  expect(markup).toContain("UNKNOWN/stale");
  const draft = getDraftEval();
  expect(draft.labelSource).toBe("model-draft");
  expect(draft.evaluatedCells).not.toBe(report.evaluatedCells);
});

test("/payer mounts published payer.json", () => {
  const view = getPayer();
  expect(view.beneficiaries).toBeGreaterThan(0);
  const markup = html(createElement(PayerSplit, { view }));
  expect(markup).toMatch(/Claims settled|rule patients out/);
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

test("equity composition sentence uses the Black 22 / 9 example shape", () => {
  const line = compositionHeadline({ Black: 0.22, White: 0.78 }, { Black: 0.09, White: 0.91 });
  expect(line.text).toBe("Your panel is 22% Black; the patients these criteria admit are 9%.");
});
