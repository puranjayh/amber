"use client";

import type { LoopState } from "@/app/_data/schema";
import {
  LOOP_FOCUS,
  pairTravel,
  prefsByPatient,
  prefsStated,
  rank,
  rankIndex,
  rankReason,
} from "@/components/loop/rank";
import { postNudge, useLoop } from "@/components/loop/useLoop";
import { Propagation } from "@/components/loop/Propagation";
import { Worklist, type WorklistItem } from "./Worklist";

function finiteTravel(minutes: number): number | null {
  return Number.isFinite(minutes) ? minutes : null;
}

function collapseCohort(rows: WorklistItem[]): WorklistItem[] {
  const seeds = rows.filter((row) => row.patientId.startsWith("SEED-"));
  if (seeds.length < 2) return rows;
  let placed = false;
  const out: WorklistItem[] = [];
  for (const row of rows) {
    if (!row.patientId.startsWith("SEED-")) {
      out.push(row);
      continue;
    }
    if (placed) continue;
    placed = true;
    out.push({
      ...seeds[0],
      patientId: `${seeds.length} peers`,
      reason: `${seeds.length} synthetic peers with the same chart already answered. They hold these ranks until the patient without preferences does.`,
      note: undefined,
      action: undefined,
      inert: true,
    });
  }
  return out;
}

export function WorklistLive({
  rows,
  initial,
  trial,
}: {
  rows: WorklistItem[];
  initial: LoopState;
  trial?: string;
}) {
  const { state, apply } = useLoop(initial, true, "coordinator");
  const prefs = prefsByPatient(state.preferences);
  const ranked = rank(rows, prefs, (row) => pairTravel(row.patient, row.trial));
  const focus = ranked.find((row) => row.patientId === LOOP_FOCUS) ?? ranked[0];
  const focusPlace = rankIndex(ranked, focus.patientId);
  const focusPrefs = prefs[focus.patientId];
  const focusTravel = finiteTravel(pairTravel(focus.patient, focus.trial));
  const asked = state.nudges.some(
    (n) => n.kind === "fill_preferences" && n.patientId === focus.patientId && n.status !== "done",
  );
  const notified = state.nudges.some(
    (n) => n.kind === "enrol_patient" && n.patientId === focus.patientId && n.status !== "done",
  );

  const items = ranked.map((row, i) => {
    const show = row.patientId === LOOP_FOCUS;
    if (!show) return row;
    const stated = prefsStated(prefs[row.patientId]);
    return {
      ...row,
      reason: rankReason({
        place: i,
        prefs: prefs[row.patientId],
        travelMinutes: finiteTravel(pairTravel(row.patient, row.trial)),
      }),
      action: stated
        ? {
            label: notified ? "Physician notified" : "Notify treating physician",
            disabled: notified,
            onClick: () => {
              void postNudge({
                kind: "enrol_patient",
                fromRole: "coordinator",
                toRole: "physician",
                patientId: row.patientId,
                nctId: row.nctId,
              }).then(apply);
            },
          }
        : {
            label: asked ? "Asked — waiting on patient" : "Ask patient for preferences",
            disabled: asked,
            onClick: () => {
              void postNudge({
                kind: "fill_preferences",
                fromRole: "coordinator",
                toRole: "patient",
                patientId: row.patientId,
                nctId: row.nctId,
              }).then(apply);
            },
          },
    };
  });

  const shown = collapseCohort(items);

  return (
    <div className="space-y-3">
      <Propagation nudges={state.nudges} />
      <aside
        className="rounded-md border border-ink bg-surface px-3 py-3 sm:px-4"
        aria-label="Live rank"
      >
        <p className="text-[11px] font-medium text-ink-3">Live loop</p>
        <p className="mt-1 font-mono text-[13px] font-medium text-ink">
          {focus.patientId} × {focus.nctId}
        </p>
        <p className="mt-1 text-[13px] text-ink">
          {rankReason({ place: focusPlace, prefs: focusPrefs, travelMinutes: focusTravel })}
        </p>
        <div className="mt-2">
          {prefsStated(focusPrefs) ? (
            <button
              type="button"
              disabled={notified}
              onClick={() => {
                void postNudge({
                  kind: "enrol_patient",
                  fromRole: "coordinator",
                  toRole: "physician",
                  patientId: focus.patientId,
                  nctId: focus.nctId,
                }).then(apply);
              }}
              className="rounded-md bg-ink px-3 py-1.5 text-[13px] font-medium text-surface hover:bg-ink-2 disabled:opacity-40"
            >
              {notified ? "Physician notified" : "Notify treating physician"}
            </button>
          ) : (
            <button
              type="button"
              disabled={asked}
              onClick={() => {
                void postNudge({
                  kind: "fill_preferences",
                  fromRole: "coordinator",
                  toRole: "patient",
                  patientId: focus.patientId,
                  nctId: focus.nctId,
                }).then(apply);
              }}
              className="rounded-md bg-ink px-3 py-1.5 text-[13px] font-medium text-surface hover:bg-ink-2 disabled:opacity-40"
            >
              {asked ? "Asked — waiting on patient" : "Ask patient for preferences"}
            </button>
          )}
        </div>
      </aside>
      <Worklist rows={shown} selectedId={LOOP_FOCUS} trial={trial} />
    </div>
  );
}
