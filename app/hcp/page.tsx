import { readLoop } from "@/app/_data/loop";
import {
  DEMO,
  asOf,
  getEquity,
  getPair,
  getPatient,
  getPatients,
  getTrial,
  getWorklist,
  meta,
} from "@/app/_data/source";
import { blockingUnknown, orderCorresponds, orderFor } from "@/components/alert/alert";
import { DemoSteps } from "@/components/console/DemoSteps";
import { HcpChrome } from "@/components/hcp/HcpChrome";
import { MissingData } from "@/components/console/MissingData";
import { Provenance } from "@/components/console/Provenance";
import { isStaticDemo, one } from "@/components/console/params";
import { CriteriaTable } from "@/components/criteria/CriteriaTable";
import { PairSummary, PatientStrip } from "@/components/criteria/PairSummary";
import { buildSections, collectLeaves, leafForCell } from "@/components/criteria/rows";
import { HcpLive } from "@/components/hcp/HcpLive";
import { HcpPhysician } from "@/components/hcp/HcpPhysician";
import { HcpView, type HcpRosterRow } from "@/components/hcp/HcpView";
import { DEFAULT_PHYSICIAN_ID, PHYSICIANS } from "@/components/hcp/roster";
import { attributePatients } from "@/components/worklist/attribution";
import { draftOutreach } from "@/components/hcp/outreach";
import { hitForPair, panelComposition, takePanel } from "@/components/hcp/panel";
import { raceLabel } from "@/components/hcp/race";
import { pairTravel, prefsByPatient, rank } from "@/components/loop/rank";

export const metadata = { title: "Impiricus — Physician portal" };

export default async function HcpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const demo = isStaticDemo(sp);
  const worklist = getWorklist();
  const loop = demo ? null : await readLoop(worklist);
  const prefs = loop ? prefsByPatient(loop.preferences) : {};
  const ordered = loop
    ? rank(worklist, prefs, (row) => pairTravel(getPatient(row.patientId), getTrial(row.nctId)))
    : worklist;
  const attributions = attributePatients(worklist.map((row) => row.patientId));
  const requested = one(sp.patient) || (demo ? DEMO.patientId : undefined);
  const requestedPhysician = one(sp.physician);
  const inferred = requested
    ? attributions.find((a) => a.patientId === requested)?.physicianId
    : undefined;
  const physicianId = PHYSICIANS.some((p) => p.id === requestedPhysician)
    ? requestedPhysician!
    : inferred && PHYSICIANS.some((p) => p.id === inferred)
      ? inferred
      : DEFAULT_PHYSICIAN_ID;
  const mine = new Set(
    attributions.filter((a) => a.physicianId === physicianId).map((a) => a.patientId),
  );
  const scoped = demo ? ordered : ordered.filter((row) => mine.has(row.patientId));
  const extraIds = new Set(
    [
      requested,
      ...(loop?.nudges
        .filter((n) => n.kind === "enrol_patient" && n.status !== "done" && mine.has(n.patientId))
        .map((n) => n.patientId) ?? []),
    ].filter((id): id is string => Boolean(id)),
  );
  const panel = takePanel(scoped, 25, demo ? DEMO.patientId : undefined);
  const physicianCounts = Object.fromEntries(
    PHYSICIANS.map((p) => [
      p.id,
      attributions.filter((a) => a.physicianId === p.id).length,
    ]),
  );
  for (const id of extraIds) {
    if (panel.some((row) => row.patientId === id)) continue;
    const row = ordered.find((r) => r.patientId === id);
    if (row) panel.push(row);
  }
  if (panel.length === 0) {
    return (
      <>
        <HcpChrome asOf={asOf} demo={demo} />
        <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-6 sm:px-6">
          <MissingData file="app/_data/worklist.json" />
        </main>
      </>
    );
  }

  const patients = getPatients();
  const equity = [...new Set(panel.map((row) => row.nctId))]
    .map((nctId) => getEquity(nctId))
    .filter((e): e is NonNullable<typeof e> => Boolean(e));
  const composition = panelComposition(panel, worklist, patients);
  const selected = panel.find((r) => r.patientId === requested) ?? (demo ? panel[0] : undefined);

  const rows: HcpRosterRow[] = panel.map((row) => {
    const patient = getPatient(row.patientId);
    const trial = getTrial(row.nctId);
    const pair = getPair(row.patientId, row.nctId);
    const cell = pair && !pair.eliminated ? blockingUnknown(pair) : undefined;
    const leaf = trial && cell ? leafForCell(trial.criteria, cell) : undefined;
    const order = patient && leaf && cell ? orderFor(leaf, cell, patient) : undefined;
    const draft =
      patient && trial && cell && leaf && order && orderCorresponds(leaf, cell, order)
        ? draftOutreach({
            patientId: row.patientId,
            trial,
            cell,
            leaf,
            order,
          })
        : null;
    const groupHit =
      patient && cell ? hitForPair(row.nctId, cell.criterionId, patient.race, equity) : undefined;
    return {
      patientId: row.patientId,
      nctId: row.nctId,
      unknownCount: row.unknownCount,
      race: patient ? raceLabel(patient.race) : "Unknown",
      groupHit,
      draft,
    };
  });

  const patient = selected ? getPatient(selected.patientId) : undefined;
  const trial = selected ? getTrial(selected.nctId) : undefined;
  const pair = selected ? getPair(selected.patientId, selected.nctId) : undefined;
  const sections = trial && pair ? buildSections(trial.criteria, pair.cells) : undefined;
  const leaves = trial ? collectLeaves(trial.criteria) : undefined;
  const unknownIds = pair?.cells.filter((c) => c.verdict === "UNKNOWN").map((c) => c.criterionId) ?? [];

  return (
    <>
      <HcpChrome asOf={asOf} demo={demo}>
        {loop ? <HcpPhysician physicianId={physicianId} counts={physicianCounts} /> : null}
      </HcpChrome>
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-3 px-3 py-4 sm:px-6 sm:py-6">
        {demo && <DemoSteps current="hcp" mode={one(sp.demo) === "static" ? "static" : "1"} />}
        {loop ? (
          <HcpLive
            rows={rows}
            selectedId={selected?.patientId}
            headline={composition.headline}
            panelShare={composition.panel}
            admittedShare={composition.admitted}
            initial={loop}
            selectedNctId={selected?.nctId}
            physicianId={physicianId}
            physicianPatients={[...mine]}
          />
        ) : (
          <HcpView
            rows={rows}
            selectedId={selected?.patientId}
            headline={composition.headline}
            panelShare={composition.panel}
            admittedShare={composition.admitted}
            demo={demo}
          />
        )}
        {selected && patient && trial && pair && sections && leaves ? (
          <section className="space-y-3" aria-label="Criteria">
            <PatientStrip patient={patient} />
            <PairSummary trial={trial} pair={pair} leaves={leaves} />
            <CriteriaTable
              key={`${selected.patientId}:${selected.nctId}`}
              sections={sections}
              initialOpen={unknownIds}
            />
          </section>
        ) : selected ? (
          <MissingData
            file="app/_data/cube.json"
            detail={`No pair for ${selected.patientId} × ${selected.nctId}.`}
          />
        ) : null}
        <Provenance meta={meta} call="rank(evaluate(patient × trial)) · top 25" />
      </main>
    </>
  );
}
