"use client";

import { useRouter } from "next/navigation";

export function PortalSelect({ ids, current }: { ids: string[]; current: string }) {
  const router = useRouter();
  if (ids.length === 0) return null;
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-ink-3">Your code</span>
      <select
        value={current}
        aria-label="Your code"
        onChange={(e) =>
          router.push(`/patient-portal?patient=${encodeURIComponent(e.target.value)}`)
        }
        className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-[13px] text-ink"
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
