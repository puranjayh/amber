"use client";

import { useState } from "react";
import type { LoopState } from "@/app/_data/schema";
import { resetLoop } from "@/components/loop/useLoop";

export function ResetDemo({ initial }: { initial: LoopState }) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  return (
    <section className="rounded-md border border-line bg-surface px-3 py-3 sm:px-4">
      <h1 className="text-[24px] font-medium text-ink">Live loop</h1>
      <p className="mt-1 text-[13px] text-ink-2">
        Shared store ({state.backend}): {state.preferences.length} preference rows,{" "}
        {state.nudges.length} nudges, {state.notes.length} physician notes. Reset restores the
        seeded cohort and clears every nudge, including a trial update, so the three-portal loop can
        run again. Coordinator notes persist — they are the tool, not the loop.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void resetLoop()
            .then((next) => {
              setState(next);
              setDone(true);
            })
            .finally(() => setBusy(false));
        }}
        className="mt-3 rounded-md bg-ink px-3 py-1.5 text-[13px] font-medium text-surface hover:bg-ink-2 disabled:opacity-40"
      >
        {busy ? "Resetting…" : "Reset demo"}
      </button>
      {done && (
        <p className="mt-2 text-[13px] text-ink-2" role="status">
          Cleared. {state.preferences.length} patients still have seeded preferences; the focus
          patient does not.
        </p>
      )}
    </section>
  );
}
