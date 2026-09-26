"use client";

import { useState } from "react";
import { CitationPanel } from "./CitationPanel";
import type { CriteriaSection, GroupRow, LeafRow } from "./rows";
import { displayTone, type CriterionType, type Tone } from "./tone";
import { VerdictBadge } from "./VerdictBadge";
import type { CriterionLeaf, Patient } from "@/src/contracts";

const GROUP_LABEL: Record<GroupRow["op"], string> = {
  AND: "All of",
  OR: "Any of",
  NOT: "Not",
};

const ACCENT: Record<Tone | "none", string> = {
  green: "before:bg-pass",
  red: "before:bg-fail",
  amber: "before:bg-unknown-line",
  none: "before:bg-ink-3",
};

function indent(depth: number) {
  return { paddingLeft: `${12 + depth * 18}px` };
}

function GroupLine({ row, type }: { row: GroupRow; type: CriterionType }) {
  return (
    <div
      className="flex min-h-11 items-start gap-3 border-b border-line-2 bg-canvas/70 py-3 pr-4"
      style={indent(row.depth)}
    >
      <span className="mt-0.5 shrink-0 rounded border border-line bg-surface px-1.5 py-0.5 text-[11px] font-medium text-ink-2">
        {GROUP_LABEL[row.op]}
      </span>
      <span className="min-w-0 flex-1 text-[15px] leading-[1.55] text-ink-2">
        {row.sourceSpan ?? "Grouped criteria"}
      </span>
      <VerdictBadge verdict={row.verdict} type={type} size="sm" />
    </div>
  );
}

function LeafLine({
  row,
  open,
  onToggle,
  patient,
  leaves,
}: {
  row: LeafRow;
  open: boolean;
  onToggle: () => void;
  patient?: Pick<Patient, "facts">;
  leaves?: readonly CriterionLeaf[];
}) {
  const verdict = row.cell?.verdict ?? null;
  const tone = row.cell ? displayTone(row.cell, row.leaf.type) : "none";
  const panelId = `cite-${row.key.replace(/[^A-Za-z0-9_-]/g, "-")}`;
  return (
    <div className="border-b border-line-2 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className={`relative flex min-h-11 w-full items-start gap-3 py-3 pr-4 text-left hover:bg-canvas before:absolute before:inset-y-0 before:left-0 before:w-[3px] ${
          ACCENT[tone]
        }`}
        style={indent(row.depth)}
      >
        <VerdictBadge verdict={verdict} type={row.leaf.type} />
        <span className="min-w-0 flex-1">
          <span className={`break-words text-[15px] leading-[1.55] text-ink ${open ? "block" : "line-clamp-2"}`}>
            {row.leaf.sourceSpan}
          </span>
          <span className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-[11px] text-ink-3">{row.leaf.id}</span>
            <span className="text-[11px] text-ink-3">
              {row.leaf.predicate.replace("_", " ")}
              {row.leaf.analyte ? ` · ${row.leaf.analyte}` : ""}
            </span>
          </span>
        </span>
        <span className="mt-0.5 shrink-0 font-mono text-[11px] text-ink-3" title="Resolution tier">
          T{row.leaf.tier}
        </span>
        <span aria-hidden className={`mt-0.5 shrink-0 text-ink-3 ${open ? "rotate-90" : ""}`}>
          ›
        </span>
      </button>
      {open && (
        <div id={panelId}>
          <CitationPanel leaf={row.leaf} cell={row.cell} patient={patient} leaves={leaves} />
        </div>
      )}
    </div>
  );
}

function openKeys(sections: CriteriaSection[], wanted: string[]): Set<string> {
  const ids = new Set(wanted);
  const keys = new Set<string>();
  for (const section of sections) {
    for (const row of section.rows) {
      if (row.kind === "leaf" && ids.has(row.leaf.id)) keys.add(row.key);
    }
  }
  return keys;
}

export function CriteriaTable({
  sections,
  initialOpen = [],
  patient,
  leaves,
}: {
  sections: CriteriaSection[];
  initialOpen?: string[];
  patient?: Pick<Patient, "facts">;
  leaves?: readonly CriterionLeaf[];
}) {
  const sectionKey = sections.flatMap((s) => s.rows.map((r) => r.key)).join("|");
  const [held, setHeld] = useState(() => ({
    key: sectionKey,
    open: openKeys(sections, initialOpen),
  }));
  if (held.key !== sectionKey) {
    setHeld({ key: sectionKey, open: openKeys(sections, initialOpen) });
  }
  const open = held.key === sectionKey ? held.open : openKeys(sections, initialOpen);
  const leafRows = sections.flatMap((s) => s.rows.filter((r): r is LeafRow => r.kind === "leaf"));
  const allOpen = leafRows.length > 0 && leafRows.every((r) => open.has(r.key));

  const toggle = (id: string) =>
    setHeld((prev) => {
      const current = prev.key === sectionKey ? prev.open : openKeys(sections, initialOpen);
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { key: sectionKey, open: next };
    });

  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 sm:px-4">
        <h2 className="text-[18px] font-semibold text-ink">Criteria</h2>
        <button
          type="button"
          onClick={() =>
            setHeld({
              key: sectionKey,
              open: allOpen ? new Set() : new Set(leafRows.map((r) => r.key)),
            })
          }
          className="rounded px-2 py-1 text-[13px] text-ink-2 hover:bg-canvas hover:text-ink"
        >
          {allOpen ? "Collapse all" : "Expand all citations"}
        </button>
      </div>
      <div>
        {sections.map((section) => (
          <section key={section.type}>
            <h3 className="border-b border-line bg-canvas px-4 py-3 text-[15px] font-medium text-ink">
              {section.type === "inclusion" ? "Inclusion" : "Exclusion"}
              {section.type === "exclusion" && (
                <span className="ml-2 text-[13px] font-normal text-ink-3">
                  Green means the patient clears this exclusion
                </span>
              )}
            </h3>
            {section.rows.map((row) =>
              row.kind === "group" ? (
                <GroupLine key={row.key} row={row} type={section.type} />
              ) : (
                <LeafLine
                  key={row.key}
                  row={row}
                  open={open.has(row.key)}
                  onToggle={() => toggle(row.key)}
                  patient={patient}
                  leaves={leaves}
                />
              ),
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
