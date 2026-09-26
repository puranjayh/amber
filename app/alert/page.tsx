import { notFound } from "next/navigation";
import { asOf, getCube, getPair, getPatient, getTrial } from "@/app/_data/source";
import { blockingUnknown, orderFor, pickAlertPair } from "@/components/alert/alert";
import { AlertCard } from "@/components/alert/AlertCard";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { collectLeaves } from "@/components/criteria/rows";
import { toneCounts } from "@/components/criteria/tone";

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AlertPage({ searchParams }: PageProps<"/alert">) {
  const sp = await searchParams;
  const requested = one(sp.patient) && one(sp.trial);
  const pair = requested ? getPair(one(sp.patient)!, one(sp.trial)!) : pickAlertPair(getCube());

  if (requested && !pair) notFound();

  const patient = pair && getPatient(pair.patientId);
  const trial = pair && getTrial(pair.nctId);
  const cell = pair && !pair.eliminated ? blockingUnknown(pair) : undefined;
  const leaves = trial ? collectLeaves(trial.criteria) : undefined;
  const leaf = cell && leaves?.get(cell.criterionId);

  return (
    <>
      <ConsoleHeader asOf={asOf} active="alert" />
      <main className="w-full flex-1 px-3 py-4 sm:px-6 sm:py-8">
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
      </main>
    </>
  );
}
