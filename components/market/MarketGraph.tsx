"use client";

import { useState } from "react";
import { MODES, edgeKey, type Graph, type Mode } from "./graph";

const MODE_LABEL: Record<Mode, string> = {
  adhoc: "Ad hoc",
  stable: "Stable",
  stable_dap: "Stable + DAP",
};

const MODE_BLURB: Record<Mode, string> = {
  adhoc: "First trial found wins. How referrals happen today.",
  stable: "Gale–Shapley under capacity. No patient and trial would both rather swap.",
  stable_dap: "Stable, constrained to each sponsor's Diversity Action Plan targets.",
};

export function MarketGraph({ graph }: { graph: Graph }) {
  const available = MODES.filter((m) => graph.modes[m]);
  const [mode, setMode] = useState<Mode>(available[0] ?? "adhoc");
  const layout = graph.modes[mode];
  const assigned = new Set(layout?.assigned ?? []);
  const pos = new Map([...graph.patients, ...graph.trials].map((n) => [n.id, n]));

  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <div className="border-b border-line px-3 py-2.5 sm:px-4">
        <div role="radiogroup" aria-label="Matching mode" className="grid grid-cols-3 gap-1 rounded-md bg-canvas p-1">
          {MODES.map((m) => {
            const active = m === mode;
            const disabled = !graph.modes[m];
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled}
                onClick={() => setMode(m)}
                className={`rounded px-2 py-1.5 text-[12px] ${
                  active ? "bg-surface font-medium text-ink shadow-sm" : "text-ink-2 hover:text-ink"
                } disabled:opacity-40`}
              >
                {MODE_LABEL[m]}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] text-ink-2">{MODE_BLURB[mode]}</p>
      </div>

      <div className="mx-auto max-w-xl px-2 py-3">
        <svg
          viewBox={`0 0 ${graph.width} ${graph.height}`}
          className="w-full"
          role="img"
          aria-label={`${MODE_LABEL[mode]} assignment: ${
            layout?.assignment.pairs.map((p) => `${p.patientId} to ${p.nctId}`).join(", ") || "none"
          }`}
        >
          {graph.candidates.map((e) => {
            const a = pos.get(e.patientId);
            const b = pos.get(e.nctId);
            if (!a || !b || assigned.has(e.key)) return null;
            return (
              <line
                key={e.key}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={e.status === "unknown" ? "var(--unknown-line)" : "var(--ink-3)"}
                strokeWidth={1}
                strokeDasharray={e.status === "unknown" ? "4 3" : undefined}
              />
            );
          })}
          {graph.candidates
            .filter((e) => assigned.has(e.key))
            .map((e) => {
              const a = pos.get(e.patientId);
              const b = pos.get(e.nctId);
              if (!a || !b) return null;
              return (
                <line
                  key={e.key}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="var(--ink)"
                  strokeWidth={2.5}
                  strokeDasharray={e.status === "unknown" ? "7 3" : undefined}
                />
              );
            })}
          {layout?.invalid.map((p) => {
            const a = pos.get(p.patientId);
            const b = pos.get(p.nctId);
            if (!a || !b) return null;
            return (
              <line
                key={edgeKey(p.patientId, p.nctId)}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="var(--fail)"
                strokeWidth={2}
                strokeDasharray="2 2"
              />
            );
          })}

          {graph.patients.map((n) => (
            <g key={n.id}>
              <circle cx={n.x} cy={n.y} r={5} fill="var(--surface)" stroke="var(--ink)" strokeWidth={1.5} />
              <text x={n.x - 10} y={n.y + 3.5} textAnchor="end" className="fill-ink font-mono" fontSize={10}>
                {n.label.length > 12 ? `${n.label.slice(0, 10)}…` : n.label}
              </text>
            </g>
          ))}
          {graph.trials.map((n) => (
            <g key={n.id}>
              <rect x={n.x - 5} y={n.y - 5} width={10} height={10} fill="var(--surface)" stroke="var(--ink)" strokeWidth={1.5} />
              <text x={n.x + 10} y={n.y} className="fill-ink font-mono" fontSize={10}>
                {n.label.slice(-4)}
              </text>
              <text x={n.x + 10} y={n.y + 11} className="fill-ink-3 font-mono" fontSize={8}>
                {layout?.load[n.id] ?? 0}/{n.slots} slots
              </text>
            </g>
          ))}
        </svg>
        <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-ink-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-[2.5px] w-4 bg-ink" aria-hidden /> assigned
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-4 border-t-[2.5px] border-dashed border-ink" aria-hidden /> assigned,
            unknowns open
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-px w-4 bg-ink-3" aria-hidden /> eligible
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-4 border-t border-dashed border-unknown-line" aria-hidden /> open unknowns
          </span>
        </div>
      </div>

      {layout && (
        <div className="grid grid-cols-3 gap-px border-t border-line bg-line">
          {[
            ["enrolled", String(layout.assignment.enrolled)],
            ["mean travel", `${Math.round(layout.assignment.meanTravelMinutes)} min`],
            ["unstable pairs", String(layout.assignment.unstablePairs)],
          ].map(([label, value]) => (
            <div key={label} className="bg-surface px-2 py-2.5 sm:px-4">
              <div className="font-mono text-[16px] font-medium leading-none text-ink sm:text-[18px]">{value}</div>
              <div className="mt-1 text-[11px] text-ink-3">{label}</div>
            </div>
          ))}
        </div>
      )}
      {layout && layout.invalid.length > 0 && (
        <p className="border-t border-fail-line bg-fail-bg px-3 py-2 text-[12px] text-fail sm:px-4">
          {layout.invalid.length} assigned pair(s) were eliminated or never evaluated — upstream bug.
        </p>
      )}
    </div>
  );
}
