"use client";

import Link from "next/link";
import { useState } from "react";
import { TIER_LABEL } from "@/src/contracts";
import type { LoopState } from "@/app/_data/schema";
import { postNudge, useLoop } from "@/components/loop/useLoop";

const DISMISS = ["Not a trial candidate", "Patient declined", "Already ordered elsewhere"] as const;

export type DoctorOrder = {
  title: string;
  detail: string;
  criterionId: string;
  tier: number;
};

/**
 * Physician actions on their own patient. Suggest reaches the patient portal.
 * Order and dismiss stay on this screen — nothing is transmitted from them.
 */
export function DoctorActions({
  patientId,
  nctId,
  order,
  initial,
  live,
}: {
  patientId: string;
  nctId: string;
  order?: DoctorOrder;
  initial: LoopState;
  live: boolean;
}) {
  const { state, apply } = useLoop(initial, live, "physician");
  const [decision, setDecision] = useState<"open" | "ordered" | "dismissing" | "dismissed">("open");
  const [reason, setReason] = useState<string | null>(null);
  const canOrder = Boolean(order) && !/^no order/i.test(order?.title ?? "");
  const suggested =
    live &&
    state.nudges.some(
      (nudge) =>
        nudge.kind === "trial_suggestion" &&
        nudge.patientId === patientId &&
        nudge.nctId === nctId &&
        nudge.status !== "done",
    );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!live || suggested || decision === "dismissed"}
          onClick={() => {
            void postNudge({
              kind: "trial_suggestion",
              fromRole: "physician",
              toRole: "patient",
              patientId,
              nctId,
            }).then(apply);
          }}
          className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-on-brand disabled:opacity-40"
        >
          {suggested ? "Suggested to patient" : "Suggest this trial"}
        </button>
        <button
          type="button"
          disabled={!canOrder || decision === "ordered" || decision === "dismissed"}
          onClick={() => setDecision("ordered")}
          className="rounded-md border border-pass-line bg-pass-bg px-3 py-1.5 text-[13px] font-medium text-pass hover:border-pass disabled:opacity-40"
        >
          {decision === "ordered" ? "Order drafted" : "Order this test"}
        </button>
        <button
          type="button"
          disabled={decision === "dismissed" || decision === "ordered"}
          onClick={() => setDecision("dismissing")}
          className="rounded-md border border-fail-line bg-fail-bg px-3 py-1.5 text-[13px] font-medium text-fail hover:border-fail disabled:opacity-40"
        >
          Dismiss
        </button>
        {suggested && (
          <Link
            href={`/patient-portal?patient=${encodeURIComponent(patientId)}`}
            className="text-[13px] font-medium text-brand hover:text-ink"
          >
            Open patient portal
          </Link>
        )}
      </div>
      {order && (
        <p className="text-[13px] text-ink-2">
          {order.criterionId} · T{order.tier} {TIER_LABEL[order.tier]} · {order.title}
        </p>
      )}
      {decision === "ordered" && order && (
        <p className="text-[13px] text-ink" role="status">
          <span className="font-medium">Drafted for your signature:</span> {order.title}.{" "}
          {order.detail} Nothing is transmitted from this screen.
        </p>
      )}
      {decision === "dismissing" && (
        <div className="flex flex-wrap gap-2">
          {DISMISS.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setReason(label);
                setDecision("dismissed");
              }}
              className="rounded-md border border-line bg-surface px-2.5 py-1 text-[13px] text-ink hover:border-ink-3"
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {decision === "dismissed" && (
        <p className="text-[13px] text-ink" role="status">
          <span className="font-medium">Dismissed</span>
          {reason ? ` — ${reason}.` : "."} This trial stays off your list for this visit.
          <button
            type="button"
            onClick={() => {
              setReason(null);
              setDecision("open");
            }}
            className="ml-2 font-mono text-[11px] text-ink-2 hover:text-ink"
          >
            Undo
          </button>
        </p>
      )}
      {!live && <p className="text-[11px] text-ink-3">Static demo — a suggestion is not sent.</p>}
    </div>
  );
}
