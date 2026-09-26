"use client";

import type { LoopState } from "@/app/_data/schema";
import { Retention } from "@/components/loop/Retention";
import { useLoop } from "@/components/loop/useLoop";

export function DoctorRetention({
  initial,
  physicianId,
  patientIds,
}: {
  initial: LoopState;
  physicianId: string;
  patientIds: string[];
}) {
  const { state, apply } = useLoop(initial, true, "physician");
  return (
    <Retention state={state} physicianId={physicianId} patientIds={patientIds} onApply={apply} />
  );
}
