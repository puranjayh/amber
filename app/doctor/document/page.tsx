import Link from "next/link";
import { protocolSource } from "@/app/_data/protocolText";
import { asOf, getPair, getPatient, getTrial } from "@/app/_data/source";
import { isStaticDemo, one } from "@/components/console/params";
import { MissingData } from "@/components/console/MissingData";
import { doctorChartPath, doctorMayOpen } from "@/components/hcp/access";
import { DoctorChrome } from "@/components/hcp/DoctorChrome";
import { buildLetter } from "@/components/hcp/letter";
import { NotYourPatient } from "@/components/hcp/NotYourPatient";
import { PatientLetter } from "@/components/hcp/PatientLetter";
import { PrintLetter } from "@/components/hcp/PrintLetter";
import { DEFAULT_PHYSICIAN_ID, doctorTalk, PHYSICIANS } from "@/components/hcp/roster";
import { attributePatients } from "@/components/worklist/attribution";
import { anchorById, isAnchor } from "@/components/console/anchors";

export const metadata = { title: "Patient information — Impiricus" };

export default async function DocumentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const demo = isStaticDemo(sp);
  const demoMode = one(sp.demo) === "static" ? "static" : "1";
  const anchor = anchorById(isAnchor(one(sp.trial)) ? one(sp.trial) : undefined);
  const requestedPhysician = one(sp.physician);
  const physicianId = PHYSICIANS.some((p) => p.id === requestedPhysician)
    ? requestedPhysician!
    : DEFAULT_PHYSICIAN_ID;
  const physician = PHYSICIANS.find((p) => p.id === physicianId) ?? PHYSICIANS[0];
  const patientId = one(sp.patient);
  const nctId = one(sp.trial);
  const attributions = attributePatients([patientId].filter((id): id is string => Boolean(id)));
  const mine = new Set(
    attributions.filter((row) => row.physicianId === physicianId).map((row) => row.patientId),
  );
  const gate = doctorMayOpen(patientId, mine);
  const back = patientId
    ? doctorChartPath({
        physicianId,
        patientId,
        trialId: nctId,
        demo: demo ? demoMode : null,
      })
    : `/doctor?physician=${encodeURIComponent(physicianId)}&view=patients${demo ? `&demo=${demoMode}` : ""}`;

  return (
    <DoctorChrome
      asOf={asOf}
      demo={demo}
      demoMode={demoMode}
      physicianId={physicianId}
      trial={anchor.nctId}
      view="patients"
    >
      <main className="mx-auto w-full max-w-2xl flex-1 px-3 py-6 sm:px-6 sm:py-8">
        <div className="no-print mb-4 flex flex-wrap items-start justify-between gap-3">
          <Link href={back} className="text-[13px] text-ink underline-offset-2 hover:underline">
            Back to chart
          </Link>
          {gate === "open" ? <PrintLetter /> : null}
        </div>
        {gate === "denied" && patientId ? <NotYourPatient patientId={patientId} /> : null}
        {gate === "closed" ? (
          <p className="text-[13px] text-ink-2">
            Pick one of your patients, then a trial, to prepare this note.
          </p>
        ) : null}
        {gate === "open" && patientId ? (
          <LetterBody
            patientId={patientId}
            nctId={nctId}
            physicianName={physician.name}
            physicianTalk={doctorTalk(physician.name)}
            physicianSite={physician.site}
          />
        ) : null}
      </main>
    </DoctorChrome>
  );
}

function LetterBody({
  patientId,
  nctId,
  physicianName,
  physicianTalk,
  physicianSite,
}: {
  patientId: string;
  nctId?: string;
  physicianName: string;
  physicianTalk: string;
  physicianSite: string;
}) {
  const patient = getPatient(patientId);
  const trial = nctId ? getTrial(nctId) : undefined;
  const pair = nctId ? getPair(patientId, nctId) : undefined;
  if (!patient || !trial || !pair) {
    return (
      <MissingData
        file="app/_data/cube.json"
        detail={`No pair for ${patientId}${nctId ? ` × ${nctId}` : ""}.`}
      />
    );
  }
  const travelMinutes = trial.siteDistanceMinutes ?? patient.travelMinutes ?? null;
  const travelFrom =
    trial.siteDistanceMinutes !== undefined
      ? "site"
      : patient.travelMinutes !== undefined
        ? "record"
        : "none";
  const letter = buildLetter({
    patient,
    trial,
    pair,
    physicianName,
    physicianTalk,
    physicianSite,
    asOf,
    protocolText: protocolSource(trial.nctId),
    travelMinutes,
    travelFrom,
  });
  return <PatientLetter letter={letter} />;
}
