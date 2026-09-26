import { readLoop } from "@/app/_data/loop";
import {
  DEMO,
  asOf,
  getEquity,
  getPair,
  getPairsForPatient,
  getPatient,
  getPatients,
  getTrial,
  getWorklist,
  meta,
} from "@/app/_data/source";
import { blockingUnknown, orderCorresponds, orderFor } from "@/components/alert/alert";
import { MissingData } from "@/components/console/MissingData";
import { Provenance } from "@/components/console/Provenance";
import { isStaticDemo, one } from "@/components/console/params";
import { PairDetail } from "@/components/criteria/PairDetail";
import { leafForCell } from "@/components/criteria/rows";
import { doctorMayOpen, doctorQuery } from "@/components/hcp/access";
import { DoctorActions, type DoctorOrder } from "@/components/hcp/DoctorActions";
import { DoctorChrome } from "@/components/hcp/DoctorChrome";
import { HcpLive } from "@/components/hcp/HcpLive";
import { HcpView, type HcpRosterRow } from "@/components/hcp/HcpView";
import { NotYourPatient } from "@/components/hcp/NotYourPatient";
import { trialsByWorth } from "@/components/hcp/patientTrials";
import { DEFAULT_PHYSICIAN_ID, PHYSICIANS } from "@/components/hcp/roster";
import { attributePatients } from "@/components/worklist/attribution";
import { draftOutreach } from "@/components/hcp/outreach";
import { hitForPair, panelComposition, takePanel } from "@/components/hcp/panel";
import { raceLabel } from "@/components/hcp/race";
import { pairTravel, prefsByPatient, rank, toPortalAnswers } from "@/components/loop/rank";
import type { LoopState, PortalAnswers } from "@/app/_data/schema";
import Link from "next/link";

export const metadata = { title: "Impiricus — Doctor portal" };

