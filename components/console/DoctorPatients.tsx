"use client";

import { useMemo, useState } from "react";
import { downloadNotes } from "@/components/console/notesPdf";
import type { Ready } from "@/components/worklist/readiness";
import { LabelledRows } from "@/components/roster/LabelledRows";

export type DoctorListRow = {
  key: string;
  rank: number;
  name: string;
  code: string;
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
  { id: "eligible", label: "eligible now" },
  { id: "one", label: "one fact away" },
  { id: "several", label: "partially fulfilled" },
  { id: "eliminated", label: "eliminated" },
];

export function DoctorPatients({ rows }: { rows: DoctorListRow[] }) {
  const [blocking, setBlocking] = useState("");
  const [close, setClose] = useState<Ready | "">("");
  const [checked, setChecked] = useState<string[]>([]);

  const blockingOptions = useMemo(
    () =>
      [...new Set(rows.map((row) => row.blockingType))]
        .filter((option) => option !== "Nothing open on this trial")
        .sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const shown = rows.filter((row) => {
    if (blocking && row.blockingType !== blocking) return false;
    if (close && row.close !== close) return false;
    return true;
  });
  const picked = rows.filter((row) => checked.includes(row.key));
  const shownKeys = shown.map((row) => row.key);
  const allShownChecked = shown.length > 0 && shownKeys.every((key) => checked.includes(key));

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={picked.length === 0}
          onClick={() =>
            downloadNotes(
              picked.map((row) => ({
                name: row.name,
                code: row.code,
                body: "I have a clinical trial that may be a fit for you. I would like to go through it at our next visit.",
                kicker: "Visit note",
              })),
            )
          }
          className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-on-brand disabled:opacity-40"
        >
          Download selected{picked.length ? ` (${picked.length})` : ""}
        </button>
        <button
          type="button"
          onClick={() =>
            setChecked((prev) =>
              allShownChecked ? prev.filter((key) => !shownKeys.includes(key)) : [...new Set([...prev, ...shownKeys])],
            )
          }
          className="text-[13px] text-brand"
        >
          {allShownChecked ? "Clear" : "Select all"}
        </button>
        <p className="text-[13px] text-ink-3">
          {picked.length === 0
            ? "Check the patients, then download. One PDF, one page each."
            : `${picked.length} ${picked.length === 1 ? "page" : "pages"} in one PDF.`}
        </p>
      </div>
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
        <p className="no-print text-[15px] text-ink-2">No patients match these filters.</p>
      ) : (
        <div className="no-print">
        <LabelledRows
          label="My patients"
          layout="clinic"
          showToggle={false}
          rows={shown.map((row) => ({
            key: row.key,
            rank: row.rank,
            patient: (
              <span className="inline-flex flex-wrap items-baseline gap-x-2">
                <span>{row.name}</span>
                <span className="font-mono text-[12px] font-normal text-ink-3">{row.code}</span>
              </span>
            ),
            details: row.details,
            trial: row.trialName,
            met: null,
            total: null,
            blocking: row.blocker,
            tier: row.tier,
            href: row.href,
            counts: { eligible: row.eligible, unknown: row.unknown, rejected: row.rejected },
            tone: row.eligible > 0 ? "eligible" : row.unknown > 0 ? "partial" : "rejected",
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
        </div>
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
