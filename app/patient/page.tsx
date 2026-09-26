import { notFound } from "next/navigation";
import { DEMO, asOf, getCube, getPair, getPatient, getPatients, getTrial, getTrials, meta } from "@/app/_data/source";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { DemoSteps } from "@/components/console/DemoSteps";
import { PairPicker } from "@/components/console/PairPicker";
import { Provenance } from "@/components/console/Provenance";
import { isDemo, one } from "@/components/console/params";
import { CriteriaTable } from "@/components/criteria/CriteriaTable";
import { PairSummary, PatientStrip } from "@/components/criteria/PairSummary";
import { buildSections, collectLeaves } from "@/components/criteria/rows";

export default async function PatientPage({ searchParams }: PageProps<"/patient">) {
  const sp = await searchParams;
  const demo = isDemo(sp);
  const patientId = (!demo && one(sp.patient)) || DEMO.patientId;
  const nctId = (!demo && one(sp.trial)) || DEMO.nctId;

  const patient = getPatient(patientId);
  const trial = getTrial(nctId);
  const pair = getPair(patientId, nctId);
  if (!patient || !trial || !pair) notFound();

  const sections = buildSections(trial.criteria, pair.cells);
  const leaves = collectLeaves(trial.criteria);
  const unknownIds = pair.cells.filter((c) => c.verdict === "UNKNOWN").map((c) => c.criterionId);

  return (
    <>
      <ConsoleHeader asOf={asOf} active="patient" demo={demo} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-3 px-3 py-4 sm:px-6 sm:py-6">
        {demo ? (
          <DemoSteps current="patient" />
        ) : (
          <PairPicker
            patientIds={getPatients().map((p) => p.id)}
            nctIds={getTrials().map((t) => t.nctId)}
            cube={getCube()}
            current={{ patientId, nctId }}
          />
        )}
        <PatientStrip patient={patient} />
        <PairSummary trial={trial} pair={pair} leaves={leaves} />
        <CriteriaTable
          key={`${patientId}:${nctId}:${demo}`}
          sections={sections}
          initialOpen={demo ? unknownIds : []}
        />
        <Provenance meta={meta} call={`evaluate(${patientId}, ${nctId})`} />
      </main>
    </>
  );
}
