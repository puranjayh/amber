"use client";

import { useRouter } from "next/navigation";

export function PortalSelect({ ids, current }: { ids: string[]; current: string }) {
  const router = useRouter();
  if (ids.length === 0) return null;
  return (
    <label className="block">
      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-ink-3">
        Your code
      </span>
      <select
        value={current}
        aria-label="Your code"
        onChange={(e) => router.push(`/patient-portal?patient=${encodeURIComponent(e.target.value)}`)}
        className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-[12px] text-ink"
      >
        {ids.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
    </label>
  );
}
