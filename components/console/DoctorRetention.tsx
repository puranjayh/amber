"use client";

import type { LoopState } from "@/app/_data/schema";
import { downloadNotes } from "@/components/console/notesPdf";
import { panelName } from "@/components/hcp/clinic";

const UPDATE =
  "I have updates for the clinical trial you were a part of. Book a follow-up and we can go through them together.";

/** A note the doctor can download. Nothing here is emailed or texted. */
export function DoctorRetention({
  initial,
  patientIds,
}: {
  initial: LoopState;
  physicianId: string;
  patientIds: string[];
}) {
  const mine = new Set(patientIds);
  const ids = [
    ...new Set(
      initial.nudges
        .filter(
          (nudge) => nudge.kind === "trial_update" && mine.has(nudge.patientId) && nudge.status !== "done",
        )
        .map((nudge) => nudge.patientId),
    ),
  ];
  if (ids.length === 0) return <p className="text-[15px] text-ink-2">No follow-ups on file.</p>;
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() =>
          void downloadNotes(
            ids.map((id) => ({ name: panelName(id), code: id, body: UPDATE, kicker: "Follow-up" })),
            "follow-ups.pdf",
          )
        }
        className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-on-brand"
      >
        Download{ids.length > 1 ? ` (${ids.length})` : ""}
      </button>
      <ul className="space-y-4">
        {ids.map((id) => (
          <li key={id} className="rounded-md border border-brand-line bg-surface px-4 py-4">
            <p className="text-[22px] font-semibold text-ink">
              {panelName(id)}
              <span className="ml-2 align-middle font-mono text-[12px] font-normal text-ink-3">{id}</span>
            </p>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink">{UPDATE}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
