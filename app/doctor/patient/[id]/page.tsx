import Link from "next/link";
import { readLoop } from "@/app/_data/loop";
import { protocolSource } from "@/app/_data/protocolText";
import { syncRegistry } from "@/app/_data/registry-sync";
import {
  asOf,
  getDemoWorklist,
  getPairsForPatient,
  getPatient,
  getTrial,
  getWorklist,
  meta,
} from "@/app/_data/source";
import { anchorById, isAnchor } from "@/components/console/anchors";
import { MissingData } from "@/components/console/MissingData";
import { Provenance } from "@/components/console/Provenance";
import { isStaticDemo, one } from "@/components/console/params";
import { boardEntries, focusOrder } from "@/components/document/board";
import { PatientBoard, type BoardDetail } from "@/components/document/PatientBoard";
import { doctorMayOpen, documentQuery } from "@/components/hcp/access";
import { displayName, panelName } from "@/components/hcp/clinic";
import { buildLetter, letterText } from "@/components/hcp/letter";
import { DoctorChrome } from "@/components/hcp/DoctorChrome";
import { NotYourPatient } from "@/components/hcp/NotYourPatient";
import { DEFAULT_PHYSICIAN_ID, doctorTalk, PHYSICIANS } from "@/components/hcp/roster";
import { attributePatients } from "@/components/worklist/attribution";

const EMPTY_LOOP = {
  backend: "file" as const,
  preferences: [],
  nudges: [],
  notes: [],
  registry: [],
  releases: [],
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patient = getPatient(decodeURIComponent(id));
  return { title: patient ? `${displayName(patient)} — Impiricus` : "Impiricus — Doctor portal" };
}

export default async function DoctorPatientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const patientId = decodeURIComponent(id);
  const sp = await searchParams;
  const demo = isStaticDemo(sp);
  const demoMode = one(sp.demo) === "static" ? "static" : "1";
  const requestedPhysician = one(sp.physician);
  const physicianId = PHYSICIANS.some((p) => p.id === requestedPhysician)
    ? requestedPhysician!
    : DEFAULT_PHYSICIAN_ID;
  const physician = PHYSICIANS.find((row) => row.id === physicianId) ?? PHYSICIANS[0];
  const mine = new Set(
    attributePatients(getWorklist().map((row) => row.patientId))
      .filter((row) => row.physicianId === physicianId)
      .map((row) => row.patientId),
  );
  const gate = doctorMayOpen(patientId, mine);
  const anchor = anchorById(isAnchor(one(sp.trial)) ? one(sp.trial) : undefined);

  if (gate !== "open") {
    return (
      <>
        <DoctorChrome
          asOf={asOf}
          demo={demo}
          demoMode={demoMode}
          physicianId={physicianId}
          trial={anchor.nctId}
          view="patients"
        >
          <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-6 sm:px-6">
            <NotYourPatient patientId={patientId} />
          </main>
        </DoctorChrome>
      </>
    );
  }

  if (!demo) await syncRegistry();
  const loop = demo ? null : await readLoop(getDemoWorklist());
  const patient = getPatient(patientId);
  const pairs = getPairsForPatient(patientId);
  const entries = patient ? boardEntries(pairs, getTrial) : [];
  const requestedTrial = one(sp.trial);
  const initialNctId = entries.some((row) => row.nctId === requestedTrial)
    ? requestedTrial!
    : (entries[0]?.nctId ?? "");
  const details: BoardDetail[] =
    patient === undefined
      ? []
      : entries.flatMap((entry) => {
          const trial = getTrial(entry.nctId);
          const pair = pairs.find((row) => row.nctId === entry.nctId);
          if (!trial || !pair) return [];
          return [
            {
              nctId: entry.nctId,
              trial,
              pair,
              documentHref: documentQuery({
                physicianId,
                patientId,
                trialId: trial.nctId,
                demo: demo ? demoMode : null,
              }),
              documentBody: letterText(
                buildLetter({
                  patient,
                  trial,
                  pair,
                  physicianName: physician.name,
                  physicianTalk: doctorTalk(physician.name),
                  physicianSite: physician.site,
                  asOf,
                  protocolText: protocolSource(trial.nctId),
                  travelMinutes: trial.siteDistanceMinutes ?? patient.travelMinutes ?? null,
                  travelFrom:
                    trial.siteDistanceMinutes !== undefined
                      ? "site"
                      : patient.travelMinutes !== undefined
                        ? "record"
                        : "none",
                }),
              ),
              order: focusOrder(patient, trial, pair),
            },
          ];
        });

  return (
    <>
      <DoctorChrome
        asOf={asOf}
        demo={demo}
        demoMode={demoMode}
        physicianId={physicianId}
        trial={anchor.nctId}
        view="patients"
      >
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-3 py-6 sm:px-6 sm:py-8">
        <div>
          <Link
            href={`/doctor?physician=${encodeURIComponent(physicianId)}&view=patients${demo ? `&demo=${demoMode}` : ""}`}
            className="text-[13px] font-medium text-brand hover:text-ink"
          >
            ← My patients
          </Link>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h1 className="text-[28px] font-semibold text-ink">
              {patient ? panelName(patient.id) : patientId}
              <span className="ml-2 align-middle font-mono text-[13px] font-normal text-ink-3">{patientId}</span>
            </h1>
            <span className="text-[11px] text-ink-3">synthetic</span>
          </div>
        </div>
        {patient && entries.length > 0 ? (
          <PatientBoard
            patient={patient}
            entries={entries}
            details={details}
            initialNctId={initialNctId}
            loop={loop ?? EMPTY_LOOP}
            live={Boolean(loop)}
          />
        ) : (
          <MissingData file="app/_data/cube.json" detail={`No pair for ${patientId}.`} />
        )}
        <Provenance meta={meta} call="rank(evaluate(patient × trial)) · this physician only" />
      </main>
      </DoctorChrome>
    </>
  );
}
