import { notFound } from "next/navigation";
import { HERO, asOf, getCube, getPair, getPatient, getPatients, getTrial, getTrials } from "@/app/_data/source";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { PairPicker } from "@/components/console/PairPicker";
import { CriteriaTable } from "@/components/criteria/CriteriaTable";
import { PairSummary, PatientStrip } from "@/components/criteria/PairSummary";
import { buildSections, collectLeaves } from "@/components/criteria/rows";

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const patientId = one(sp.patient) ?? HERO.patientId;
  const nctId = one(sp.trial) ?? HERO.nctId;

  const patient = getPatient(patientId);
  const trial = getTrial(nctId);
  const pair = getPair(patientId, nctId);
  if (!patient || !trial || !pair) notFound();

  const sections = buildSections(trial.criteria, pair.cells);
  const leaves = collectLeaves(trial.criteria);

  return (
    <>
      <ConsoleHeader asOf={asOf} active="patient" />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-3 px-3 py-4 sm:px-6 sm:py-6">
        <PairPicker
          patientIds={getPatients().map((p) => p.id)}
          nctIds={getTrials().map((t) => t.nctId)}
          cube={getCube()}
          current={{ patientId, nctId }}
        />
        <PatientStrip patient={patient} />
        <PairSummary trial={trial} pair={pair} leaves={leaves} />
        <CriteriaTable key={`${patientId}:${nctId}`} sections={sections} />
      </main>
    </>
  );
}
