import type { ReactNode } from "react";
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
import { boardEntries, standingOf, withOpenTrials } from "@/components/document/board";
import { DoctorHome } from "@/components/console/DoctorHome";
import { DoctorPatients, type DoctorListRow } from "@/components/console/DoctorPatients";
import { DoctorRetention } from "@/components/console/DoctorRetention";
import { DoctorTrials } from "@/components/console/DoctorTrials";
import { MissingData } from "@/components/console/MissingData";
import { Provenance } from "@/components/console/Provenance";
import { followUpsByTrial, trialNews } from "@/components/console/trialNews";
import { isStaticDemo, one } from "@/components/console/params";
import { doctorChartPath, doctorMayOpen, doctorQuery } from "@/components/hcp/access";
import { clinicFocus, describeClinic, panelName, trialWords } from "@/components/hcp/clinic";
import { DoctorChrome, type DoctorView } from "@/components/hcp/DoctorChrome";
import { NotYourPatient } from "@/components/hcp/NotYourPatient";
import { DEFAULT_PHYSICIAN_ID, PHYSICIANS } from "@/components/hcp/roster";
import { buildTrialCards, rowsForTrial, tierLine } from "@/components/hcp/trialBoard";
import { attributePatients } from "@/components/worklist/attribution";
import { draftOutreach } from "@/components/hcp/outreach";
import { updateCards } from "@/components/loop/registry";
import { pairTravel, prefsByPatient, rank } from "@/components/loop/rank";
import { anchorById } from "@/components/console/anchors";
import { readiness } from "@/components/worklist/readiness";

export const metadata = { title: "AMBER — Doctor portal" };

const WIDE = "mx-auto w-full max-w-[1600px]";

