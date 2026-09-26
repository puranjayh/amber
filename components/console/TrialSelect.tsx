"use client";

import { useRouter } from "next/navigation";

export function TrialSelect({
  trials,
  current,
  path,
}: {
  trials: string[];
  current: string;
  path: string;
}) {
  const router = useRouter();
  if (trials.length === 0) return null;
  return (
    <label className="block">
      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-ink-3">
        Trial
      </span>
      <select
        value={current}
        aria-label="Trial"
        onChange={(e) => router.push(`${path}?trial=${e.target.value}`)}
        className="mt-1 w-full max-w-md rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-[12px] text-ink"
      >
        {trials.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
    </label>
  );
}
