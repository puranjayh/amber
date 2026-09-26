"use client";

import type { LoopState } from "@/app/_data/schema";
import { postNudge, useLoop } from "@/components/loop/useLoop";

/**
 * Coordinator actions on one patient. Missing preferences get Ask, not a
 * physician nudge. Suggest-this-trial is a physician action and is not here.
 */
export function CoordinatorActions({
  patientId,
  nctId,
  physicianName,
  stated,
  initial,
  live,
}: {
  patientId: string;
  nctId: string;
  physicianName: string;
  stated: boolean;
  initial: LoopState;
  live: boolean;
}) {
  const { state, apply } = useLoop(initial, live, "coordinator");
  const asked = state.nudges.some(
    (nudge) =>
      nudge.kind === "fill_preferences" && nudge.patientId === patientId && nudge.status !== "done",
  );
  const nudged = state.nudges.some(
    (nudge) =>
      nudge.kind === "enrol_patient" && nudge.patientId === patientId && nudge.status !== "done",
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {stated ? (
        <button
          type="button"
          disabled={!live || nudged}
          onClick={() => {
            void postNudge({
              kind: "enrol_patient",
              fromRole: "coordinator",
              toRole: "physician",
              patientId,
              nctId,
            }).then(apply);
          }}
          className="rounded-md bg-ink px-3 py-1.5 text-[13px] font-medium text-surface hover:bg-ink-2 disabled:opacity-40"
        >
          {nudged ? "Physician nudged" : `Nudge ${physicianName}`}
        </button>
      ) : (
        <button
          type="button"
          disabled={!live || asked}
          onClick={() => {
            void postNudge({
              kind: "fill_preferences",
              fromRole: "coordinator",
              toRole: "patient",
              patientId,
              nctId,
            }).then(apply);
          }}
          className="rounded-md bg-ink px-3 py-1.5 text-[13px] font-medium text-surface hover:bg-ink-2 disabled:opacity-40"
        >
          {asked ? "Asked — waiting on patient" : "Ask patient for preferences"}
        </button>
      )}
      <span className="text-[11px] text-ink-3">
        {stated
          ? "One nudge for this patient. A coordinator does not suggest a trial."
          : "Preferences are missing. Nudging the physician about an unreachable patient wastes the one ping they will read."}
        {!live && " Static demo — nothing is sent."}
      </span>
    </div>
  );
}
