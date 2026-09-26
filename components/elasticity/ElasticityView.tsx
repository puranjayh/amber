"use client";

import { useState } from "react";
import type { Sweep } from "./sweep";

function signed(n: number) {
  return n > 0 ? `+${n}` : n === 0 ? "±0" : `${n}`;
}

export function ElasticityView({
  sweep,
  label,
  operator,
  unit,
}: {
  sweep: Sweep;
  label: string;
  operator: string;
  unit?: string;
}) {
  const [index, setIndex] = useState(sweep.protocolIndex);
  const row = sweep.rows[index];
  const protocol = sweep.rows[sweep.protocolIndex];
  const first = sweep.rows[0];
  const last = sweep.rows[sweep.rows.length - 1];
  const u = unit ? ` ${unit}` : "";

  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <div className="border-b border-line px-3 py-2.5 sm:px-4">
        <div className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-ink-3">
          Threshold
        </div>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
          <span className="font-mono text-[20px] font-medium text-ink">
            {label} {operator} {row.threshold}
            {u}
          </span>
          {index !== sweep.protocolIndex && (
            <span className="font-mono text-[11px] text-ink-3">
              protocol: {protocol.threshold}
              {u}
            </span>
          )}
        </div>
      </div>

      <div className="px-3 pt-3 sm:px-4">
        <svg
          viewBox={`0 0 ${sweep.chart.width} ${sweep.chart.height}`}
          className="h-32 w-full"
          preserveAspectRatio="none"
          role="img"
          aria-label={`Eligible patients from ${first.eligibleCount} at ${first.threshold}${u} to ${last.eligibleCount} at ${last.threshold}${u}`}
        >
          <path d={sweep.chart.area} fill="var(--line-2)" />
          <path
            d={sweep.chart.line}
            fill="none"
            stroke="var(--ink-2)"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={protocol.x}
            x2={protocol.x}
            y1={0}
            y2={sweep.chart.height}
            stroke="var(--ink-3)"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={row.x}
            x2={row.x}
            y1={0}
            y2={sweep.chart.height}
            stroke="var(--ink)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="flex justify-between font-mono text-[10px] text-ink-3">
          <span>
            {first.threshold}
            {u}
          </span>
          <span>
            {last.threshold}
            {u}
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={sweep.rows.length - 1}
          step={1}
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
          aria-label={`${label} threshold`}
          aria-valuetext={`${label} ${operator} ${row.threshold}${u}, ${row.eligibleCount} eligible`}
          className="mt-2 w-full accent-[var(--ink)]"
        />
        <div className="flex justify-between text-[11px] text-ink-3">
          <span>{sweep.loosenTowards === "lower" ? "← loosen" : "← tighten"}</span>
          <span>{sweep.loosenTowards === "lower" ? "tighten →" : "loosen →"}</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-3">
        <div className="bg-surface px-3 py-2.5 sm:px-4">
          <div className="font-mono text-[22px] font-medium leading-none text-ink">{row.eligibleCount}</div>
          <div className="mt-1 text-[11px] text-ink-3">eligible</div>
        </div>
        <div className="bg-surface px-3 py-2.5 sm:px-4">
          <div className="font-mono text-[22px] font-medium leading-none text-ink">
            {signed(row.deltaVsProtocol)}
          </div>
          <div className="mt-1 text-[11px] text-ink-3">vs protocol threshold</div>
        </div>
        <div className="col-span-2 bg-surface px-3 py-2.5 sm:col-span-1 sm:px-4">
          <div className="font-mono text-[22px] font-medium leading-none text-ink">
            {row.excludedByThisAlone}
          </div>
          <div className="mt-1 text-[11px] text-ink-3">excluded by this criterion alone</div>
        </div>
      </div>

      {sweep.subgroups.length > 0 && (
        <div className="border-t border-line px-3 py-3 sm:px-4">
          <div className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-ink-3">
            Eligible by subgroup
          </div>
          <ul className="space-y-1.5">
            {sweep.subgroups.map((g) => {
              const count = row.bySubgroup?.[g] ?? 0;
              const pct = sweep.maxSubgroupCount ? (count / sweep.maxSubgroupCount) * 100 : 0;
              return (
                <li key={g} className="grid grid-cols-[5.5rem_1fr_4.5rem] items-center gap-2 text-[12px]">
                  <span className="truncate text-ink-2">{g}</span>
                  <span className="h-2 overflow-hidden rounded-sm bg-line-2">
                    <span className="block h-full bg-ink-2" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="text-right font-mono text-ink">
                    {count}
                    <span className="ml-1 text-[10px] text-ink-3">{signed(row.subgroupDelta[g])}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
