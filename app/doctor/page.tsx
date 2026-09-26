import { redirect } from "next/navigation";
import { readLoop } from "@/app/_data/loop";
import { syncRegistry } from "@/app/_data/registry-sync";
import {
  DEMO,
  asOf,
  getAnchorRows,
  getDemoWorklist,
  getPair,
  getPairsForPatient,
  getPatient,
  getPatients,
  getTrial,
  getTrials,
  meta,
} from "@/app/_data/source";
import { fetchStudy } from "@/app/_data/ctgov";
import type { RegistryStudy } from "@/app/_data/schema";
import { orderCorresponds, orderFor } from "@/components/alert/alert";
import { MissingData } from "@/components/console/MissingData";
import { Provenance } from "@/components/console/Provenance";
import { isStaticDemo, one } from "@/components/console/params";
import { collectLeaves } from "@/components/criteria/rows";
import { toneCounts } from "@/components/criteria/tone";
import { doctorChartPath, doctorMayOpen, doctorQuery } from "@/components/hcp/access";
import { DoctorChrome } from "@/components/hcp/DoctorChrome";
import { DoctorTabs } from "@/components/hcp/DoctorTabs";
import { HcpLive } from "@/components/hcp/HcpLive";
import { HcpView, type HcpRosterRow } from "@/components/hcp/HcpView";
import { NotYourPatient } from "@/components/hcp/NotYourPatient";
import { TrialCards } from "@/components/hcp/TrialCards";
import { DEFAULT_PHYSICIAN_ID, PHYSICIANS } from "@/components/hcp/roster";
import { buildTrialCards, rowsForTrial, tierLine } from "@/components/hcp/trialBoard";
import { attributePatients } from "@/components/worklist/attribution";
import { draftOutreach } from "@/components/hcp/outreach";
import { clinicFocus, describeClinic, trialWords } from "@/components/hcp/clinic";
import { panelComposition, takePanel } from "@/components/hcp/panel";
import { LOOP_FOCUS, pairTravel, prefsByPatient, rank } from "@/components/loop/rank";
import { anchorById } from "@/components/console/anchors";

export const metadata = { title: "Impiricus — Doctor portal" };