export default async function DoctorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const demo = isStaticDemo(sp);
  const demoMode = one(sp.demo) === "static" ? "static" : "1";
  const worklist = getWorklist();
  const loop = demo ? null : await readLoop(worklist);
  const prefs = loop ? prefsByPatient(loop.preferences) : {};
  const ordered = loop
    ? rank(worklist, prefs, (row) => pairTravel(getPatient(row.patientId), getTrial(row.nctId)))
    : worklist;
  const attributions = attributePatients(worklist.map((row) => row.patientId));
  const requested = one(sp.patient);
  const requestedPhysician = one(sp.physician);
  const physicianId = PHYSICIANS.some((p) => p.id === requestedPhysician)
    ? requestedPhysician!
    : DEFAULT_PHYSICIAN_ID;
  const mine = new Set(
    attributions.filter((a) => a.physicianId === physicianId).map((a) => a.patientId),
  );
  const scoped = ordered.filter((row) => mine.has(row.patientId));
  const extraIds = new Set(
    [
      requested && mine.has(requested) ? requested : undefined,
      ...(loop?.nudges
        .filter((n) => n.kind === "enrol_patient" && n.status !== "done" && mine.has(n.patientId))
        .map((n) => n.patientId) ?? []),
    ].filter((id): id is string => Boolean(id)),
  );
  const panel = takePanel(scoped, 25, demo && mine.has(DEMO.patientId) ? DEMO.patientId : undefined);
  for (const id of extraIds) {
    if (panel.some((row) => row.patientId === id)) continue;
    const row = scoped.find((r) => r.patientId === id);
    if (row) panel.push(row);
  }
  if (panel.length === 0) {
    return (
      <>
        <DoctorChrome asOf={asOf} demo={demo} demoMode={demoMode} physicianId={physicianId} />
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
  const gate = doctorMayOpen(requested, mine);
  const openId =
    gate === "open" ? requested : gate === "denied" ? undefined : demo && mine.has(DEMO.patientId) ? DEMO.patientId : undefined;
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

  return (
    <>
      <DoctorChrome asOf={asOf} demo={demo} demoMode={demoMode} physicianId={physicianId} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-3 px-3 py-4 sm:px-6 sm:py-6">
        {loop ? (
          <HcpLive
            rows={rows}
            selectedId={openId}
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
            selectedId={openId}
            headline={composition.headline}
            panelShare={composition.panel}
            admittedShare={composition.admitted}
            physicianId={physicianId}
            demoMode={demo ? demoMode : undefined}
          />
        )}
        {gate === "denied" && requested ? <NotYourPatient patientId={requested} /> : null}
        {openId ? (
          <DoctorChart
            patientId={openId}
            physicianId={physicianId}
            requestedTrial={one(sp.trial)}
            demo={demo}
            demoMode={demoMode}
            answers={
              loop?.preferences.find((row) => row.patientId === openId)
                ? toPortalAnswers(loop.preferences.find((row) => row.patientId === openId)!)
                : {}
            }
            loop={loop}
          />
        ) : null}
        <Provenance meta={meta} call="rank(evaluate(patient × trial)) · this physician only" />
      </main>
    </>
  );
}

function DoctorChart({
  patientId,
  physicianId,
  requestedTrial,
  demo,
  demoMode,
  answers,
  loop,
}: {
  patientId: string;
  physicianId: string;
  requestedTrial?: string;
  demo: boolean;
  demoMode: "1" | "static";
  answers: PortalAnswers;
  loop: LoopState | null;
}) {
  const patient = getPatient(patientId);
  const ranked = trialsByWorth(getPairsForPatient(patientId), getTrial, patient, answers);
  const nctId = ranked.some((row) => row.nctId === requestedTrial) ? requestedTrial! : ranked[0]?.nctId;
  const trial = nctId ? getTrial(nctId) : undefined;
  const pair = nctId ? getPair(patientId, nctId) : undefined;
  const cell = pair && trial && !pair.eliminated ? blockingUnknown(pair) : undefined;
  const leaf = trial && cell ? leafForCell(trial.criteria, cell) : undefined;
  const built = patient && leaf && cell ? orderFor(leaf, cell, patient) : undefined;
  const order: DoctorOrder | undefined =
    built && leaf && cell && orderCorresponds(leaf, cell, built)
      ? { title: built.title, detail: built.detail, criterionId: cell.criterionId, tier: cell.tier }
      : undefined;

  return (
    <section className="space-y-3" aria-label="Your patient">
      <div>
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-3">
          Your patient
        </p>
        <h2 className="mt-0.5 font-mono text-[16px] font-medium text-ink">{patientId}</h2>
        <p className="mt-0.5 text-[12px] text-ink-2">
          Trials ranked by what they are worth to this patient. You suggest, order, or dismiss. A coordinator
          does not.
        </p>
      </div>
      {ranked.length > 0 && (
        <ol className="overflow-hidden rounded-md border border-line bg-surface">
          {ranked.map((row, i) => {
            const current = row.nctId === nctId;
            return (
              <li key={row.nctId} className="border-b border-line-2 last:border-b-0">
                <Link
                  href={doctorQuery({
                    physicianId,
                    patientId,
                    trialId: row.nctId,
                    demo: demo ? demoMode : null,
                  })}
                  aria-current={current ? "true" : undefined}
                  className={`block px-3 py-2 hover:bg-canvas sm:px-4 ${current ? "bg-canvas" : ""}`}
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="font-mono text-[12px] font-medium text-ink">
                      <span className="mr-1.5 text-ink-3">{i + 1}.</span>
                      {row.nctId}
                    </span>
                    <span className="font-mono text-[11px] text-ink-3">
                      worth {row.worth.toFixed(2)} · {row.unknownCount}?
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-ink-2">{row.title}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
      {patient && trial && pair ? (
        <>
          <DoctorActions
            patientId={patientId}
            nctId={trial.nctId}
            order={order}
            initial={loop ?? { backend: "file", preferences: [], nudges: [], notes: [] }}
            live={Boolean(loop)}
          />
          <PairDetail patient={patient} trial={trial} pair={pair} />
        </>
      ) : (
        <MissingData file="app/_data/cube.json" detail={`No pair for ${patientId}.`} />
      )}
    </section>
  );
}
