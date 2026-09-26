import Link from "next/link";
import { readLoop } from "@/app/_data/loop";
import {
  asOf,
  getPair,
  getPairsForPatient,
  getPatient,
  getDemoWorklist,
  getTrial,
  getWorklist,
  meta,
} from "@/app/_data/source";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { MissingData } from "@/components/console/MissingData";
import { Provenance } from "@/components/console/Provenance";
import { anchorById } from "@/components/console/anchors";
import { isStaticDemo, one } from "@/components/console/params";
import { PairDetail } from "@/components/criteria/PairDetail";
import { UnknownResolutions } from "@/components/criteria/UnknownResolutions";
import { prefsByPatient, prefsStated } from "@/components/loop/rank";
import { attributePatient } from "@/components/worklist/attribution";
import { CoordinatorActions } from "@/components/worklist/CoordinatorActions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `AMBER — ${decodeURIComponent(id)}` };
}

export default async function CoordinatorPatientPage({
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
  const worklist = getWorklist();
  const listed = worklist.find((row) => row.patientId === patientId);
  const requestedTrial = one(sp.trial);
  const nctId =
    (requestedTrial && getPair(patientId, requestedTrial) ? requestedTrial : undefined) ??
    listed?.nctId ??
    getPairsForPatient(patientId)[0]?.nctId;
  const trial = nctId ? getTrial(nctId) : undefined;
  const pair = nctId ? getPair(patientId, nctId) : undefined;
  const physician = attributePatient(patientId);
  const loop = demo ? null : await readLoop(getDemoWorklist());
  const stated = prefsStated(loop ? prefsByPatient(loop.preferences)[patientId] : undefined);
  const backTrial = anchorById(nctId).nctId;
  const back = `/?trial=${backTrial}${demo ? `&demo=${demoMode}` : ""}`;

  return (
    <>
      <ConsoleHeader asOf={asOf} active="worklist" demo={demo} demoMode={demoMode} trial={backTrial} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-3 px-3 py-4 sm:px-6 sm:py-6">
        <Link href={back} className="font-mono text-[11px] text-ink-2 hover:text-ink">
          ← Worklist
        </Link>
        <div>
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-3">
            Trial portal · coordinator
          </p>
          <h1 className="mt-0.5 font-mono text-[16px] font-medium text-ink">{patientId}</h1>
          <p className="mt-1 text-[12px] text-ink-2">
            You see across physicians. This patient belongs to{" "}
            {`${physician.name}${physician.specialty ? `, ${physician.specialty}` : ""} · ${physician.site}`}
            <span className="text-ink-3"> · {physician.source}</span>. You can nudge that physician or ask the
            patient for preferences. You do not suggest a trial.
          </p>
        </div>
        {patient && trial && pair ? (
          <>
            <CoordinatorActions
              patientId={patientId}
              nctId={trial.nctId}
              physicianName={physician.talk}
              stated={stated}
              initial={loop ?? { backend: "file", preferences: [], nudges: [], notes: [] }}
              live={Boolean(loop)}
            />
            <UnknownResolutions patient={patient} trial={trial} pair={pair} />
            <PairDetail patient={patient} trial={trial} pair={pair} />
          </>
        ) : (
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
