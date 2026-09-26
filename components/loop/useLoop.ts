"use client";

import { useEffect, useState } from "react";
import type { LoopState, NudgeKind, LoopRole, NudgeStatus, PortalAnswers } from "@/app/_data/schema";
import { parseLoopState } from "./state";

const POLL_MS = 2000;

export function useLoop(initial: LoopState, enabled: boolean) {
  const [state, setState] = useState(initial);

  useEffect(() => {
    if (!enabled) return;
    let on = true;
    const tick = async () => {
      const res = await fetch("/api/loop", { cache: "no-store" });
      if (!on || !res.ok) return;
      setState(parseLoopState(await res.json()));
    };
    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    return () => {
      on = false;
      clearInterval(id);
    };
  }, [enabled]);

  const apply = (next: LoopState) => setState(next);

  return { state, apply };
}

export async function postPreferences(patientId: string, answers: PortalAnswers): Promise<LoopState> {
  const res = await fetch("/api/loop/preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ patientId, answers }),
  });
  if (!res.ok) throw new Error(await res.text());
  return parseLoopState(await res.json());
}

export async function postNudge(input: {
  kind: NudgeKind;
  fromRole: LoopRole;
  toRole: LoopRole;
  patientId?: string;
  nctId?: string | null;
  patients?: { patientId: string; nctId?: string | null }[];
}): Promise<LoopState> {
  const res = await fetch("/api/loop/nudges", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await res.text());
  return parseLoopState(await res.json());
}

export async function postNote(physicianId: string, text: string): Promise<LoopState> {
  const res = await fetch("/api/loop/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ physicianId, text }),
  });
  if (!res.ok) throw new Error(await res.text());
  return parseLoopState(await res.json());
}

export async function patchNudge(
  id: string,
  status: NudgeStatus,
  batchId?: string,
): Promise<LoopState> {
  const res = await fetch("/api/loop/nudges", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(batchId ? { batchId, status } : { id, status }),
  });
  if (!res.ok) throw new Error(await res.text());
  return parseLoopState(await res.json());
}

export async function resetLoop(): Promise<LoopState> {
  const res = await fetch("/api/loop/reset", { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return parseLoopState(await res.json());
}
