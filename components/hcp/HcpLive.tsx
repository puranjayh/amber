"use client";

import Link from "next/link";
import type { LoopState } from "@/app/_data/schema";
import { patchNudge, useLoop } from "@/components/loop/useLoop";
import { enrolCopy, groupEnrolNudges } from "@/components/worklist/group";
import { doctorQuery } from "./access";
import { HcpView, type HcpRosterRow } from "./HcpView";

export function HcpLive({
  rows,
  selectedId,
  headline,
  panelShare,
  admittedShare,
  initial,
  physicianId,
  physicianPatients,
  demoMode,
}: {
  rows: HcpRosterRow[];
  selectedId?: string;
  headline: string;
  panelShare: Record<string, number>;
  admittedShare: Record<string, number>;
  initial: LoopState;
  physicianId: string;
  physicianPatients: string[];
  demoMode?: "1" | "static";
}) {
  const { state, apply } = useLoop(initial, true);
  const mine = new Set(physicianPatients);
  const inbox = groupEnrolNudges(state.nudges, mine);

  return (
    <div className="space-y-3">
      {inbox.length > 0 && (
        <section className="rounded-md border border-ink bg-surface px-3 py-3 sm:px-4" aria-label="Notifications">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-ink-3">
            Impiricus · notifications
          </p>
          <ul className="mt-2 space-y-3">
            {inbox.map((group) => {
              const first = group.patientIds[0];
              return (
                <li key={group.key} className="space-y-1.5">
                  <p className="text-[13px] text-ink">{enrolCopy(group.patientIds.length, group.nctIds)}</p>
                  <p className="font-mono text-[11px] text-ink-3">{group.patientIds.join(" · ")}</p>
                  {first && (
                    <Link
                      href={doctorQuery({ physicianId, patientId: first, demo: demoMode ?? null })}
                      onClick={() => {
                        void patchNudge(group.ids[0] ?? first, "seen", group.batchId).then(apply);
                      }}
                      className="inline-block rounded-md bg-ink px-2.5 py-1 text-[12px] font-medium text-surface hover:bg-ink-2"
                    >
                      Open {group.patientIds.length === 1 ? "patient" : "first patient"}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <HcpView
        rows={rows}
        selectedId={selectedId}
        headline={headline}
        panelShare={panelShare}
        admittedShare={admittedShare}
        physicianId={physicianId}
        demoMode={demoMode}
      />
    </div>
  );
}
