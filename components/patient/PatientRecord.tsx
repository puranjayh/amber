import Link from "next/link";
import type { ReactNode } from "react";
import type { PairResult, Patient, Trial } from "@/src/contracts";
import { PairDetail } from "@/components/criteria/PairDetail";
import { UnknownResolutions } from "@/components/criteria/UnknownResolutions";
import { trialWords } from "@/components/hcp/clinic";
import { TRIAL_RANK_RULE, type Peer } from "./rank";

export function PatientRecord({
  backHref,
  backLabel,
  kicker,
  title,
  blurb,
  actions,
  patient,
  trial,
  pair,
  trials,
  trialHref,
  suggestions,
  suggestionHref,
  showRace = true,
}: {
  backHref: string;
  backLabel: string;
  kicker: string;
  title: string;
  blurb: string;
  actions?: ReactNode;
  patient?: Patient;
  trial?: Trial;
  pair?: PairResult;
  trials: { nctId: string; title: string; unknownCount: number; eliminated: boolean }[];
  trialHref: (nctId: string) => string;
  suggestions: Peer[];
  suggestionHref: (peer: Peer) => string;
  showRace?: boolean;
}) {
  return (
    <div className="space-y-8">
      <Link href={backHref} className="text-[13px] text-ink-2 hover:text-ink">
        ← {backLabel}
      </Link>
      <div>
        <p className="text-[13px] text-ink-3">{kicker}</p>
        <h1 className="mt-1 text-[24px] font-medium text-ink">{title}</h1>
        <p className="mt-2 text-[15px] leading-[1.55] text-ink-2">{blurb}</p>
      </div>
      {actions}
      {patient && trial && pair ? (
        <>
          <UnknownResolutions patient={patient} trial={trial} pair={pair} />
          <section className="space-y-2" aria-label="This patient's trials">
            <h2 className="text-[18px] font-medium text-ink">Trials</h2>
            <p className="text-[13px] text-ink-2">{TRIAL_RANK_RULE}</p>
            <ol className="overflow-hidden rounded-md border border-line bg-surface">
              {trials.map((row, index) => {
                const current = row.nctId === trial.nctId;
                return (
                  <li key={row.nctId} className="border-b border-line-2 last:border-b-0">
                    <Link
                      href={trialHref(row.nctId)}
                      aria-current={current ? "page" : undefined}
                      className={`block min-h-11 px-4 py-3 hover:bg-canvas ${current ? "bg-canvas" : ""}`}
                    >
                      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <span className="text-[15px] leading-[1.55] text-ink">
                          <span className="mr-2 font-mono text-[13px] text-ink-3">{index + 1}.</span>
                          {trialWords(row.nctId, row.title)}
                        </span>
                        <span className={`text-[13px] ${row.eliminated ? "text-fail" : "text-ink-3"}`}>
                          {row.eliminated ? "Eliminated" : `${row.unknownCount} unknown`}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
          <PairDetail
            patient={patient}
            trial={trial}
            pair={pair}
            heading={title}
            showRace={showRace}
          />
          <section className="space-y-2" aria-label="Suggested patients">
            <h2 className="text-[18px] font-medium text-ink">Suggested patients</h2>
            {suggestions.length === 0 ? (
              <p className="text-[13px] text-ink-2">
                No one else on this panel shares this blocker or this diagnosis.
              </p>
            ) : (
              <ul className="overflow-hidden rounded-md border border-line bg-surface">
                {suggestions.map((peer) => (
                  <li key={peer.patientId} className="border-b border-line-2 last:border-b-0">
                    <Link
                      href={suggestionHref(peer)}
                      className="block min-h-11 px-4 py-3 hover:bg-canvas"
                    >
                      <span className="text-[15px] text-ink">{peer.name}</span>
                      <span className="mt-0.5 block text-[13px] text-ink-2">
                        {peer.sameBlocker && peer.blockingId
                          ? `Same blocker ${peer.blockingId}`
                          : peer.diagnosis}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