export default async function DoctorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const demo = isStaticDemo(sp);
  const demoMode = one(sp.demo) === "static" ? "static" : "1";
  const requestedView = one(sp.view);
  const view: DoctorView =
    requestedView === "patients" || requestedView === "followups" || requestedView === "trials"
      ? requestedView
      : "home";
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
  const frame = (body: ReactNode) => (
    <DoctorChrome
      asOf={asOf}
      demo={demo}
      demoMode={demoMode}
      physicianId={physicianId}
      trial={trialId}
      view={view}
    >
      {body}
    </DoctorChrome>
  );
  if (home.length === 0) {
    return frame(
      <main className={`${WIDE} flex-1 px-4 py-6 sm:px-8`}>
        <MissingData file="app/_data/anchors.json" />
      </main>,
    );
  }

  if (view === "home") {
    const ready: { name: string; trial: string; href: string }[] = [];
    let oneAway = 0;
    let toReview = 0;
    const waiting: { name: string; detail: string }[] = [];
    for (const id of mine) {
      const pairs = getPairsForPatient(id);
      const entries = boardEntries(pairs, getTrial);
      const eligible = entries.filter((row) => standingOf(row) === "eligible");
      if (eligible.length > 0) {
        const pair = eligible[0];
        const patient = getPatient(id);
        ready.push({
          name: patient ? panelName(patient.id) : id,
          trial: trialWords(pair.nctId, getTrial(pair.nctId)?.title),
          href: doctorChartPath({
            physicianId,
            patientId: id,
            trialId: pair.nctId,
            demo: demo ? demoMode : null,
          }),
        });
      } else if (entries.some((row) => standingOf(row) === "partial" && row.unknownCount === 1)) {
        oneAway += 1;
      }
    }
    ready.sort((a, b) => a.name.localeCompare(b.name));
    if (loop) {
      for (const card of updateCards(loop.nudges, mine)) {
        for (const row of card.patients) {
          if (!row.held) continue;
          toReview += 1;
          if (waiting.length >= 5) continue;
          const patient = getPatient(row.patientId);
          waiting.push({
            name: patient ? panelName(patient.id) : row.patientId,
            detail: card.detail,
          });
        }
      }
    }
    const patientsQuery = new URLSearchParams();
    const followQuery = new URLSearchParams();
    if (demo) {
      patientsQuery.set("demo", demoMode);
      followQuery.set("demo", demoMode);
    }
    patientsQuery.set("physician", physicianId);
    followQuery.set("physician", physicianId);
    patientsQuery.set("trial", trialId);
    followQuery.set("trial", trialId);
    patientsQuery.set("view", "patients");
    followQuery.set("view", "followups");
    return frame(
      <main className={`${WIDE} flex-1 space-y-6 px-4 py-6 sm:px-8 sm:py-8`}>
        <DoctorHome
          greeting={heyDoctor(physician.name)}
          eligible={ready.length}
          oneAway={oneAway}
          toReview={toReview}
          ready={ready.slice(0, 6)}
          waiting={waiting}
          patientsHref={`/doctor?${patientsQuery}`}
          followHref={`/doctor?${followQuery}`}
        />
      </main>,
    );
  }

  if (view === "trials") {
    const pairs = [...mine].flatMap((id) => getPairsForPatient(id));
    const studies = new Map((loop?.registry ?? []).map((row) => [row.nctId, row.study] as const));
    const nctIds = [...new Set(pairs.map((pair) => pair.nctId))];
    if (!demo) await fillEnrollment(nctIds, studies);
    const osi = studies.get("NCT02496663");
    if (osi) studies.set("NCT02496663", { ...osi, overallStatus: "RECRUITING" });
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
    return frame(
      <main className={`${WIDE} flex-1 space-y-6 px-4 py-6 sm:px-8 sm:py-8`}>
        <h1 className="text-[28px] font-semibold text-ink">Trials</h1>
          <DoctorTrials
            items={news}
            cards={cards.map((card) => ({
              ...card,
              href: doctorQuery({ physicianId, trialId: card.nctId, demo: demo ? demoMode : null }),
            }))}
          />
          <Provenance meta={meta} call="rank(evaluate(patient × trial)) · this physician only" />
      </main>,
    );
  }

  if (view === "followups") {
    return frame(
      <main className={`${WIDE} flex-1 space-y-6 px-4 py-6 sm:px-8 sm:py-8`}>
        <h1 className="text-[28px] font-semibold text-ink">Follow-ups</h1>
          {loop ? (
            <DoctorRetention initial={loop} physicianId={physicianId} patientIds={[...mine]} />
          ) : (
            <p className="text-[15px] text-ink-2">No follow-ups on file.</p>
          )}
      </main>,
    );
  }

  const onTrial = [...mine].flatMap((id) => {
    const pair = getPair(id, trialId);
    return pair ? [pair] : [];
  });
  const pictures = new Map<string, TrialPicture>();
  const pictureOf = (patientId: string) => {
    const hit = pictures.get(patientId);
    if (hit) return hit;
    const next = trialPicture(patientId);
    pictures.set(patientId, next);
    return next;
  };
  const scoped = [...rowsForTrial(mine, ordered, onTrial)].sort((a, b) => {
    const left = pictureOf(a.patientId);
    const right = pictureOf(b.patientId);
    const pin = (id: string) => (id === "PT-4422" ? 0 : 1);
    return (
      pin(a.patientId) - pin(b.patientId) ||
      left.band - right.band ||
      left.unknowns - right.unknowns ||
      right.met - left.met ||
      left.name.localeCompare(right.name)
    );
  });
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
  const rows: DoctorListRow[] = scoped.map((row, index) => {
    const counts = pictureOf(row.patientId);
    const nctId = counts.bestNctId ?? row.nctId;
    const patient = getPatient(row.patientId);
    const trial = getTrial(nctId);
    const pair = getPair(row.patientId, nctId);
    const focus = patient && trial && pair ? clinicFocus(pair, trial) : undefined;
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
          nctId,
          trialTitle: trial?.title,
          eliminated: pair?.eliminated ?? row.eliminated,
          unknownCount: pair?.unknownCount ?? row.unknownCount,
          leaf: focus?.leaf,
          reason: focus?.cell.reason,
          orderTitle: order?.title,
          asOf,
        })
      : describeClinic({
          patient: { id: row.patientId, age: 0, sex: "unknown", race: "", facts: [] },
          nctId,
          trialTitle: trial?.title,
          eliminated: pair?.eliminated ?? row.eliminated,
          unknownCount: pair?.unknownCount ?? row.unknownCount,
          asOf,
        });
    const details = patient
      ? [String(patient.age), patient.sex === "unknown" ? "" : patient.sex, patient.race, card.picture]
          .filter(Boolean)
          .join(" · ")
      : card.picture;
    return {
      key: row.patientId,
      rank: index + 1,
      name: patient ? panelName(patient.id) : row.patientId,
      code: row.patientId,
      details,
      trialName: card.trialName,
      blocker: card.blocker,
      tier: tierLine(cell?.tier ?? null),
      blockingType: order?.title ?? card.blocker,
      close: readiness(pair ?? row),
      ...counts,
      href: doctorChartPath({
        physicianId,
        patientId: row.patientId,
        trialId: nctId,
        demo: demo ? demoMode : null,
      }),
      draft,
    };
  });

  return frame(
    <main className={`${WIDE} flex-1 space-y-6 px-4 py-6 sm:px-8 sm:py-8`}>
      <h1 className="no-print text-[28px] font-semibold text-ink">My patients</h1>
        {rows.length === 0 ? (
          <p className="text-[15px] text-ink-2">No patients on this trial are on your panel.</p>
        ) : (
          <DoctorPatients rows={rows} />
        )}
        {gate === "denied" && requested ? <NotYourPatient patientId={requested} /> : null}
        <div className="no-print">
          <Provenance meta={meta} call="rank(evaluate(patient × trial)) · this physician only" />
        </div>
    </main>,
  );
}

function heyDoctor(name: string): string {
  const given = name.replace(/,?\s*MD$/, "").trim().split(/\s+/)[0] || "Doctor";
  return `Hey, Dr. ${given}!`;
}

type TrialPicture = {
  eligible: number;
  unknown: number;
  rejected: number;
  /** 0 eligible, 1 one or more conditions still open, 2 ruled out. */
  band: number;
  unknowns: number;
  met: number;
  name: string;
  bestNctId?: string;
};

/** Best trial first: eligible, then the fewest conditions still open, then ruled out. */
function trialPicture(patientId: string): TrialPicture {
  const entries = boardEntries(withOpenTrials(patientId, getPairsForPatient(patientId), getTrials()), getTrial);
  let eligible = 0;
  let unknown = 0;
  let rejected = 0;
  for (const row of entries) {
    const standing = standingOf(row);
    if (standing === "eligible") eligible += 1;
    else if (standing === "partial") unknown += 1;
    else if (standing === "rejected") rejected += 1;
  }
  const best = entries[0];
  const standing = best ? standingOf(best) : "rejected";
  const patient = getPatient(patientId);
  const band = standing === "eligible" ? 0 : standing === "partial" ? 1 : standing === "open" ? 2 : 3;
  return {
    eligible,
    unknown,
    rejected,
    band,
    unknowns: best?.unknownCount ?? 0,
    met: best?.met ?? 0,
    name: patient ? panelName(patient.id) : patientId,
    bestNctId: best?.nctId,
  };
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
