"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { HcpPanel, HcpPatientRow, HcpPhysician, HcpTrialRow, PortalAnswers } from "@/app/_data/schema";
import { MissingData } from "@/components/console/MissingData";
import { readPortalStore, type PortalStore } from "./portal";
import { portalAnswered, rankPatientsForPhysician, trialFits } from "./worth";

function physicianKey(physician: HcpPhysician): string {
  return `${physician.id}:${physician.patients.map((p) => p.patientId).join(",")}`;
}

function shortId(id: string): string {
  return id.length > 18 ? `${id.slice(0, 16)}…` : id;
}

function travelLabel(minutes: number | null): string {
  return minutes === null ? "travel unknown" : `${minutes} min`;
}

function PortalChip({ row }: { row: HcpPatientRow }) {
  if (!portalAnswered(row.portal)) {
    return <span className="font-mono text-[10px] text-ink-3">portal unanswered</span>;
  }
  const bits = [
    row.portal.maxTravelMinutes !== undefined ? `${row.portal.maxTravelMinutes} min` : null,
    row.portal.maxExtraVisitsPerMonth !== undefined ? `${row.portal.maxExtraVisitsPerMonth} visits` : null,
    row.portal.acceptsPlacebo === false ? "no placebo" : row.portal.acceptsPlacebo === true ? "placebo ok" : null,
    row.portal.driver === "none" ? "no ride" : row.portal.driver ? row.portal.driver : null,
  ].filter(Boolean);
  return (
    <span className="font-mono text-[10px] text-ink-2" title="Patient portal — not medical facts">
      portal · {bits.join(" · ")}
    </span>
  );
}

