"use client";

import { useState } from "react";
import { CitationPanel } from "./CitationPanel";
import type { CriteriaSection, GroupRow, LeafRow } from "./rows";
import { displayTone, type CriterionType, type Tone } from "./tone";
import { VerdictBadge } from "./VerdictBadge";

const GROUP_LABEL: Record<GroupRow["op"], string> = {
  AND: "ALL OF",
  OR: "ANY OF",
  NOT: "NOT",
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
      className="flex items-start gap-3 border-b border-line-2 bg-canvas/70 py-2 pr-3"
      style={indent(row.depth)}
    >
      <span className="mt-0.5 shrink-0 rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide text-ink-2">
        {GROUP_LABEL[row.op]}
      </span>
      <span className="min-w-0 flex-1 text-[12px] leading-snug text-ink-2">
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
}: {
  row: LeafRow;
  open: boolean;
  onToggle: () => void;
}) {
  const verdict = row.cell?.verdict ?? null;
  const tone = row.cell ? displayTone(row.cell, row.leaf.type) : "none";
  const panelId = `cite-${row.leaf.id}`;
  return (
    <div className="border-b border-line-2 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className={`relative flex w-full items-start gap-3 py-2.5 pr-3 text-left transition-colors hover:bg-canvas before:absolute before:inset-y-0 before:left-0 before:w-[3px] ${
          ACCENT[tone]
        }`}
        style={indent(row.depth)}
      >
        <VerdictBadge verdict={verdict} type={row.leaf.type} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-[12px] font-medium text-ink">{row.leaf.id}</span>
            <span className="font-mono text-[10px] uppercase tracking-wide text-ink-3">
              {row.leaf.predicate.replace("_", " ")}
              {row.leaf.analyte ? ` · ${row.leaf.analyte}` : ""}
            </span>
          </span>
          <span className={`mt-0.5 text-[13px] leading-snug text-ink-2 ${open ? "block" : "line-clamp-2"}`}>
            {row.leaf.sourceSpan}
          </span>
        </span>
        <span className="mt-0.5 shrink-0 font-mono text-[10px] text-ink-3" title="Resolution tier">
          T{row.leaf.tier}
        </span>
        <span
          aria-hidden
          className={`mt-0.5 shrink-0 text-ink-3 transition-transform ${open ? "rotate-90" : ""}`}
        >
          ›
        </span>
      </button>
      {open && (
        <div id={panelId}>
          <CitationPanel leaf={row.leaf} cell={row.cell} />
        </div>
      )}
    </div>
  );
}

export function CriteriaTable({
  sections,
  initialOpen = [],
}: {
  sections: CriteriaSection[];
  initialOpen?: string[];
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(initialOpen));
  const leafIds = sections.flatMap((s) =>
    s.rows.filter((r): r is LeafRow => r.kind === "leaf").map((r) => r.leaf.id),
  );
  const allOpen = leafIds.length > 0 && leafIds.every((id) => open.has(id));

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 sm:px-4">
        <h2 className="text-[13px] font-semibold text-ink">Criteria</h2>
        <button
          type="button"
          onClick={() => setOpen(allOpen ? new Set() : new Set(leafIds))}
          className="rounded px-2 py-1 font-mono text-[11px] text-ink-2 hover:bg-canvas hover:text-ink"
        >
          {allOpen ? "Collapse all" : "Expand all citations"}
        </button>
      </div>
      <div>
        {sections.map((section) => (
          <section key={section.type}>
            <h3 className="border-b border-line bg-canvas px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-3 sm:px-4">
              {section.type === "inclusion" ? "Inclusion" : "Exclusion"}
              {section.type === "exclusion" && (
                <span className="ml-2 normal-case tracking-normal">
                  — green means the patient clears this exclusion
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
                  open={open.has(row.leaf.id)}
                  onToggle={() => toggle(row.leaf.id)}
                />
              ),
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
