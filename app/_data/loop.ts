import type { LoopNudge, LoopState, NudgeKind, NudgeStatus, PhysicianNote, PortalAnswers, WorklistRow } from "./schema";
import {
  clearLoop,
  insertNudge,
  loadLoop,
  markNudges,
  newNudge,
  preferenceFromAnswers,
  replacePreferences,
  updateNudgeStatus,
  upsertNote,
  upsertPreference,
} from "./loop-store";
import { seedPreferenceRows } from "@/components/loop/rank";

export { loopBackend } from "./loop-store";

export async function readLoop(worklist: readonly WorklistRow[]): Promise<LoopState> {
  const state = await loadLoop();
  if (state.preferences.length > 0 || state.nudges.length > 0) return state;
  const seed = seedPreferenceRows(worklist, new Date().toISOString());
  if (seed.length === 0) return state;
  await replacePreferences(seed);
  return loadLoop();
}

export async function resetLoop(worklist: readonly WorklistRow[]): Promise<LoopState> {
  await clearLoop();
  const seed = seedPreferenceRows(worklist, new Date().toISOString());
  if (seed.length) await replacePreferences(seed);
  return loadLoop();
}

export async function savePreferences(
  worklist: readonly WorklistRow[],
  patientId: string,
  answers: PortalAnswers,
): Promise<LoopState> {
  await readLoop(worklist);
  await upsertPreference(preferenceFromAnswers(patientId, answers, new Date().toISOString()));
  await markNudges(patientId, "fill_preferences", "done");
  return loadLoop();
}

export async function createNudge(
  worklist: readonly WorklistRow[],
  input: Parameters<typeof newNudge>[0],
): Promise<LoopState> {
  return createNudges(worklist, [input]);
}

export async function createNudges(
  worklist: readonly WorklistRow[],
  inputs: Parameters<typeof newNudge>[0][],
): Promise<LoopState> {
  const state = await readLoop(worklist);
  const batchId = inputs.length > 1 ? crypto.randomUUID() : inputs[0]?.batchId;
  for (const input of inputs) {
    const nctId = input.nctId ?? null;
    const dup = state.nudges.find(
      (n) => n.kind === input.kind && n.patientId === input.patientId && n.nctId === nctId && n.status !== "done",
    );
    if (dup) continue;
    await insertNudge(newNudge({ ...input, batchId: input.batchId ?? batchId }));
  }
  return loadLoop();
}

export async function saveNote(
  worklist: readonly WorklistRow[],
  physicianId: string,
  text: string,
): Promise<LoopState> {
  await readLoop(worklist);
  const note: PhysicianNote = { physicianId, text, updatedAt: new Date().toISOString() };
  await upsertNote(note);
  return loadLoop();
}

export async function setBatchStatus(
  worklist: readonly WorklistRow[],
  batchId: string,
  status: NudgeStatus,
): Promise<LoopState> {
  const state = await readLoop(worklist);
  for (const n of state.nudges.filter((row) => row.batchId === batchId && row.status !== "done")) {
    await updateNudgeStatus(n.id, status);
  }
  return loadLoop();
}

export async function setNudgeStatus(
  worklist: readonly WorklistRow[],
  id: string,
  status: NudgeStatus,
): Promise<LoopState> {
  await readLoop(worklist);
  await updateNudgeStatus(id, status);
  return loadLoop();
}

export function pendingNudge(state: LoopState, kind: NudgeKind, patientId: string): LoopNudge | undefined {
  return state.nudges.find((n) => n.kind === kind && n.patientId === patientId && n.status === "pending");
}
