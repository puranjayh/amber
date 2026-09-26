"use client";

import { useState } from "react";
import type { LoopState, PortalAnswers } from "@/app/_data/schema";
import { prefsByPatient, prefsStated } from "@/components/loop/rank";
import { postPreferences, useLoop } from "@/components/loop/useLoop";
import { PortalForm } from "./PortalForm";
import type { PortalCatalog } from "./portal-copy";
import { suggestionCopy } from "./portal-copy";
import { patientUpdateCopy } from "@/components/loop/registry";

export function PortalLive({
  patientId,
  initialAnswers,
  catalog,
  initial,
}: {
  patientId: string;
  initialAnswers: PortalAnswers;
  catalog: PortalCatalog;
  initial: LoopState;
}) {
  const { state, apply } = useLoop(initial, true, "patient");
  const [saved, setSaved] = useState(false);
  const prefs = prefsByPatient(state.preferences)[patientId];
  const fill = state.nudges.find(
    (n) => n.kind === "fill_preferences" && n.patientId === patientId && n.status === "pending",
  );
  const suggestion = state.nudges.find(
    (n) => n.kind === "trial_suggestion" && n.patientId === patientId && n.status !== "done",
  );
  const update = state.nudges.find(
    (n) =>
      n.kind === "trial_update" &&
      n.patientId === patientId &&
      n.held !== true &&
      n.status !== "done",
  );
  const copy = suggestion ? suggestionCopy(catalog, suggestion.nctId) : undefined;

  return (
    <div className="space-y-4">
      {fill && (
        <aside
          className="rounded-md border border-unknown-line bg-unknown-bg px-3 py-3 text-unknown"
          role="status"
        >
          <p className="text-[15px] font-medium">Your care team needs a few details</p>
          <p className="mt-1 text-[13px]">
            Your care team needs a few details to check if trials are reachable for you.
          </p>
        </aside>
      )}
      {copy && (
        <aside
          className="rounded-md border border-ink bg-surface px-3 py-3"
          aria-label="Trial suggestion"
        >
          <p className="text-[11px] font-medium text-ink-3">From {copy.talk}</p>
          <h2 className="mt-1 text-[18px] font-medium text-ink">{copy.title}</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{copy.body}</p>
          <p className="mt-2 text-[13px] font-medium text-ink">{copy.cta}</p>
        </aside>
      )}
      {update && (
        <aside
          className="rounded-md border border-ink bg-surface px-3 py-3"
          aria-label="Trial update"
        >
          <p className="text-[15px] leading-relaxed text-ink">{patientUpdateCopy(catalog.talk)}</p>
        </aside>
      )}
      <PortalForm
        key={patientId}
        patientId={patientId}
        initial={prefs ?? initialAnswers}
        live
        onLiveSubmit={async (answers) => {
          apply(await postPreferences(patientId, answers));
          setSaved(true);
        }}
      />
      {saved && prefsStated(prefs) && (
        <p className="text-[13px] text-ink-2" role="status">
          Saved. Your care team can now see whether a trial is reachable for you.
        </p>
      )}
    </div>
  );
}
