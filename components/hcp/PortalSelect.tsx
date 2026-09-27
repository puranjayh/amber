"use client";

import { useRouter } from "next/navigation";
import { panelName } from "@/components/hcp/clinic";

export function PortalSelect({ ids, current }: { ids: string[]; current: string }) {
  const router = useRouter();
  if (ids.length === 0) return null;
  return (
    <label className="block w-full">
      <span className="text-[12px] text-ink-3">Chart</span>
      <select
        value={current}
        aria-label="Your chart"
        onChange={(e) =>
          router.push(`/patient-portal?patient=${encodeURIComponent(e.target.value)}`)
        }
        className="mt-1 w-full rounded-md border border-brand-line bg-surface px-2 py-1.5 text-[13px] text-ink"
      >
        {ids.map((id) => (
          <option key={id} value={id}>
            {panelName(id)}
          </option>
        ))}
      </select>
    </label>
  );
}
