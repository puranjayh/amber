import Link from "next/link";
import { readLoop } from "@/app/_data/loop";
import { syncRegistry } from "@/app/_data/registry-sync";
import {
  asOf,
  getDemoWorklist,
  getPair,
  getPatient,
  getTrial,
  getWorklist,
  meta,
} from "@/app/_data/source";
import { orderCorresponds, orderFor } from "@/components/alert/alert";
import { anchorById, isAnchor } from "@/components/console/anchors";
import { MissingData } from "@/components/console/MissingData";
import { Provenance } from "@/components/console/Provenance";
import { isStaticDemo, one } from "@/components/console/params";
import { doctorChartPath, doctorMayOpen, documentQuery } from "@/components/hcp/access";
import { clinicFocus, displayName } from "@/components/hcp/clinic";
import { DoctorActions, type DoctorOrder } from "@/components/hcp/DoctorActions";
import { DoctorChrome } from "@/components/hcp/DoctorChrome";
import { NotYourPatient } from "@/components/hcp/NotYourPatient";
import { DEFAULT_PHYSICIAN_ID, PHYSICIANS } from "@/components/hcp/roster";
import { listedTrials, panelSuggestions } from "@/components/patient/assemble";
import { PatientRecord } from "@/components/patient/PatientRecord";
import { attributePatients } from "@/components/worklist/attribution";

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
        />
        <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-6 sm:px-6">
          <NotYourPatient patientId={patientId} />
        </main>
      </>
    );
  }

  if (!demo) await syncRegistry();
  const loop = demo ? null : await readLoop(getDemoWorklist());
  const patient = getPatient(patientId);
  const trials = listedTrials(patientId);
  const requestedTrial = one(sp.trial);
  const nctId = trials.some((row) => row.nctId === requestedTrial)
    ? requestedTrial!
    : trials[0]?.nctId;
  const trial = nctId ? getTrial(nctId) : undefined;
  const pair = nctId ? getPair(patientId, nctId) : undefined;
  const focus = pair && trial ? clinicFocus(pair, trial) : undefined;
  const cell = focus && pair && !pair.eliminated ? focus.cell : undefined;
  const leaf = focus && pair && !pair.eliminated ? focus.leaf : undefined;
  const built = patient && leaf && cell ? orderFor(leaf, cell, patient) : undefined;
  const order: DoctorOrder | undefined =
    built && leaf && cell && orderCorresponds(leaf, cell, built)
      ? { title: built.title, detail: built.detail, criterionId: cell.criterionId, tier: cell.tier }
      : undefined;
  const suggestions = panelSuggestions(patientId, nctId ?? "", physicianId);
  const back = `/doctor?physician=${encodeURIComponent(physicianId)}${demo ? `&demo=${demoMode}` : ""}`;

  return (
    <>
      <DoctorChrome
        asOf={asOf}
        demo={demo}
        demoMode={demoMode}
        physicianId={physicianId}
        trial={anchor.nctId}
      />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-3 py-6 sm:px-6 sm:py-8">
        <PatientRecord
          backHref={back}
          backLabel="My patients"
          kicker="Doctor portal · your patient"
          title={patient ? displayName(patient) : patientId}
          blurb="You suggest, order, or dismiss. A coordinator does not."
          showRace={false}
          actions={
            patient && trial && pair ? (
              <>
                <p className="text-[13px] text-ink-2">
                  <Link
                    href={documentQuery({
                      physicianId,
                      patientId,
                      trialId: trial.nctId,
                      demo: demo ? demoMode : null,
                    })}
                    className="font-medium text-ink underline-offset-2 hover:underline"
                  >
                    Generate patient information
                  </Link>
                  <span className="text-ink-3">
                    {" "}
                    — a note for them to take home. It does not enrol them.
                  </span>
                </p>
                <DoctorActions
                  patientId={patientId}
                  nctId={trial.nctId}
                  order={order}
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
              </>
            ) : null
          }
          patient={patient}
          trial={trial}
          pair={pair}
          trials={trials}
          trialHref={(next) =>
            doctorChartPath({
              physicianId,
              patientId,
              trialId: next,
              demo: demo ? demoMode : null,
            })
          }
          suggestions={suggestions}
          suggestionHref={(peer) =>
            doctorChartPath({
              physicianId,
              patientId: peer.patientId,
              trialId: peer.nctId,
              demo: demo ? demoMode : null,
            })
          }
        />
        {!(patient && trial && pair) && (
          <MissingData file="app/_data/cube.json" detail={`No pair for ${patientId}.`} />
        )}
        <Provenance meta={meta} call="rank(evaluate(patient × trial)) · this physician only" />
      </main>
    </>
  );
}
