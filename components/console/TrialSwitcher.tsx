"use client";

import { useRouter } from "next/navigation";
import { ANCHORS } from "./anchors";

/** Two real protocols that invert on prior EGFR TKI. Switching re-ranks the panel. */
export function TrialSwitcher({
  current,
  demo = "",
}: {
  current: string;
  demo?: string;
}) {
  const router = useRouter();
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">Trial</span>
      <select
        aria-label="Trial"
        value={current}
        onChange={(e) => {
          const q = new URLSearchParams();
          q.set("trial", e.target.value);
          if (demo) q.set("demo", demo);
          router.push(`/?${q.toString()}`);
        }}
        className="w-full max-w-xl rounded-md border border-line bg-surface px-2 py-1.5 text-[12px] text-ink"
      >
        {ANCHORS.map((trial) => (
          <option key={trial.nctId} value={trial.nctId}>
            {trial.nctId} — {trial.short} ({trial.line})
          </option>
        ))}
      </select>
    </label>
  );
}
