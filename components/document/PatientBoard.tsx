"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { LoopState } from "@/app/_data/schema";
import type { PairResult, Patient, Trial } from "@/src/contracts";
import { CriteriaTable } from "@/components/criteria/CriteriaTable";
import { buildSections, listLeaves } from "@/components/criteria/rows";
import { DoctorActions, type DoctorOrder } from "@/components/hcp/DoctorActions";
import { downloadNotes } from "@/components/console/notesPdf";
import { panelName } from "@/components/hcp/clinic";
import { trialBlocks, unknownLabel, standingOf, type BoardEntry } from "./board";

export type BoardDetail = {
  nctId: string;
  trial: Trial;
  pair: PairResult;
  documentHref: string;
  documentBody: string;
  order?: DoctorOrder;
};

export function PatientBoard({
  patient,
  entries,
  details,
  initialNctId,
  loop,
  live,
}: {
  patient: Patient;
  entries: BoardEntry[];
  details: BoardDetail[];
  initialNctId: string;
  loop: LoopState;
  live: boolean;
}) {
  const [nctId, setNctId] = useState(initialNctId);
  const [moved, setMoved] = useState(false);
  const [shown, setShown] = useState(() => shownCount(entries, initialNctId));
  const heading = useRef<HTMLHeadingElement>(null);
  const byId = new Map(details.map((row) => [row.nctId, row]));
  const selected = byId.get(nctId) ?? details[0];
  const visible = entries.slice(0, shown);
  const hidden = Math.max(0, entries.length - shown);

  useEffect(() => {
    if (!moved) return;
    const node = heading.current;
    if (!node) return;
    node.scrollIntoView({ block: "start" });
    node.focus();
  }, [nctId, moved]);

  if (!selected) return null;

  return (
    <div className="space-y-8">
      <section aria-label="Trials this patient could go for">
        <h2 className="text-[18px] font-medium text-ink">Trials</h2>
        <ol className="mt-3 overflow-hidden rounded-md border border-brand-line bg-surface">
          {visible.map((row) => {
            const current = row.nctId === selected.nctId;
            const standing = standingOf(row);
            const bar =
              standing === "eligible"
                ? "border-l-pass"
                : standing === "rejected"
                  ? "border-l-fail"
                  : standing === "partial"
                    ? "border-l-unknown"
                    : "border-l-line";
            const wash =
              standing === "eligible"
                ? "bg-pass-bg"
                : standing === "rejected"
                  ? "bg-fail-bg"
                  : standing === "partial"
                    ? "bg-unknown-bg"
                    : "";
            const score =
              standing === "eligible"
                ? "text-pass"
                : standing === "rejected"
                  ? "text-fail"
                  : standing === "partial"
                    ? "text-unknown"
                    : "text-ink";
            return (
              <li key={row.nctId} className="border-b border-line-2 last:border-b-0">
                <button
                  type="button"
                  aria-pressed={current}
                  aria-controls="trial-detail"
                  onClick={() => {
                    setNctId(row.nctId);
                    setMoved(true);
                  }}
                  className={`flex w-full flex-col gap-2 border-l-4 px-4 py-4 text-left sm:flex-row sm:items-baseline sm:gap-5 ${bar} ${
                    current ? wash : "hover:bg-canvas"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-3 sm:contents">
                    <span className={`shrink-0 font-mono text-[28px] font-medium leading-none ${score}`}>
                      {row.total > 0 ? (
                        <>
                          {row.met}
                          <span className="font-normal text-ink-3">/</span>
                          {row.total}
                        </>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                      <span className="mt-1 block max-w-[7rem] font-sans text-[11px] font-normal leading-tight text-ink-3">
                        conditions fulfilled
                      </span>
                    </span>
                    <span className="text-right text-[15px] leading-tight sm:order-3 sm:shrink-0">
                      <span className={row.unknownCount > 0 ? "font-medium text-unknown" : "text-ink-3"}>
                        {unknownLabel(row.unknownCount)}
                      </span>
                      {standing === "rejected" ? <span className="mt-0.5 block text-[13px] text-fail">Ruled out</span> : null}
                      {standing === "eligible" ? <span className="mt-0.5 block text-[13px] text-pass">Eligible</span> : null}
                      {standing === "partial" ? (
                        <span className="mt-0.5 block text-[13px] text-unknown">Partially fulfilled</span>
                      ) : null}
                    </span>
                  </span>
                  <span className="min-w-0 sm:flex-1">
                    <span className="block text-[22px] font-semibold leading-snug text-ink">{row.title}</span>
                    <span className="mt-0.5 block font-mono text-[11px] text-ink-3">{row.nctId}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        {hidden > 0 ? (
          <button
            type="button"
            onClick={() => setShown((count) => Math.min(count + 10, entries.length))}
            className="mt-2 text-[13px] font-medium text-brand hover:text-ink"
          >
            {Math.min(10, hidden)} more
          </button>
        ) : null}
      </section>
      <TrialPane
        key={selected.nctId}
        patient={patient}
        detail={selected}
        headingRef={heading}
        loop={loop}
        live={live}
      />
    </div>
  );
}

const PAGE = 10;

function shownCount(entries: BoardEntry[], nctId: string): number {
  const index = entries.findIndex((row) => row.nctId === nctId);
  if (index < 0) return Math.min(PAGE, entries.length);
  return Math.min(entries.length, Math.ceil((index + 1) / PAGE) * PAGE);
}

function TrialPane({
  patient,
  detail,
  headingRef,
  loop,
  live,
}: {
  patient: Patient;
  detail: BoardDetail;
  headingRef: RefObject<HTMLHeadingElement | null>;
  loop: LoopState;
  live: boolean;
}) {
  const { trial, pair } = detail;
  const blocks = trialBlocks(patient, trial, pair);
  const sections = buildSections(trial.criteria, pair.cells);
  const leaves = listLeaves(trial.criteria);
  const unknownIds = pair.cells.filter((cell) => cell.verdict === "UNKNOWN").map((cell) => cell.criterionId);

  return (
    <section id="trial-detail" aria-label={trial.title} className="scroll-mt-6 space-y-6">
      <div>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-[28px] font-semibold leading-tight text-ink outline-none sm:text-[32px]"
        >
          {trial.title}
        </h2>
        <p className="mt-2 font-mono text-[13px] text-ink-3">
          {trial.nctId} · {trial.phase}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <section aria-label="Blocking" className="rounded-md border border-unknown-line bg-unknown-bg px-4 py-3">
          <h3 className="text-[18px] font-medium text-unknown">Blocking</h3>
          {blocks.length === 0 ? (
            <p className="mt-2 text-[15px] text-pass">Nothing open.</p>
          ) : (
            <ul className="mt-2 space-y-3">
              {blocks.map((block) => (
                <li key={`block-${block.criterionId}`}>
                  <p className="text-[15px] leading-snug text-ink">{block.blocking}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-ink-3">{block.criterionId}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label="To resolve" className="rounded-md border border-brand-line bg-brand-bg px-4 py-3">
          <h3 className="text-[18px] font-medium text-brand">To resolve</h3>
          {blocks.length === 0 ? (
            <p className="mt-2 text-[15px] text-ink-2">Nothing to order.</p>
          ) : (
            <ul className="mt-2 space-y-3">
              {blocks.map((block) => (
                <li key={`resolve-${block.criterionId}`}>
                  <p className="text-[15px] leading-snug text-ink">{block.resolve}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-ink-3">{block.criterionId}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <CriteriaTable
        sections={sections}
        initialOpen={unknownIds}
        patient={patient}
        leaves={leaves}
      />

      <DoctorActions
        patientId={patient.id}
        nctId={trial.nctId}
        order={detail.order}
        initial={loop}
        live={live}
      />

      <button
        type="button"
        onClick={() =>
          void downloadNotes(
            [
              {
                name: panelName(patient.id),
                code: patient.id,
                body: detail.documentBody,
                kicker: "Patient document",
              },
            ],
            `${patient.id}-document.pdf`,
          )
        }
        className="flex min-h-14 w-full items-center justify-center rounded-md bg-brand px-6 text-center text-[18px] font-medium text-on-brand"
      >
        Download patient document
      </button>
      <Link href={detail.documentHref} className="inline-block text-[13px] text-ink-2 hover:text-ink">
        Read it on screen
      </Link>
    </section>
  );
}
