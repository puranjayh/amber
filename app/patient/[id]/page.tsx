import { readLoop } from "@/app/_data/loop";
import { asOf, getDemoWorklist, getPair, getPatient, getTrial, meta } from "@/app/_data/source";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { MissingData } from "@/components/console/MissingData";
import { Provenance } from "@/components/console/Provenance";
import { anchorById } from "@/components/console/anchors";
import { isStaticDemo, one } from "@/components/console/params";
import { trialPatientPath } from "@/components/hcp/access";
import { prefsByPatient, prefsStated } from "@/components/loop/rank";
import { listedTrials, panelSuggestions } from "@/components/patient/assemble";
import { PatientRecord } from "@/components/patient/PatientRecord";
import { attributePatient } from "@/components/worklist/attribution";
import { CoordinatorActions } from "@/components/worklist/CoordinatorActions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `AMBER — ${decodeURIComponent(id)}` };
}

export default async function TrialPatientPage({
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
  const patient = getPatient(patientId);
  const trials = listedTrials(patientId);
  const requestedTrial = one(sp.trial);
  const nctId = trials.some((row) => row.nctId === requestedTrial)
    ? requestedTrial!
    : trials[0]?.nctId;
  const trial = nctId ? getTrial(nctId) : undefined;
  const pair = nctId ? getPair(patientId, nctId) : undefined;
  const physician = attributePatient(patientId);
  const loop = demo ? null : await readLoop(getDemoWorklist());
  const stated = prefsStated(loop ? prefsByPatient(loop.preferences)[patientId] : undefined);
  const backTrial = anchorById(nctId).nctId;
  const back = `/?trial=${backTrial}${demo ? `&demo=${demoMode}` : ""}`;
  const suggestions = panelSuggestions(patientId, nctId ?? "", physician.physicianId);

  return (
    <>
      <ConsoleHeader
        asOf={asOf}
        active="worklist"
        demo={demo}
        demoMode={demoMode}
        trial={backTrial}
      />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-3 py-6 sm:px-6 sm:py-8">
        <PatientRecord
          backHref={back}
          backLabel="Worklist"
          kicker="Trial portal · coordinator"
          title={patientId}
          blurb={`You see across physicians. This patient belongs to ${physician.name}${
            physician.specialty ? `, ${physician.specialty}` : ""
          } · ${physician.site} · ${physician.source}. You can nudge that physician or ask the patient for preferences. You do not suggest a trial.`}
          actions={
            <CoordinatorActions
              patientId={patientId}
              nctId={trial?.nctId ?? nctId ?? ""}
              physicianName={physician.talk}
              stated={stated}
              initial={
                loop ?? {
                  backend: "file",
                  preferences: [],
                  nudges: [],
                  notes: [],
                  registry: [],
                  releases: [],
                }
              }
              live={Boolean(loop)}
            />
          }
          patient={patient}
          trial={trial}
          pair={pair}
          trials={trials}
          trialHref={(next) =>
            trialPatientPath(patientId, { trialId: next, demo: demo ? demoMode : null })
          }
          suggestions={suggestions}
          suggestionHref={(peer) =>
            trialPatientPath(peer.patientId, { trialId: peer.nctId, demo: demo ? demoMode : null })
          }
        />
        {!(patient && trial && pair) && (
          <MissingData
            file="app/_data/cube.json"
            detail={!patient ? `No patient ${patientId}.` : `No pair for ${patientId}.`}
          />
        )}
        <Provenance meta={meta} call="evaluate(patient × trial) · coordinator, this patient only" />
      </main>
    </>
  );
}
