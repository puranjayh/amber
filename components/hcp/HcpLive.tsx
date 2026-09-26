"use client";

import Link from "next/link";
import type { LoopState } from "@/app/_data/schema";
import { patchNudge, useLoop } from "@/components/loop/useLoop";
import { enrolCopy, groupEnrolNudges } from "@/components/worklist/group";
import { Retention } from "@/components/loop/Retention";
import { doctorChartPath } from "./access";
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
  const { state, apply } = useLoop(initial, true, "physician");
  const mine = new Set(physicianPatients);
  const inbox = groupEnrolNudges(state.nudges, mine);

  return (
    <div className="space-y-8">
      <HcpView
        rows={rows}
        selectedId={selectedId}
        headline={headline}
        panelShare={panelShare}
        admittedShare={admittedShare}
        physicianId={physicianId}
        demoMode={demoMode}
      />
      <details className="rounded-md border border-line bg-surface px-3 py-2.5 sm:px-4">
        <summary className="cursor-pointer text-[13px] font-medium text-ink">
          Follow-ups{inbox.length > 0 ? ` · ${inbox.length}` : ""}
        </summary>
        <div className="mt-3 space-y-3">
          <Retention
            state={state}
            physicianId={physicianId}
            patientIds={physicianPatients}
            onApply={apply}
          />
          {inbox.length > 0 && (
            <section aria-label="Notifications">
              <p className="text-[11px] font-medium text-ink-3">Impiricus · notifications</p>
              <ul className="mt-2 space-y-3">
                {inbox.map((group) => {
                  const first = group.patientIds[0];
                  return (
                    <li key={group.key} className="space-y-1.5">
                      <p className="text-[13px] text-ink">
                        {enrolCopy(group.patientIds.length, group.nctIds)}
                      </p>
                      <p className="font-mono text-[11px] text-ink-3">
                        {group.patientIds.join(" · ")}
                      </p>
                      {first && (
                        <Link
                          href={doctorChartPath({
                            physicianId,
                            patientId: first,
                            demo: demoMode ?? null,
                          })}
                          onClick={() => {
                            void patchNudge(group.ids[0] ?? first, "seen", group.batchId).then(
                              apply,
                            );
                          }}
                          className="inline-block rounded-md bg-ink px-2.5 py-1 text-[13px] font-medium text-surface hover:bg-ink-2"
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
        </div>
      </details>
    </div>
  );
}
