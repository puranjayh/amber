"use client";

import { useEffect, useState } from "react";
import type { LoopState, NudgeKind, LoopRole, NudgeStatus, PortalAnswers } from "@/app/_data/schema";
import { parseLoopState } from "./state";
import type { Audience } from "./registry";

const POLL_MS = 2000;
const REGISTRY_MS = 60_000;

export function useLoop(initial: LoopState, enabled: boolean, audience: Audience = "patient") {
  const [state, setState] = useState(initial);

  useEffect(() => {
    if (!enabled) return;
    let on = true;
    const tick = async () => {
      const res = await fetch(`/api/loop?audience=${audience}`, { cache: "no-store" });
      if (!on || !res.ok) return;
      setState(parseLoopState(await res.json()));
    };
    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    return () => {
      on = false;
      clearInterval(id);
    };
  }, [enabled, audience]);

  useEffect(() => {
    if (!enabled) return;
    let on = true;
    const sync = async () => {
      const res = await fetch(`/api/loop/registry?audience=${audience}`, { method: "POST" });
      if (!on || !res.ok) return;
      setState(parseLoopState(await res.json()));
    };
    void sync();
    const id = setInterval(() => void sync(), REGISTRY_MS);
    return () => {
      on = false;
      clearInterval(id);
    };
  }, [enabled, audience]);

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
  const res = await fetch("/api/loop/nudges?audience=physician", {
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
  audience: Audience = "physician",
): Promise<LoopState> {
  const res = await fetch(`/api/loop/nudges?audience=${audience}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(batchId ? { batchId, status } : { id, status }),
  });
  if (!res.ok) throw new Error(await res.text());
  return parseLoopState(await res.json());
}

export async function releaseUpdate(id: string): Promise<LoopState> {
  const res = await fetch("/api/loop/nudges?audience=physician", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, release: true }),
  });
  if (!res.ok) throw new Error(await res.text());
  return parseLoopState(await res.json());
}

export async function postReleaseMode(physicianId: string, mode: "review" | "auto"): Promise<LoopState> {
  const res = await fetch("/api/loop/release?audience=physician", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ physicianId, mode }),
  });
  if (!res.ok) throw new Error(await res.text());
  return parseLoopState(await res.json());
}

export async function resetLoop(): Promise<LoopState> {
  const res = await fetch("/api/loop/reset", { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return parseLoopState(await res.json());
}