function TrialCard({
  trial,
  answers,
  patientId,
}: {
  trial: HcpTrialRow;
  answers: PortalAnswers;
  patientId: string;
}) {
  const fit = trialFits(trial, answers);
  return (
    <article
      className={`rounded-md border px-3 py-2.5 ${fit.ok ? "border-line bg-surface" : "border-line-2 bg-canvas"}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <span className="font-mono text-[12px] font-medium text-ink">{trial.nctId}</span>
        <span className="font-mono text-[11px] text-ink-3">{trial.phase || "phase —"}</span>
      </div>
      <p className="mt-0.5 text-[12px] leading-snug text-ink-2">{trial.title}</p>
      <p className="mt-1.5 font-mono text-[11px] text-ink">
        worth {trial.worth.toFixed(3)} · {trial.unknownCount}? · tier cost {trial.resolutionCost} ·{" "}
        {travelLabel(trial.travelMinutes)} · {trial.visitBurden}/mo visits
      </p>
      {!fit.ok && (
        <p className="mt-1 text-[11px] text-ink-3">Patient said this does not fit: {fit.reasons.join(", ")}.</p>
      )}
      <Link
        href={`/patient?patient=${encodeURIComponent(patientId)}&trial=${trial.nctId}`}
        className="mt-1.5 inline-block font-mono text-[11px] text-ink-2 underline-offset-2 hover:text-ink hover:underline"
      >
        Criteria →
      </Link>
    </article>
  );
}

function PatientTrials({ patient, physicianId }: { patient: HcpPatientRow; physicianId: string }) {
  return (
    <section aria-labelledby="hcp-patient-title" className="space-y-2">
      <div>
        <h2 id="hcp-patient-title" className="font-mono text-[14px] font-medium text-ink">
          {patient.patientId}
        </h2>
        <p className="mt-0.5 text-[12px] text-ink-2">
          {patient.liveTrials} live {patient.liveTrials === 1 ? "trial" : "trials"} · rank() best {patient.bestNctId}
          {patient.unknownCount > 0 ? ` · ${patient.unknownCount} unknown` : " · no open questions"}
        </p>
        <div className="mt-1">
          <PortalChip row={patient} />
        </div>
      </div>
      {patient.trials.length === 0 ? (
        <MissingData
          file="app/_data/hcp.json"
          detail={`${patient.patientId} has no live trial after rank(). Every protocol eliminated them.`}
        />
      ) : (
        <ol className="space-y-2">
          {patient.trials.map((trial) => (
            <li key={trial.nctId}>
              <TrialCard trial={trial} answers={patient.portal} patientId={patient.patientId} />
            </li>
          ))}
        </ol>
      )}
      <Link
        href={`/patient-portal?patient=${encodeURIComponent(patient.patientId)}&from=${physicianId}`}
        className="inline-block font-mono text-[12px] text-ink-2 underline-offset-2 hover:text-ink hover:underline"
      >
        What only they know →
      </Link>
    </section>
  );
}

export function HcpView({ panel }: { panel: HcpPanel }) {
  const physicians = panel.physicians.filter((p) => p.patients.length > 0);
  const fallback =
    physicians.find((p) => p.id === panel.defaultPhysicianId) ?? physicians[0] ?? panel.physicians[0];
  const [store, setStore] = useState<PortalStore>({});
  const [held, setHeld] = useState(() => ({
    key: fallback ? physicianKey(fallback) : "",
    physicianId: fallback?.id ?? panel.defaultPhysicianId,
    patientId: fallback?.patients[0]?.patientId ?? "",
  }));

  useEffect(() => {
    const refresh = () => setStore(readPortalStore());
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const physician = physicians.find((p) => p.id === held.physicianId) ?? fallback;
  useEffect(() => {
    if (!physician) return;
    const key = physicianKey(physician);
    if (held.key === key && physician.patients.some((p) => p.patientId === held.patientId)) return;
    setHeld({
      key,
      physicianId: physician.id,
      patientId: physician.patients.some((p) => p.patientId === held.patientId)
        ? held.patientId
        : (physician.patients[0]?.patientId ?? ""),
    });
  }, [physician, held.key, held.patientId]);

  const ranked = useMemo(
    () => (physician ? rankPatientsForPhysician(physician.patients, store) : []),
    [physician, store],
  );
  const shown = ranked.filter(
    (row, i) => i < 20 || /^PT-\d+$/.test(row.patientId) || row.patientId === held.patientId,
  );
  const selected = ranked.find((p) => p.patientId === held.patientId) ?? ranked[0];

  if (!physician || ranked.length === 0) {
    return <MissingData file="app/_data/hcp.json" detail="No patients assigned to a treating physician." />;
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-3">
          {panel.channel} · your panel
        </p>
        <h1 className="mt-0.5 text-[16px] font-medium text-ink">My patients</h1>
        <p className="mt-0.5 text-[12px] text-ink-2">
          Ranked by how close they are to enrolling in something — fewest unknowns, then expected
          value, then travel. Click a row for trials ranked by worth-it-ness: significance versus
          what it costs them. This channel never contacts a patient.
        </p>
      </div>

      <label className="block">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-ink-3">
          Treating physician
        </span>
        <select
          aria-label="Treating physician"
          value={physician.id}
          onChange={(e) => {
            const next = physicians.find((p) => p.id === e.target.value) ?? physician;
            setHeld({
              key: physicianKey(next),
              physicianId: next.id,
              patientId: next.patients[0]?.patientId ?? "",
            });
          }}
          className="mt-1 w-full max-w-md rounded-md border border-line bg-surface px-2 py-1.5 text-[12px] text-ink"
        >
          {physicians.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.site} · {p.patients.length}
            </option>
          ))}
        </select>
      </label>
      {ranked.length > shown.length && (
        <p className="font-mono text-[11px] text-ink-3">
          {ranked.length} on this panel · closest 20 plus the hand-built cases
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <ol className="max-h-[50vh] overflow-y-auto overflow-x-hidden rounded-md border border-line bg-surface lg:max-h-[70vh]">
          {shown.map((row) => {
            const i = ranked.indexOf(row);
            const current = selected?.patientId === row.patientId;
            return (
              <li key={row.patientId} className="border-b border-line-2 last:border-b-0">
                <button
                  type="button"
                  aria-current={current ? "true" : undefined}
                  onClick={() => setHeld({ ...held, patientId: row.patientId })}
                  className={`block w-full px-3 py-2.5 text-left hover:bg-canvas ${current ? "bg-canvas" : ""}`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-[13px] font-medium text-ink">
                      <span className="mr-1.5 text-ink-3">{i + 1}.</span>
                      {shortId(row.patientId)}
                    </span>
                    <span className="font-mono text-[11px] text-ink-3">{row.unknownCount}?</span>
                  </span>
                  <span className="mt-0.5 block font-mono text-[11px] text-ink-2">
                    {row.bestNctId} · {row.liveTrials} live
                  </span>
                  <PortalChip row={row} />
                </button>
              </li>
            );
          })}
        </ol>
        {selected ? (
          <PatientTrials patient={selected} physicianId={physician.id} />
        ) : (
          <MissingData file="app/_data/hcp.json" detail="Select a patient." />
        )}
      </div>
    </div>
  );
}
