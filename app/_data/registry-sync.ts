import { assignPhysician } from "@/components/hcp/roster";
import { diffRegistry } from "@/components/loop/registry";
import { fetchStudy } from "./ctgov";
import { loadLoop, saveRegistry } from "./loop-store";
import { LoopNudge, type LoopNudge as LoopNudgeT, type RegistryStudy } from "./schema";

const STALE_MS = 60_000;

let inflight: Promise<void> | null = null;

/**
 * Poll ClinicalTrials.gov for trials with an outstanding trial_suggestion.
 * A transport failure leaves the store as it was. The same changeKey is never inserted twice.
 */
export async function syncRegistry(now = new Date()): Promise<void> {
  if (inflight) return inflight;
  inflight = run(now).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function run(now: Date): Promise<void> {
  const state = await loadLoop();
  const open = state.nudges.filter(
    (nudge) => nudge.kind === "trial_suggestion" && nudge.status !== "done" && nudge.nctId,
  );
  const nctIds = [...new Set(open.map((nudge) => nudge.nctId!))];
  if (nctIds.length === 0) return;

  let registry = [...state.registry];
  const additions: LoopNudgeT[] = [];
  let dirty = false;

  for (const nctId of nctIds) {
    const prev = registry.find((row) => row.nctId === nctId);
    if (prev && now.getTime() - Date.parse(prev.fetchedAt) < STALE_MS) continue;
    let study: RegistryStudy | undefined;
    try {
      study = await fetchStudy(nctId);
    } catch (error) {
      console.warn("registry poll failed", nctId, error);
      continue;
    }
    if (!study) continue;
    dirty = true;
    const stored = { ...study };
    delete stored.enrollmentCount;
    const changes = diffRegistry(prev?.study, stored);
    registry = registry.filter((row) => row.nctId !== nctId).concat({
      nctId,
      fetchedAt: now.toISOString(),
      study: stored,
    });
    const batchId = crypto.randomUUID();
    for (const change of changes) {
      const targets = open.filter((nudge) => nudge.nctId === nctId);
      for (const suggestion of targets) {
        const already =
          state.nudges.some(
            (nudge) =>
              nudge.kind === "trial_update" &&
              nudge.patientId === suggestion.patientId &&
              nudge.changeKey === change.changeKey,
          ) ||
          additions.some(
            (nudge) => nudge.patientId === suggestion.patientId && nudge.changeKey === change.changeKey,
          );
        if (already) continue;
        const mode = state.releases.find((row) => row.physicianId === assignPhysician(suggestion.patientId))?.mode;
        additions.push(
          LoopNudge.parse({
            id: crypto.randomUUID(),
            kind: "trial_update",
            fromRole: "physician",
            toRole: "patient",
            patientId: suggestion.patientId,
            nctId,
            status: "pending",
            createdAt: now.toISOString(),
            batchId,
            detail: change.detail,
            held: mode !== "auto",
            changeKey: change.changeKey,
          }),
        );
      }
    }
  }

  if (dirty) await saveRegistry(registry, additions);
}
