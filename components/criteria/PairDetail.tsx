import type { PairResult, Patient, Trial } from "@/src/contracts";
import { CriteriaTable } from "./CriteriaTable";
import { PairSummary, PatientStrip } from "./PairSummary";
import { buildSections, collectLeaves, listLeaves } from "./rows";

/** The one criteria table both portals render. Actions stay outside this component. */
export function PairDetail({
  patient,
  trial,
  pair,
  heading,
  showRace = true,
}: {
  patient: Patient;
  trial: Trial;
  pair: PairResult;
  heading?: string;
  showRace?: boolean;
}) {
  const leaves = collectLeaves(trial.criteria);
  const listed = listLeaves(trial.criteria);
  const sections = buildSections(trial.criteria, pair.cells);
  const unknownIds = pair.cells
    .filter((cell) => cell.verdict === "UNKNOWN")
    .map((cell) => cell.criterionId);
  return (
    <section className="space-y-3" aria-label="Criteria">
      <PatientStrip patient={patient} heading={heading} showRace={showRace} />
      <PairSummary trial={trial} pair={pair} leaves={leaves} />
      <CriteriaTable
        key={`${patient.id}:${trial.nctId}`}
        sections={sections}
        initialOpen={unknownIds}
        patient={patient}
        leaves={listed}
      />
    </section>
  );
}
