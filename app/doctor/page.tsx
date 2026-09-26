import Link from "next/link";
import { redirect } from "next/navigation";
import { readLoop } from "@/app/_data/loop";
import { syncRegistry } from "@/app/_data/registry-sync";
import {
  asOf,
  getAnchorRows,
  getDemoWorklist,
  getPair,
  getPairsForPatient,
  getPatient,
  getTrial,
  getTrials,
  meta,
} from "@/app/_data/source";
import { fetchStudy } from "@/app/_data/ctgov";
import type { RegistryStudy } from "@/app/_data/schema";
import { orderCorresponds, orderFor } from "@/components/alert/alert";
import { DoctorPatients, type DoctorListRow } from "@/components/console/DoctorPatients";
import { DoctorRetention } from "@/components/console/DoctorRetention";
import { DoctorTrials } from "@/components/console/DoctorTrials";
import { MissingData } from "@/components/console/MissingData";
import { Provenance } from "@/components/console/Provenance";
import { followUpsByTrial, trialNews } from "@/components/console/trialNews";
import { isStaticDemo, one } from "@/components/console/params";
import { doctorChartPath, doctorMayOpen, doctorQuery } from "@/components/hcp/access";
import { DoctorChrome } from "@/components/hcp/DoctorChrome";
import { NotYourPatient } from "@/components/hcp/NotYourPatient";
import { DEFAULT_PHYSICIAN_ID, PHYSICIANS } from "@/components/hcp/roster";
import { buildTrialCards, rowsForTrial, tierLine } from "@/components/hcp/trialBoard";
import { attributePatients } from "@/components/worklist/attribution";
import { draftOutreach } from "@/components/hcp/outreach";
import { clinicFocus, describeClinic, trialWords } from "@/components/hcp/clinic";
import { pairTravel, prefsByPatient, rank } from "@/components/loop/rank";
import { anchorById } from "@/components/console/anchors";
import { readiness } from "@/components/worklist/readiness";

export const metadata = { title: "Impiricus — Doctor portal" };

const WIDE = "mx-auto w-full max-w-[1600px]";

export default async function DoctorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const demo = isStaticDemo(sp);
  const demoMode = one(sp.demo) === "static" ? "static" : "1";
  const view = one(sp.view) === "patients" ? "patients" : "trials";
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
  const chrome = (
    <DoctorChrome
      asOf={asOf}
      demo={demo}
      demoMode={demoMode}
      physicianId={physicianId}
      trial={trialId}
    />
  );
  if (home.length === 0) {
    return (
      <>
        {chrome}
        <main className={`${WIDE} flex-1 px-4 py-6 sm:px-8`}>
          <MissingData file="app/_data/anchors.json" />
        </main>
      </>
    );
  }

  const nav = (
    <DoctorNav
      physicianId={physicianId}
      trial={trialId}
      demo={demo ? demoMode : null}
      view={view}
    />
  );

  if (view === "trials") {
    const pairs = [...mine].flatMap((id) => getPairsForPatient(id));
    const studies = new Map((loop?.registry ?? []).map((row) => [row.nctId, row.study] as const));
    const nctIds = [...new Set(pairs.map((pair) => pair.nctId))];
    if (!demo) await fillEnrollment(nctIds, studies);
    const trials = new Map(getTrials().map((trial) => [trial.nctId, trial]));
    const cards = buildTrialCards({
      pairs,
      trials,
      studies,
      origin: { lat: physician.lat, lon: physician.lon },
    });
    const news = trialNews(
      cards.flatMap((card) => {
        const study = studies.get(card.nctId);
        return study ? [{ nctId: card.nctId, title: card.title, study }] : [];
      }),
      followUpsByTrial(loop?.nudges ?? [], mine),
    );
    return (
      <>
        {chrome}
        <main className={`${WIDE} flex-1 space-y-6 px-4 py-6 sm:px-8 sm:py-8`}>
          {nav}
          <h1 className="text-[28px] font-semibold text-ink">Trials</h1>
          <DoctorTrials
            items={news}
            cards={cards.map((card) => ({
              ...card,
              href: doctorQuery({ physicianId, trialId: card.nctId, demo: demo ? demoMode : null }),
            }))}
          />
          {loop ? (
            <DoctorRetention initial={loop} physicianId={physicianId} patientIds={[...mine]} />
          ) : null}
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
  const rows: DoctorListRow[] = scoped.map((row, index) => {
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
        ? draftOutreach({ patientId: row.patientId, trial, cell, leaf, order })
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
          patient: { id: row.patientId, age: 0, sex: "unknown", race: "", facts: [] },
          nctId: row.nctId,
          trialTitle: trial?.title,
          eliminated: row.eliminated,
          unknownCount: row.unknownCount,
          asOf,
        });
    const counts = countTrials(row.patientId);
    const details = patient
      ? [patient.sex === "unknown" ? "" : patient.sex, patient.race, card.picture].filter(Boolean).join(" · ")
      : card.picture;
    return {
      key: row.patientId,
      rank: index + 1,
      name: card.name,
      details,
      trialName: card.trialName,
      blocker: card.blocker,
      tier: tierLine(row.resolutionTier),
      blockingType: order?.title ?? card.blocker,
      close: readiness(row),
      ...counts,
      href: doctorChartPath({
        physicianId,
        patientId: row.patientId,
        trialId: row.nctId,
        demo: demo ? demoMode : null,
      }),
      draft,
    };
  });

  return (
    <>
      {chrome}
      <main className={`${WIDE} flex-1 space-y-6 px-4 py-6 sm:px-8 sm:py-8`}>
        {nav}
        <div>
          <h1 className="text-[28px] font-semibold text-ink">My patients</h1>
          <p className="mt-1 text-[15px] text-ink-2">{trialWords(trialId, focusTrial?.title)}</p>
        </div>
        {rows.length === 0 ? (
          <p className="text-[15px] text-ink-2">No patients on this trial are on your panel.</p>
        ) : (
          <DoctorPatients rows={rows} />
        )}
        {gate === "denied" && requested ? <NotYourPatient patientId={requested} /> : null}
        <Provenance meta={meta} call="rank(evaluate(patient × trial)) · this physician only" />
      </main>
    </>
  );
}

