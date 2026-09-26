"use client";

import Link from "next/link";
import { useState } from "react";
import {
  TIER_LABEL,
  type CriterionLeaf,
  type CubeCell,
  type PairResult,
  type Patient,
  type Trial,
} from "@/src/contracts";
import { CitationPanel } from "@/components/criteria/CitationPanel";
import type { Order } from "./alert";

const DECLINE_REASONS = [
  "Not a trial candidate",
  "Patient declined",
  "Already ordered elsewhere",
] as const;

type Decision =
  | { kind: "open" }
  | { kind: "accepted" }
  | { kind: "declining" }
  | { kind: "declined"; reason: string };

export function AlertCard({
  patient,
  trial,
  pair,
  cell,
  leaf,
  order,
  favourable,
  totalCriteria,
}: {
  patient: Patient;
  trial: Trial;
  pair: PairResult;
  cell: CubeCell;
  leaf: CriterionLeaf;
  order: Order;
  favourable: number;
  totalCriteria: number;
}) {
  const [decision, setDecision] = useState<Decision>({ kind: "open" });
  const others = pair.unknownCount - 1;

  return (
    <article
      className="mx-auto w-full max-w-xl overflow-hidden rounded-lg border border-line bg-surface shadow-sm"
      aria-labelledby="alert-title"
    >
      <header className="border-b border-line px-4 py-3">
        <div className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-3">
          Trial match · one decision
        </div>
        <h1 id="alert-title" className="mt-1 text-[15px] font-semibold leading-snug text-ink">
          {patient.id} could qualify for {trial.nctId}
        </h1>
        <p className="mt-0.5 text-[12px] text-ink-2">
          {patient.age} {patient.sex} · {patient.race}
          {patient.travelMinutes !== undefined && ` · ${patient.travelMinutes} min travel`}
        </p>
      </header>

      <section className="border-b border-line-2 px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-2 font-mono text-[11px] text-ink-3">
          <span className="font-medium text-ink">{trial.nctId}</span>
          <span>{trial.phase}</span>
          {trial.siteDistanceMinutes !== undefined && <span>· site {trial.siteDistanceMinutes} min</span>}
        </div>
        <p className="mt-1 text-[13px] leading-snug text-ink">{trial.title}</p>
        <p className="mt-2 text-[12px] text-ink-2">
          Meets {favourable} of {totalCriteria} criteria.{" "}
          {others === 0 ? (
            <span className="font-medium text-ink">One open question stands between them.</span>
          ) : (
            <span>
              {pair.unknownCount} questions are open; this is the best one to answer first.
            </span>
          )}
        </p>
      </section>

      <section aria-label="Blocking unknown">
        <div className="flex flex-wrap items-center gap-2 bg-unknown-bg px-4 py-2">
          <span className="rounded border border-unknown-line bg-surface px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide text-unknown">
            ? UNKNOWN
          </span>
          <span className="font-mono text-[12px] font-medium text-ink">{leaf.id}</span>
          <span className="text-[12px] text-unknown">
            {cell.reason === "stale" ? "on file, but out of date" : "not in the record"}
          </span>
        </div>
        <CitationPanel leaf={leaf} cell={cell} />
      </section>

      <section className="border-t border-line px-4 py-3" aria-label="Order to place">
        <div className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-ink-3">
          Order to place
        </div>
        <p className="mt-1 text-[14px] font-medium text-ink">{order.title}</p>
        <p className="mt-0.5 text-[12px] text-ink-2">{order.detail}</p>
        <p className="mt-1 font-mono text-[11px] text-ink-3">
          tier {cell.tier} · {TIER_LABEL[cell.tier]}
          {cell.pFavorable !== undefined && ` · ${Math.round(cell.pFavorable * 100)}% likely favourable`}
        </p>
      </section>

      <footer className="border-t border-line bg-canvas px-4 py-3">
        {decision.kind === "open" && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setDecision({ kind: "accepted" })}
              className="flex-1 rounded-md bg-ink px-4 py-2.5 text-[13px] font-medium text-surface hover:bg-ink-2"
            >
              Accept — draft the order
            </button>
            <button
              type="button"
              onClick={() => setDecision({ kind: "declining" })}
              className="flex-1 rounded-md border border-line bg-surface px-4 py-2.5 text-[13px] font-medium text-ink hover:border-ink-3"
            >
              Decline
            </button>
          </div>
        )}

        {decision.kind === "declining" && (
          <div>
            <div className="mb-2 text-[12px] text-ink-2">Why? (optional)</div>
            <div className="flex flex-wrap gap-2">
              {DECLINE_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setDecision({ kind: "declined", reason })}
                  className="rounded-md border border-line bg-surface px-3 py-1.5 text-[12px] text-ink hover:border-ink-3"
                >
                  {reason}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setDecision({ kind: "declined", reason: "No reason given" })}
                className="rounded-md px-3 py-1.5 text-[12px] text-ink-3 hover:text-ink"
              >
                Skip
              </button>
            </div>
          </div>
        )}

        {(decision.kind === "accepted" || decision.kind === "declined") && (
          <div className="flex flex-wrap items-center justify-between gap-2" role="status">
            <p className="text-[13px] text-ink">
              {decision.kind === "accepted" ? (
                <>
                  <span className="font-medium">Drafted for your signature:</span> {order.title}.
                </>
              ) : (
                <>
                  <span className="font-medium">Declined</span> — {decision.reason}.
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => setDecision({ kind: "open" })}
              className="rounded px-2 py-1 font-mono text-[11px] text-ink-2 hover:bg-surface hover:text-ink"
            >
              Undo
            </button>
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-3">
          <span>Nothing is transmitted from this screen.</span>
          <Link
            href={`/patient?patient=${patient.id}&trial=${trial.nctId}`}
            className="font-mono text-ink-2 underline-offset-2 hover:text-ink hover:underline"
          >
            All criteria →
          </Link>
        </div>
      </footer>
    </article>
  );
}
