"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { TIER_LABEL } from "@/src/contracts";
import type { LoopState } from "@/app/_data/schema";
import { pairTravel, prefsByPatient, rank } from "@/components/loop/rank";
import { postNote, postNudge, useLoop } from "@/components/loop/useLoop";
import type { PatientPhysician } from "./attribution";
import { splitForNudge } from "./group";
import { READY, READY_LABEL, spread, trialReady, type Ready } from "./readiness";
import type { WorklistItem } from "./Worklist";

const BAR: Record<Ready, string> = {
  eligible: "bg-pass",
  one: "bg-unknown",
  several: "bg-ink-3",
  eliminated: "bg-fail",
};

function ReadyBar({ counts, total }: { counts: Record<Ready, number>; total: number }) {
  return (
    <div className="flex h-2 overflow-hidden rounded-sm bg-line-2" aria-hidden>
      {READY.map((key) => {
        const n = counts[key];
        if (!n || total === 0) return null;
        return <span key={key} className={BAR[key]} style={{ width: `${(n / total) * 100}%` }} />;
      })}
    </div>
  );
}

export function Physicians({
  rows,
  attributions,
  initial,
  live,
}: {
  rows: WorklistItem[];
  attributions: PatientPhysician[];
  initial: LoopState | null;
  live: boolean;
}) {
  const { state, apply } = useLoop(initial ?? { backend: "file", preferences: [], nudges: [], notes: [] }, live);
  const prefs = prefsByPatient(state.preferences);
  const ranked = useMemo(
    () => rank(rows, prefs, (row) => pairTravel(row.patient, row.trial)),
    [rows, prefs],
  );
  const place = new Map(ranked.map((row, i) => [row.patientId, i]));
  const byId = new Map(attributions.map((a) => [a.patientId, a]));
  const physicians = [...new Map(attributions.map((a) => [a.physicianId, a])).values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const [open, setOpen] = useState<string | null>(physicians[0]?.physicianId ?? null);
  const [checked, setChecked] = useState<Record<string, string[]>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  return (
    <ol className="space-y-2">
      {physicians.map((doc) => {
        const mine = ranked.filter((row) => byId.get(row.patientId)?.physicianId === doc.physicianId);
        const counts = spread(mine);
        const ready = mine.filter(trialReady).length;
        const observed = mine.filter((row) => byId.get(row.patientId)?.source === "observed").length;
        const assigned = mine.length - observed;
        const selected = checked[doc.physicianId] ?? [];
        const allOn = mine.length > 0 && mine.every((row) => selected.includes(row.patientId));
        const { missing, reachable } = splitForNudge(selected, prefs);
        const note = state.notes.find((n) => n.physicianId === doc.physicianId)?.text ?? "";
        const draft = drafts[doc.physicianId] ?? note;
        const expanded = open === doc.physicianId;
        const asked = state.nudges.some(
          (n) => n.kind === "fill_preferences" && missing.includes(n.patientId) && n.status !== "done",
        );
        const nudged = reachable.length > 0 && reachable.every((id) =>
          state.nudges.some((n) => n.kind === "enrol_patient" && n.patientId === id && n.status !== "done"),
        );

        return (
          <li key={doc.physicianId} className="overflow-hidden rounded-md border border-line bg-surface">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : doc.physicianId)}
              className="flex w-full flex-col gap-2 px-3 py-3 text-left sm:px-4"
            >
              <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-[14px] font-medium text-ink">{doc.name}</span>
                <span className="font-mono text-[11px] text-ink-3">{doc.site}</span>
              </span>
              <span className="text-[12px] text-ink-2">
                {mine.length} on panel · {ready} trial-ready
                {assigned > 0 && (
                  <span className="text-ink-3">
                    {" "}
                    · {assigned} assigned{observed > 0 ? `, ${observed} observed` : ""}
                  </span>
                )}
                {assigned === 0 && observed > 0 && <span className="text-ink-3"> · observed</span>}
              </span>
              <ReadyBar counts={counts} total={mine.length} />
              <span className="flex flex-wrap gap-x-3 font-mono text-[10px] text-ink-3">
                {READY.map((key) => (
                  <span key={key}>
                    {counts[key]} {READY_LABEL[key]}
                  </span>
                ))}
              </span>
            </button>

            {expanded && (
              <div className="space-y-3 border-t border-line-2 px-3 py-3 sm:px-4">
                <label className="block">
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">Coordinator note</span>
                  <textarea
                    value={draft}
                    rows={2}
                    placeholder="prefers email, out Thursdays"
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [doc.physicianId]: e.target.value }))}
                    disabled={!live}
                    className="mt-1 w-full rounded-md border border-line bg-canvas px-2 py-1.5 text-[13px] text-ink disabled:opacity-60"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {live && draft !== note && (
                    <button
                      type="button"
                      onClick={() => void postNote(doc.physicianId, draft).then(apply)}
                      className="rounded-md border border-line px-2.5 py-1 text-[12px] text-ink hover:bg-canvas"
                    >
                      Save note
                    </button>
                  )}
                  <Link
                    href={`/hcp?physician=${encodeURIComponent(doc.physicianId)}`}
                    className="text-[12px] text-ink underline-offset-2 hover:underline"
                  >
                    Open {doc.talk}&apos;s portal
                  </Link>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 text-[12px] text-ink">
                    <input
                      type="checkbox"
                      checked={allOn}
                      onChange={() =>
                        setChecked((prev) => ({
                          ...prev,
                          [doc.physicianId]: allOn ? [] : mine.map((row) => row.patientId),
                        }))
                      }
                    />
                    Select all
                  </label>
                  {live && missing.length > 0 && (
                    <button
                      type="button"
                      disabled={asked}
                      onClick={() => {
                        void postNudge({
                          kind: "fill_preferences",
                          fromRole: "coordinator",
                          toRole: "patient",
                          patients: missing.map((patientId) => {
                            const row = mine.find((r) => r.patientId === patientId);
                            return { patientId, nctId: row?.nctId };
                          }),
                        }).then(apply);
                      }}
                      className="rounded-md bg-ink px-2.5 py-1 text-[12px] font-medium text-surface hover:bg-ink-2 disabled:opacity-40"
                    >
                      {asked ? "Asked — waiting" : `Ask patient for preferences (${missing.length})`}
                    </button>
                  )}
                  {live && reachable.length > 0 && (
                    <button
                      type="button"
                      disabled={nudged}
                      onClick={() => {
                        void postNudge({
                          kind: "enrol_patient",
                          fromRole: "coordinator",
                          toRole: "physician",
                          patients: reachable.map((patientId) => {
                            const row = mine.find((r) => r.patientId === patientId);
                            return { patientId, nctId: row?.nctId };
                          }),
                        }).then(apply);
                      }}
                      className="rounded-md bg-ink px-2.5 py-1 text-[12px] font-medium text-surface hover:bg-ink-2 disabled:opacity-40"
                    >
                      {nudged ? "Physician nudged" : `Nudge this physician (${reachable.length})`}
                    </button>
                  )}
                  {live && selected.length > 0 && missing.length === selected.length && (
                    <span className="text-[11px] text-ink-3">Preferences unknown — do not ping the doctor yet.</span>
                  )}
                </div>

                <ol className="divide-y divide-line-2 rounded-md border border-line-2">
                  {mine.map((row) => {
                    const on = selected.includes(row.patientId);
                    const attr = byId.get(row.patientId);
                    const block = row.blocking[0];
                    return (
                      <li key={row.patientId} className="flex items-start gap-2 px-2 py-2">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={on}
                          aria-label={`Select ${row.patientId}`}
                          onChange={() =>
                            setChecked((prev) => {
                              const cur = prev[doc.physicianId] ?? [];
                              const next = on ? cur.filter((id) => id !== row.patientId) : [...cur, row.patientId];
                              return { ...prev, [doc.physicianId]: next };
                            })
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-[12px] text-ink">
                            #{(place.get(row.patientId) ?? 0) + 1}{" "}
                            {row.patientId.length > 18 ? `${row.patientId.slice(0, 16)}…` : row.patientId}
                            <span className="text-ink-3">
                              {" "}
                              · {row.favourable}/{row.total} · {row.unknownCount}?
                            </span>
                          </p>
                          <p className="text-[11px] text-ink-2">
                            {block
                              ? `${block.criterionId} ${block.verdict === "UNKNOWN" ? block.reason : "eliminates"}`
                              : "none — ready to refer"}
                            {row.resolutionTier !== null && (
                              <span>
                                {" "}
                                · T{row.resolutionTier} {TIER_LABEL[row.resolutionTier]}
                              </span>
                            )}
                            {attr?.source === "assigned" && <span className="text-ink-3"> · assigned</span>}
                            {attr?.source === "observed" && <span className="text-ink-3"> · observed</span>}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
