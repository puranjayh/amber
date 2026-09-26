"use client";

import { useMemo, useState } from "react";
import { READY_LABEL, type Ready } from "@/components/worklist/readiness";
import { LabelledRows } from "@/components/roster/LabelledRows";

export type DoctorListRow = {
  key: string;
  rank: number;
  name: string;
  details: string;
  trialName: string;
  blocker: string;
  tier: string;
  blockingType: string;
  close: Ready;
  eligible: number;
  unknown: number;
  rejected: number;
  href: string;
  draft: { subject: string; body: string } | null;
};

const CLOSE: { id: Ready | ""; label: string }[] = [
  { id: "", label: "Any" },
  { id: "eligible", label: READY_LABEL.eligible },
  { id: "one", label: READY_LABEL.one },
  { id: "several", label: READY_LABEL.several },
  { id: "eliminated", label: READY_LABEL.eliminated },
];

export function DoctorPatients({ rows }: { rows: DoctorListRow[] }) {
  const [blocking, setBlocking] = useState("");
  const [close, setClose] = useState<Ready | "">("");
  const [checked, setChecked] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  const blockingOptions = useMemo(
    () => [...new Set(rows.map((row) => row.blockingType))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const shown = rows.filter((row) => {
    if (blocking && row.blockingType !== blocking) return false;
    if (close && row.close !== close) return false;
    return true;
  });
  const drafts = shown.filter((row) => checked.includes(row.key) && row.draft).map((row) => row.draft!);

  return (
    <div className="space-y-4">
      <div className="flex w-full min-w-0 flex-wrap items-end gap-3">
        <Filter label="Blocking" value={blocking} onChange={setBlocking} options={blockingOptions} />
        <label className="block min-w-0 max-w-full flex-[1_1_100%] text-[13px] text-ink-3 sm:max-w-xs sm:flex-none">
          How close
          <select
            value={close}
            onChange={(event) => setClose(event.target.value as Ready | "")}
            className="mt-1 block w-full max-w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[15px] text-ink"
          >
            {CLOSE.map((option) => (
              <option key={option.id || "any"} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {shown.length === 0 ? (
        <p className="text-[15px] text-ink-2">No patients match these filters.</p>
      ) : (
        <LabelledRows
          label="My patients"
          layout="clinic"
          showToggle={false}
          rows={shown.map((row) => ({
            key: row.key,
            rank: row.rank,
            patient: row.name,
            details: row.details,
            trial: row.trialName,
            met: null,
            total: null,
            blocking: row.blocker,
            tier: row.tier,
            href: row.href,
            counts: { eligible: row.eligible, unknown: row.unknown, rejected: row.rejected },
            select: {
              checked: checked.includes(row.key),
              label: `Select ${row.name}`,
              onChange: () =>
                setChecked((prev) =>
                  prev.includes(row.key) ? prev.filter((id) => id !== row.key) : [...prev, row.key],
                ),
            },
          }))}
        />
      )}
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
        <section className="space-y-2 rounded-md border border-line bg-surface px-4 py-3" aria-label="Outreach drafts">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[18px] font-medium text-ink">
              {drafts.length} draft{drafts.length === 1 ? "" : "s"}
            </h2>
            <button type="button" onClick={() => setOpen(false)} className="text-[13px] text-ink-3 hover:text-ink">
              Close
            </button>
          </div>
          {drafts.map((draft) => (
            <article key={draft.subject} className="rounded border border-line-2 px-3 py-2">
              <h3 className="text-[13px] font-medium text-ink">{draft.subject}</h3>
              <pre className="mt-1 whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-ink-2">{draft.body}</pre>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: string[];
}) {
  return (
    <label className="block min-w-0 max-w-full flex-[1_1_100%] text-[13px] text-ink-3 sm:max-w-xs sm:flex-none">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block w-full max-w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[15px] text-ink"
      >
        <option value="">Any</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
