"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

export type LabelledRow = {
  key: string;
  rank: number;
  patient: ReactNode;
  trial: ReactNode;
  met: number | null;
  /** Criteria on the trial. The figure is met/total. */
  total: number | null;
  blocking: ReactNode;
  tier: ReactNode;
  href?: string;
  onClick?: () => void;
  advanceTo?: number;
  selected?: boolean;
  /** Second line under the name. Used by the clinic row. */
  details?: ReactNode;
  /** Trials this patient is eligible for, still unknown on, or rejected from. */
  counts?: { eligible: number; unknown: number; rejected: number };
  select?: { checked: boolean; label: string; onChange: () => void };
};

const FIELDS = ["#", "Patient", "Best trial", "Met", "Blocking", "Resolution tier"] as const;

function Met({ met, total }: { met: number | null; total: number | null }) {
  if (met === null || !total) return <span className="text-ink-3">—</span>;
  return (
    <span className="font-mono text-[24px] font-medium leading-none text-ink">
      {met}
      <span className="font-normal text-ink-3">/</span>
      {total}
    </span>
  );
}

function Grid({ row }: { row: LabelledRow }) {
  const values = [
    <span key="rank" className="font-mono text-[15px] text-ink-3">
      {row.rank}
    </span>,
    <span key="patient" className="min-w-0 text-[15px] leading-[1.55] text-ink">
      {row.patient}
    </span>,
    <span key="trial" className="min-w-0 text-[15px] leading-[1.55] text-ink">
      {row.trial}
    </span>,
    <Met key="met" met={row.met} total={row.total} />,
    <span key="blocking" className="min-w-0 text-[15px] leading-[1.55] text-ink">
      {row.blocking}
    </span>,
    <span key="tier" className="text-[15px] leading-[1.55] text-ink">
      {row.tier}
    </span>,
  ];
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
      {FIELDS.map((label, index) => (
        <div key={label} className="min-w-0">
          <div className="text-[13px] text-ink-3">{label}</div>
          <div className="mt-0.5">{values[index]}</div>
        </div>
      ))}
    </div>
  );
}

function Count({ value, label }: { value: number; label: string }) {
  return (
    <div className="min-w-[4.5rem] text-left">
      <div className="font-mono text-[24px] font-semibold leading-none text-ink">{value}</div>
      <div className="mt-1 text-[13px] text-ink-3">{label}</div>
    </div>
  );
}

function Clinic({ row }: { row: LabelledRow }) {
  const counts = row.counts ?? { eligible: 0, unknown: 0, rejected: 0 };
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[28px] font-semibold leading-none text-ink">{row.rank}</span>
          <span className="text-[22px] font-semibold leading-tight text-ink">{row.patient}</span>
        </div>
        {row.details ? <p className="mt-1 text-[13px] text-ink-3">{row.details}</p> : null}
        <p className="mt-2 text-[18px] font-medium leading-snug text-ink">{row.trial}</p>
        <p className="mt-0.5 text-[13px] text-ink-2">
          {row.blocking}
          <span className="text-ink-3"> · {row.tier}</span>
        </p>
      </div>
      <div className="flex shrink-0 gap-6">
        <Count value={counts.eligible} label="Eligible" />
        <Count value={counts.unknown} label="Unknown" />
        <Count value={counts.rejected} label="Rejected" />
      </div>
    </div>
  );
}

function Compact({ row }: { row: LabelledRow }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 md:grid-cols-6 md:items-baseline">
      <span className="font-mono text-[13px] text-ink-3">{row.rank}</span>
      <span className="min-w-0 text-[15px] text-ink">{row.patient}</span>
      <span className="min-w-0 text-[13px] text-ink-2 md:col-span-1">{row.trial}</span>
      <Met met={row.met} total={row.total} />
      <span className="min-w-0 text-[13px] text-ink-2">{row.blocking}</span>
      <span className="text-[13px] text-ink-2">{row.tier}</span>
    </div>
  );
}

export function DensityToggle({
  compact,
  onChange,
}: {
  compact: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button type="button" onClick={() => onChange(!compact)} className="text-[13px] text-ink-3 hover:text-ink">
      {compact ? "Labels" : "Compact"}
    </button>
  );
}

export function LabelledRows({
  label,
  rows,
  compact: compactProp,
  onCompact,
  showToggle = true,
  layout = "grid",
}: {
  label: string;
  rows: LabelledRow[];
  compact?: boolean;
  onCompact?: (next: boolean) => void;
  showToggle?: boolean;
  layout?: "grid" | "clinic";
}) {
  const [held, setHeld] = useState(false);
  const compact = compactProp ?? held;
  const setCompact = onCompact ?? setHeld;
  const clinic = layout === "clinic";
  return (
    <div>
      {showToggle && !clinic && (
        <div className="mb-2 flex justify-end">
          <DensityToggle compact={compact} onChange={setCompact} />
        </div>
      )}
      <ol className="overflow-hidden rounded-md border border-line bg-surface" aria-label={label}>
        {rows.map((row) => {
          const body = clinic ? <Clinic row={row} /> : compact ? <Compact row={row} /> : <Grid row={row} />;
          const className = `block text-left hover:bg-canvas ${row.selected ? "bg-canvas" : ""} ${
            clinic ? `px-4 py-4 ${row.select ? "pl-16" : ""}` : "px-4 py-3"
          }`;
          return (
            <li key={row.key} className="relative border-b border-line-2 last:border-b-0">
              {clinic && row.select ? (
                <input
                  type="checkbox"
                  checked={row.select.checked}
                  aria-label={row.select.label}
                  onChange={row.select.onChange}
                  className="absolute left-4 top-5 z-10 size-8 accent-[var(--ink)]"
                />
              ) : null}
              {row.href ? (
                <Link href={row.href} className={className} aria-current={row.selected ? "page" : undefined}>
                  {body}
                </Link>
              ) : row.onClick || row.advanceTo !== undefined ? (
                <button
                  type="button"
                  data-advance={row.advanceTo}
                  onClick={row.onClick}
                  className={`${className} w-full`}
                  aria-current={row.selected ? "true" : undefined}
                >
                  {body}
                </button>
              ) : (
                <div className={className}>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
