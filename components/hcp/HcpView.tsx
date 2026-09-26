"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { doctorQuery } from "./access";
import type { OutreachDraft } from "./outreach";
import type { GroupHit } from "./panel";
import { pct } from "./race";

export type HcpRosterRow = {
  patientId: string;
  nctId: string;
  unknownCount: number;
  race: string;
  groupHit?: GroupHit;
  draft: OutreachDraft | null;
};

function shortId(id: string): string {
  return id.length > 18 ? `${id.slice(0, 16)}…` : id;
}

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
        <p className="text-[14px] font-medium text-ink">Not generated yet</p>
        <p className="mt-1 text-[12px] text-ink-2">app/_data/worklist.json has no ranked patients.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-3">
          Impiricus · your panel
        </p>
        <h1 className="mt-0.5 text-[16px] font-medium text-ink">My patients</h1>
        <p className="mt-0.5 text-[12px] text-ink-2">
          Top {rows.length} by rank() — fewest unknowns, then expected value, then travel. Click a
          row for both citations. Checkboxes draft outreach. Nothing is sent.
        </p>
      </div>

      <aside className="rounded-md border border-line bg-surface px-3 py-2.5 sm:px-4">
        <p className="text-[13px] font-medium text-ink">{headline}</p>
        <dl className="mt-2 grid grid-cols-3 gap-2 font-mono text-[11px] sm:grid-cols-4">
          {groups.map((g) => (
            <div key={g}>
              <dt className="text-ink-3">{g}</dt>
              <dd className="text-ink">
                {pct(panelShare[g] ?? 0)} / {pct(admittedShare[g] ?? 0)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-1.5 font-mono text-[10px] text-ink-3">panel share / admitted share</p>
      </aside>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={drafts.length === 0}
          onClick={() => setOpen(true)}
          className="rounded-md bg-ink px-3 py-1.5 text-[12px] font-medium text-surface hover:bg-ink-2 disabled:opacity-40"
        >
          Draft outreach{drafts.length ? ` (${drafts.length})` : ""}
        </button>
        <span className="text-[11px] text-ink-3">Draft only — never send.</span>
      </div>

      {open && (
        <section className="space-y-2 rounded-md border border-line bg-surface px-3 py-3 sm:px-4" aria-label="Outreach drafts">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[13px] font-medium text-ink">
              {drafts.length} draft{drafts.length === 1 ? "" : "s"}
            </h2>
            <button type="button" onClick={() => setOpen(false)} className="font-mono text-[11px] text-ink-2 hover:text-ink">
              Close
            </button>
          </div>
          {drafts.length === 0 ? (
            <p className="text-[12px] text-ink-2">Select patients that still have an open unknown.</p>
          ) : (
            drafts.map((d) => (
              <article key={`${d.patientId}:${d.nctId}`} className="rounded border border-line-2 px-3 py-2">
                <h3 className="font-mono text-[12px] font-medium text-ink">{d.subject}</h3>
                <pre className="mt-1 whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-ink-2">{d.body}</pre>
              </article>
            ))
          )}
        </section>
      )}

      <ol className="overflow-hidden rounded-md border border-line bg-surface">
        {rows.map((row, i) => {
          const current = selectedId === row.patientId;
          const on = checked.includes(row.patientId);
          return (
            <li key={row.patientId} className="border-b border-line-2 last:border-b-0">
              <div className={`flex items-start gap-2 px-3 py-2.5 sm:px-4 ${current ? "bg-canvas" : ""}`}>
                <input
                  type="checkbox"
                  checked={on}
                  aria-label={`Select ${row.patientId}`}
                  onChange={() => {
                    const next = on ? checked.filter((id) => id !== row.patientId) : [...checked, row.patientId];
                    setHeld({ id, checked: next });
                  }}
                  className="mt-1"
                />
                <Link
                  href={doctorQuery({ physicianId, patientId: row.patientId, demo: demoMode ?? null })}
                  aria-current={current ? "page" : undefined}
                  className="min-w-0 flex-1 text-left hover:text-ink"
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="font-mono text-[13px] font-medium text-ink">
                      <span className="mr-1.5 text-ink-3">{i + 1}.</span>
                      {shortId(row.patientId)}
                    </span>
                    <span className="font-mono text-[11px] text-ink-3">
                      {row.nctId} · {row.unknownCount}?
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] text-ink-2">{row.race}</span>
                  {row.groupHit && (
                    <span className="mt-1 block text-[11px] text-ink">
                      {row.groupHit.criterionId} excludes {row.groupHit.group} at{" "}
                      {pct(row.groupHit.rate)} — higher than other groups.
                    </span>
                  )}
                </Link>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
