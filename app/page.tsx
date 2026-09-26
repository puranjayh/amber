import { notFound } from "next/navigation";
import { asOf, getPair, getPatients, getTrial } from "@/app/_data/source";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { CriteriaTable } from "@/components/criteria/CriteriaTable";
import { PairSummary, PatientStrip } from "@/components/criteria/PairSummary";
import { buildSections, collectLeaves } from "@/components/criteria/rows";

const HERO_PATIENT = "PT-4417";
const HERO_TRIAL = "NCT09900001";

export default function Home() {
  const patient = getPatients().find((p) => p.id === HERO_PATIENT);
  const trial = getTrial(HERO_TRIAL);
  const pair = getPair(HERO_PATIENT, HERO_TRIAL);
  if (!patient || !trial || !pair) notFound();

  const sections = buildSections(trial.criteria, pair.cells);
  const leaves = collectLeaves(trial.criteria);

  return (
    <>
      <ConsoleHeader asOf={asOf} active="patient" />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-3 px-3 py-4 sm:px-6 sm:py-6">
        <PatientStrip patient={patient} />
        <PairSummary trial={trial} pair={pair} leaves={leaves} />
        <CriteriaTable sections={sections} />
      </main>
    </>
  );
}
