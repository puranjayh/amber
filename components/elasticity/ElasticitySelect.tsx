"use client";

import { useRouter } from "next/navigation";

export function ElasticitySelect({
  picks,
  current,
  demo = false,
}: {
  picks: { nctId: string; criterionId: string; label: string }[];
  current: string;
  demo?: boolean;
}) {
  const router = useRouter();
  if (picks.length === 0) return null;
  return (
    <label className="block">
      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-ink-3">
        Analyte
      </span>
      <select
        value={current}
        aria-label="Analyte"
        onChange={(e) => {
          const href = demo ? `/elasticity?demo=1&sweep=${encodeURIComponent(e.target.value)}` : `/elasticity?sweep=${encodeURIComponent(e.target.value)}`;
          router.push(href);
        }}
        className="mt-1 w-full max-w-md rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-[12px] text-ink"
      >
        {picks.map((p) => (
          <option key={`${p.nctId}:${p.criterionId}`} value={`${p.nctId}:${p.criterionId}`}>
            {p.label} · {p.nctId} {p.criterionId}
          </option>
        ))}
      </select>
    </label>
  );
}
