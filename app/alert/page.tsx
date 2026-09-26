import { DEMO, asOf, getCube, getPair, getPatient, getTrial, meta } from "@/app/_data/source";
import { MissingData } from "@/components/console/MissingData";
import { blockingUnknown, orderFor, pickAlertPair } from "@/components/alert/alert";
import { AlertCard } from "@/components/alert/AlertCard";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { DemoSteps } from "@/components/console/DemoSteps";
import { Provenance } from "@/components/console/Provenance";
import { isDemo, one } from "@/components/console/params";
import { collectLeaves } from "@/components/criteria/rows";
import { toneCounts } from "@/components/criteria/tone";

export default async function AlertPage({ searchParams }: PageProps<"/alert">) {
  const sp = await searchParams;
  const demo = isDemo(sp);
  const requested = demo ? DEMO : one(sp.patient) && one(sp.trial) ? { patientId: one(sp.patient)!, nctId: one(sp.trial)! } : null;
  const pair = requested ? getPair(requested.patientId, requested.nctId) : pickAlertPair(getCube());

  if (getCube().length === 0) {
    return (
      <>
        <ConsoleHeader asOf={asOf} active="alert" demo={demo} />
        <main className="mx-auto w-full max-w-xl flex-1 px-3 py-6 sm:px-6">
          <MissingData file="app/_data/cube.json" />
        </main>
      </>
    );
  }

  const patient = pair && getPatient(pair.patientId);
  const trial = pair && getTrial(pair.nctId);
  const cell = pair && !pair.eliminated ? blockingUnknown(pair) : undefined;
  const leaves = trial ? collectLeaves(trial.criteria) : undefined;
  const leaf = cell && leaves?.get(cell.criterionId);

  return (
    <>
      <ConsoleHeader asOf={asOf} active="alert" demo={demo} />
      <main className="w-full flex-1 space-y-3 px-3 py-4 sm:px-6 sm:py-8">
        {demo && (
          <div className="mx-auto max-w-xl">
            <DemoSteps current="alert" />
          </div>
        )}
        {pair && patient && trial && cell && leaf && leaves ? (
          <AlertCard
            patient={patient}
            trial={trial}
            pair={pair}
            cell={cell}
            leaf={leaf}
            order={orderFor(leaf, cell, patient)}
            favourable={toneCounts(pair.cells, (id) => leaves.get(id)?.type).green}
            totalCriteria={leaves.size}
            demo={demo}
          />
        ) : (
          <div className="mx-auto max-w-xl rounded-lg border border-line bg-surface px-4 py-6 text-center text-[13px] text-ink-2">
            {pair?.eliminated
              ? `${pair.patientId} is eliminated from ${pair.nctId}. There is nothing to order.`
              : pair
                ? `${pair.patientId} has no open questions for ${pair.nctId}.`
                : "No open alerts. Every candidate pair is either resolved or eliminated."}
          </div>
        )}
        {pair && (
          <div className="mx-auto max-w-xl">
            <Provenance meta={meta} call={`evaluate(${pair.patientId}, ${pair.nctId})`} />
          </div>
        )}
      </main>
    </>
  );
}