function DoctorNav({
  physicianId,
  trial,
  demo,
  view,
}: {
  physicianId: string;
  trial: string;
  demo: "1" | "static" | null;
  view: "patients" | "trials";
}) {
  const patients = new URLSearchParams();
  const trials = new URLSearchParams();
  if (demo) {
    patients.set("demo", demo);
    trials.set("demo", demo);
  }
  patients.set("physician", physicianId);
  trials.set("physician", physicianId);
  if (trial) {
    patients.set("trial", trial);
    trials.set("trial", trial);
  }
  patients.set("view", "patients");
  trials.set("view", "trials");
  const item = (current: boolean) =>
    `border-b-2 px-1 py-2 text-[15px] ${current ? "border-ink font-medium text-ink" : "border-transparent text-ink-3 hover:text-ink"}`;
  return (
    <nav className="flex gap-5" aria-label="Doctor views">
      <Link href={`/doctor?${trials}`} aria-current={view === "trials" ? "page" : undefined} className={item(view === "trials")}>
        Trials
      </Link>
      <Link href={`/doctor?${patients}`} aria-current={view === "patients" ? "page" : undefined} className={item(view === "patients")}>
        My patients
      </Link>
    </nav>
  );
}

function countTrials(patientId: string): { eligible: number; unknown: number; rejected: number } {
  let eligible = 0;
  let unknown = 0;
  let rejected = 0;
  for (const pair of getPairsForPatient(patientId)) {
    if (pair.eliminated) rejected += 1;
    else if (pair.unknownCount === 0) eligible += 1;
    else unknown += 1;
  }
  return { eligible, unknown, rejected };
}

/** Fill enrollment and sites from ClinicalTrials.gov when the cached snapshot is missing them. */
async function fillEnrollment(nctIds: string[], studies: Map<string, RegistryStudy>): Promise<void> {
  await Promise.all(
    nctIds.map(async (nctId) => {
      const have = studies.get(nctId);
      if (have && have.enrollmentCount != null && have.sites.length > 0 && have.lastUpdatePostDate) return;
      try {
        const fresh = await fetchStudy(nctId);
        if (!fresh) return;
        studies.set(nctId, {
          ...fresh,
          sites: fresh.sites.length > 0 ? fresh.sites : (have?.sites ?? []),
          enrollmentCount: fresh.enrollmentCount ?? have?.enrollmentCount,
          lastUpdatePostDate: fresh.lastUpdatePostDate ?? have?.lastUpdatePostDate ?? null,
          primaryCompletionDate: fresh.primaryCompletionDate ?? have?.primaryCompletionDate ?? null,
        });
      } catch {
        /* the card says the registry record is missing rather than inventing a count */
      }
    }),
  );
}
