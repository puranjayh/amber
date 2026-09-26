"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DensityToggle, LabelledRows } from "@/components/roster/LabelledRows";
import { doctorChartPath } from "./access";
import { CLINIC_BUCKETS, type ClinicCard } from "./clinic";
import type { OutreachDraft } from "./outreach";
import { pct } from "./race";

export type HcpRosterRow = ClinicCard & {
  patientId: string;
  nctId: string;
  draft: OutreachDraft | null;
  met?: number | null;
  total?: number | null;
  tier?: string;
};

function panelKey(rows: HcpRosterRow[]): string {
  return rows.map((r) => r.patientId).join(",");
}

export function HcpView({
  rows,
  selectedId,
  headline,
  panelShare,
  admittedShare,
  physicianId,
  demoMode,
}: {
  rows: HcpRosterRow[];
  selectedId?: string;
  headline: string;
  panelShare: Record<string, number>;
  admittedShare: Record<string, number>;
  physicianId: string;
  demoMode?: "1" | "static";
}) {
  const id = panelKey(rows);
  const [held, setHeld] = useState({ id, checked: [] as string[] });
  const [open, setOpen] = useState(false);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    setHeld((prev) => (prev.id === id ? prev : { id, checked: [] }));
    setOpen(false);
  }, [id]);

  const checked = held.id === id ? held.checked : [];

  const drafts = rows.filter((r) => checked.includes(r.patientId) && r.draft).map((r) => r.draft!);
  const groups = [...new Set([...Object.keys(panelShare), ...Object.keys(admittedShare)])].sort();

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-line bg-surface px-4 py-6">
        <p className="text-[15px] font-medium text-ink">Not generated yet</p>
        <p className="mt-1 text-[13px] text-ink-2">
          app/_data/worklist.json has no ranked patients.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] text-ink-3">Impiricus</p>
          <h1 className="mt-1 text-[24px] font-medium text-ink">My patients</h1>
        </div>
        <DensityToggle compact={compact} onChange={setCompact} />
      </div>
        {CLINIC_BUCKETS.map((bucket) => {
          const group = rows
            .filter((row) => row.bucket === bucket.id)
            .sort((a, b) => a.name.localeCompare(b.name) || a.patientId.localeCompare(b.patientId));
          if (group.length === 0) return null;
          return (
            <section key={bucket.id} aria-label={bucket.label}>
              <h2 className="mb-2 flex items-baseline gap-2 text-[18px] font-medium text-ink">
                {bucket.label}
                <span className="font-mono text-[11px] font-normal text-ink-3">{group.length}</span>
              </h2>
              <LabelledRows
                label={bucket.label}
                compact={compact}
                showToggle={false}
                rows={group.map((row, index) => {
                  const on = checked.includes(row.patientId);
                  return {
                    key: row.patientId,
                    rank: index + 1,
                    selected: selectedId === row.patientId,
                    patient: (
                      <span className="inline-flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={on}
                          aria-label={`Select ${row.name}`}
                          onChange={() => {
                            const next = on
                              ? checked.filter((pid) => pid !== row.patientId)
                              : [...checked, row.patientId];
                            setHeld({ id, checked: next });
                          }}
                        />
                        <Link
                          href={doctorChartPath({
                            physicianId,
                            patientId: row.patientId,
                            trialId: row.nctId,
                            demo: demoMode ?? null,
                          })}
                          className="font-medium hover:underline"
                        >
                          {row.name}
                        </Link>
                      </span>
                    ),
                    trial: row.trialName,
                    met: row.met ?? null,
                    total: row.total ?? null,
                    blocking: row.blocker,
                    tier: row.tier ?? "—",
                  };
                })}
              />
            </section>
          );
        })}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={drafts.length === 0}
          onClick={() => setOpen(true)}
          className="rounded-md bg-ink px-3 py-1.5 text-[13px] font-medium text-surface hover:bg-ink-2 disabled:opacity-40"
        >
          Draft outreach{drafts.length ? ` (${drafts.length})` : ""}
        </button>
        <span className="text-[13px] text-ink-3">Draft only — never send.</span>
      </div>

      {open && (
        <section
          className="space-y-2 rounded-md border border-line bg-surface px-3 py-3 sm:px-4"
          aria-label="Outreach drafts"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[18px] font-medium text-ink">
              {drafts.length} draft{drafts.length === 1 ? "" : "s"}
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[11px] text-ink-2 hover:text-ink"
            >
              Close
            </button>
          </div>
          {drafts.length === 0 ? (
            <p className="text-[13px] text-ink-2">
              Select patients that still have an open unknown.
            </p>
          ) : (
            drafts.map((d) => (
              <article
                key={`${d.patientId}:${d.nctId}`}
                className="rounded border border-line-2 px-3 py-2"
              >
                <h3 className="text-[13px] font-medium text-ink">{d.subject}</h3>
                <pre className="mt-1 whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-ink-2">
                  {d.body}
                </pre>
              </article>
            ))
          )}
        </section>
      )}

      <details className="rounded-md border border-line bg-surface px-3 py-2.5 sm:px-4">
        <summary className="cursor-pointer text-[13px] font-medium text-ink">
          Who this panel leaves out
        </summary>
        <p className="mt-2 text-[15px] leading-[1.55] text-ink">{headline}</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
          {groups.map((g) => (
            <div key={g}>
              <dt className="text-ink-3">{g}</dt>
              <dd className="font-mono text-ink">
                {pct(panelShare[g] ?? 0)} / {pct(admittedShare[g] ?? 0)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-[13px] text-ink-3">Panel share / admitted share</p>
      </details>
    </div>
  );
}