export default async function DoctorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const demo = isStaticDemo(sp);
  const demoMode = one(sp.demo) === "static" ? "static" : "1";
  const view = one(sp.view) === "trials" ? "trials" : "patients";
  const requestedTrial = one(sp.trial);
  const trialId =
    requestedTrial && /^NCT\d{8}$/.test(requestedTrial) ? requestedTrial : anchorById(undefined).nctId;
  const home = getAnchorRows(anchorById(undefined).nctId);
  const loopWorklist = getDemoWorklist();
  if (!demo) await syncRegistry();
  const loop = demo ? null : await readLoop(loopWorklist);
  const prefs = loop ? prefsByPatient(loop.preferences) : {};
  const pinned = getAnchorRows(trialId);
  const ordered = loop
    ? rank(pinned, prefs, (row) => pairTravel(getPatient(row.patientId), getTrial(row.nctId)))
    : pinned;
  const attributions = attributePatients(home.map((row) => row.patientId));
  const requested = one(sp.patient);
  const requestedPhysician = one(sp.physician);
  const physicianId = PHYSICIANS.some((p) => p.id === requestedPhysician)
    ? requestedPhysician!
    : DEFAULT_PHYSICIAN_ID;
  const physician = PHYSICIANS.find((p) => p.id === physicianId) ?? PHYSICIANS[0];
  const mine = new Set(
    attributions.filter((a) => a.physicianId === physicianId).map((a) => a.patientId),
  );
  if (home.length === 0) {
    return (
      <>
        <DoctorChrome
          asOf={asOf}
          demo={demo}
          demoMode={demoMode}
          physicianId={physicianId}
          trial={trialId}
        />
        <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-6 sm:px-6">
          <MissingData file="app/_data/anchors.json" />
        </main>
      </>
    );
  }
  if (view === "trials") {
    const pairs = [...mine].flatMap((id) => getPairsForPatient(id));
    const studies = new Map((loop?.registry ?? []).map((row) => [row.nctId, row.study] as const));
    const nctIds = [...new Set(pairs.map((pair) => pair.nctId))];
    if (!demo) await fillEnrollment(nctIds, studies);
    const cards = buildTrialCards({
      pairs,
      trials: new Map(getTrials().map((trial) => [trial.nctId, trial])),
      studies,
      origin: { lat: physician.lat, lon: physician.lon },
    });
    return (
      <>
        <DoctorChrome
          asOf={asOf}
          demo={demo}
          demoMode={demoMode}
          physicianId={physicianId}
          trial={trialId}
        />
        <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-3 py-6 sm:px-6 sm:py-8">
          <DoctorTabs
            physicianId={physicianId}
            trial={trialId}
            demo={demo ? demoMode : null}
            view="trials"
          />
          <TrialCards
            cards={cards}
            hrefFor={(nctId) =>
              doctorQuery({ physicianId, trialId: nctId, demo: demo ? demoMode : null })
            }
          />
          <Provenance meta={meta} call="rank(evaluate(patient × trial)) · this physician only" />
        </main>
      </>
    );
  }
  const onTrial = [...mine].flatMap((id) => {
    const pair = getPair(id, trialId);
    return pair ? [pair] : [];
  });
  const scoped = rowsForTrial(mine, ordered, onTrial);
  const extraIds = new Set(
    [
      requested && mine.has(requested) ? requested : undefined,
      LOOP_FOCUS,
      DEMO.patientId,
      ...(loop?.nudges
        .filter((n) => n.kind === "enrol_patient" && n.status !== "done" && mine.has(n.patientId))
        .map((n) => n.patientId) ?? []),
    ].filter((id): id is string => Boolean(id)),
  );
  const panel = takePanel(
    scoped,
    25,
    demo && mine.has(DEMO.patientId) ? DEMO.patientId : undefined,
  );
  for (const id of extraIds) {
    if (panel.some((row) => row.patientId === id)) continue;
    const row = scoped.find((r) => r.patientId === id);
    if (row) panel.push(row);
  }
  if (panel.length === 0) {
    return (
      <>
        <DoctorChrome
          asOf={asOf}
          demo={demo}
          demoMode={demoMode}
          physicianId={physicianId}
          trial={trialId}
        />
        <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-3 py-6 sm:px-6">
          <DoctorTabs
            physicianId={physicianId}
            trial={trialId}
            demo={demo ? demoMode : null}
            view="patients"
          />
          <p className="text-[15px] text-ink-2">No patients on this trial are on your panel.</p>
        </main>
      </>
    );
  }

  const patients = getPatients();
  const composition = panelComposition(panel, scoped, patients);
  const gate = doctorMayOpen(requested, mine);
  if (gate === "open" && requested) {
    redirect(
      doctorChartPath({
        physicianId,
        patientId: requested,
        trialId: one(sp.trial),
        demo: demo ? demoMode : null,
      }),
    );
  }
  const focusTrial = getTrial(trialId);
  const leaves = focusTrial ? collectLeaves(focusTrial.criteria) : new Map();
  const rows: HcpRosterRow[] = panel.map((row) => {
    const patient = getPatient(row.patientId);
    const trial = getTrial(row.nctId);
    const pair = getPair(row.patientId, row.nctId);
    const focus =
      patient && trial && pair ? clinicFocus(pair, trial, row.blocking[0]?.criterionId) : undefined;
    const cell = focus && pair && !pair.eliminated ? focus.cell : undefined;
    const leaf = focus && pair && !pair.eliminated ? focus.leaf : undefined;
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
    const card = patient
      ? describeClinic({
          patient,
          nctId: row.nctId,
          trialTitle: trial?.title,
          eliminated: row.eliminated,
          unknownCount: row.unknownCount,
          leaf: focus?.leaf,
          reason: focus?.cell.reason,
          orderTitle: order?.title,
          asOf,
        })
      : describeClinic({
          patient: {
            id: row.patientId,
            age: 0,
            sex: "unknown",
            race: "",
            facts: [],
          },
          nctId: row.nctId,
          trialTitle: trial?.title,
          eliminated: row.eliminated,
          unknownCount: row.unknownCount,
          asOf,
        });
    const tones = pair ? toneCounts(pair.cells, (id) => leaves.get(id)?.type) : null;
    return {
      patientId: row.patientId,
      nctId: row.nctId,
      ...card,
      draft,
      met: tones ? tones.green : null,
      total: leaves.size || null,
      tier: tierLine(row.resolutionTier),
    };
  });

  return (
    <>
      <DoctorChrome
        asOf={asOf}
        demo={demo}
        demoMode={demoMode}
        physicianId={physicianId}
          trial={trialId}
        />
        <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-3 py-6 sm:px-6 sm:py-8">
          <DoctorTabs
            physicianId={physicianId}
            trial={trialId}
            demo={demo ? demoMode : null}
            view="patients"
          />
          <p className="text-[15px] text-ink-2">
            {trialWords(trialId, focusTrial?.title)}
          </p>
        {loop ? (
          <HcpLive
            rows={rows}
            selectedId={undefined}
            headline={composition.headline}
            panelShare={composition.panel}
            admittedShare={composition.admitted}
            initial={loop}
            physicianId={physicianId}
            physicianPatients={[...mine]}
            demoMode={demo ? demoMode : undefined}
          />
        ) : (
          <HcpView
            rows={rows}
            selectedId={undefined}
            headline={composition.headline}
            panelShare={composition.panel}
            admittedShare={composition.admitted}
            physicianId={physicianId}
            demoMode={demo ? demoMode : undefined}
          />
        )}
        {gate === "denied" && requested ? <NotYourPatient patientId={requested} /> : null}
        <Provenance meta={meta} call="rank(evaluate(patient × trial)) · this physician only" />
      </main>
    </>
  );
}

/** Fill enrollment and sites from ClinicalTrials.gov when the cached snapshot is missing them. */
async function fillEnrollment(nctIds: string[], studies: Map<string, RegistryStudy>): Promise<void> {
  await Promise.all(
    nctIds.map(async (nctId) => {
      const have = studies.get(nctId);
      if (have && have.enrollmentCount != null && have.sites.length > 0) return;
      try {
        const fresh = await fetchStudy(nctId);
        if (!fresh) return;
        studies.set(nctId, {
          ...fresh,
          sites: fresh.sites.length > 0 ? fresh.sites : (have?.sites ?? []),
          enrollmentCount: fresh.enrollmentCount ?? have?.enrollmentCount,
        });
      } catch {
        /* the card says the registry record is missing rather than inventing a count */
      }
    }),
  );
}
