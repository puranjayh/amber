"use client";

import { useState } from "react";

type Step = {
  criterionId: string;
  title: string;
  detail: string;
  tierLabel: string;
  criterionCitation: string;
  claimCitation: string | null;
  reason: string;
};

type TrialFit = {
  nctId: string;
  title: string;
  phase: string;
  condition: string;
  status: "ready" | "needs_tests" | "ruled_out";
  eliminated: boolean;
  unknownCount: number;
  passCount: number;
  failCount: number;
  expectedValue: number;
  steps: Step[];
  ruledOutBy: { criterionCitation: string; claimCitation: string | null } | null;
};

type ClaimLine = {
  kind: string;
  code: string;
  label: string;
  date: string;
  doc: string;
  lung: boolean;
  knownDrug?: string | null;
};

export type ClinicRow = {
  patientId: string;
  time: string;
  timeNote: string;
  age: number;
  sex: string;
  race: string;
  lungCancerClaim: boolean;
  claimLines: ClaimLine[];
  fits: TrialFit[];
};

export type ClinicData = {
  asOf: string;
  source: { name: string; sample: string; url: string; note: string };
  doctor: { npi: string; serviceDate: string; pickedBecause: string };
  blast: { nctId: string; text: string };
  trials: { nctId: string; title: string; phase: string; condition: string }[];
  top: string[];
  ranked: string[];
  rows: ClinicRow[];
};

const STATUS = {
  ready: { label: "Ready to contact", className: "bg-pass-bg text-pass" },
  needs_tests: { label: "Tests still open", className: "bg-unknown-bg text-unknown" },
  ruled_out: { label: "Ruled out", className: "bg-fail-bg text-fail" },
} as const;

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;
}

function fitOf(row: ClinicRow, nctId: string): TrialFit {
  const found = row.fits.find((f) => f.nctId === nctId);
  if (!found) throw new Error(`missing fit ${row.patientId} ${nctId}`);
  return found;
}

export function ClinicDay({ clinic }: { clinic: ClinicData }) {
  const [nctId, setNctId] = useState(clinic.blast.nctId);
  const [openId, setOpenId] = useState<string | null>(clinic.top[0] ?? null);
  const [acted, setActed] = useState<Record<string, "ordered" | "sent">>({});

  const trial = clinic.trials.find((t) => t.nctId === nctId) ?? clinic.trials[0];
  const ranked = [...clinic.rows].sort((a, b) => compareRows(a, b, nctId));
  const top = ranked.filter((row) => fitOf(row, nctId).status !== "ruled_out").slice(0, 3);
  const counts = { ready: 0, needs: 0, out: 0 };
  for (const row of clinic.rows) {
    const status = fitOf(row, nctId).status;
    if (status === "ready") counts.ready += 1;
    else if (status === "needs_tests") counts.needs += 1;
    else counts.out += 1;
  }

  return (
    <div className="min-h-full bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl flex-wrap items-baseline justify-between gap-2 px-4 py-3">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[14px] font-medium tracking-[0.18em] text-ink">AMBER</span>
            <span className="text-[12px] text-ink-3">Today</span>
          </div>
          <div className="font-mono text-[11px] text-ink-3">
            NPI {clinic.doctor.npi} · {clinic.asOf}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4">
        <section className="rounded-lg border border-line bg-surface px-4 py-3">
          <div className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-3">
            Opened from an Impiricus message
          </div>
          <p className="mt-1 text-[15px] font-medium leading-snug text-ink">{clinic.blast.text}</p>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
            Impiricus already loaded the claims for the {clinic.rows.length} patients billed under this NPI
            on {clinic.asOf}. The protocol on this link is {trial.nctId}.
          </p>
        </section>

        <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label="Trials">
          {clinic.trials.map((item) => {
            const current = item.nctId === nctId;
            return (
              <button
                key={item.nctId}
                type="button"
                role="tab"
                aria-selected={current}
                onClick={() => {
                  setNctId(item.nctId);
                  setOpenId(null);
                }}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-left text-[12px] ${
                  current ? "border-ink bg-ink text-surface" : "border-line bg-surface text-ink-2"
                }`}
              >
                <span className="font-mono">{item.nctId}</span>
              </button>
            );
          })}
        </div>

        <div>
          <h1 className="text-[16px] font-medium text-ink">{trial.title}</h1>
          <p className="mt-0.5 text-[12px] text-ink-2">
            {trial.phase} · {trial.condition}
          </p>
        </div>

        <dl className="grid grid-cols-3 gap-2">
          <Count label="Ready to contact" value={counts.ready} />
          <Count label="Need a test" value={counts.needs} />
          <Count label="Ruled out" value={counts.out} />
        </dl>

        <section className="space-y-2">
          <h2 className="text-[13px] font-medium text-ink">
            Start with these {top.length}
            <span className="ml-2 font-normal text-ink-3">of {clinic.rows.length} on the day</span>
          </h2>
          {top.map((row, index) => (
            <PatientCard
              key={row.patientId}
              row={row}
              nctId={nctId}
              rank={index + 1}
              open={openId === row.patientId}
              onToggle={() => setOpenId(openId === row.patientId ? null : row.patientId)}
              acted={acted[`${row.patientId}:${nctId}`]}
              onAct={(kind) => setActed((prev) => ({ ...prev, [`${row.patientId}:${nctId}`]: kind }))}
              prominent
            />
          ))}
        </section>

        <section className="space-y-2">
          <h2 className="text-[13px] font-medium text-ink">The rest of the day</h2>
          <p className="text-[12px] text-ink-2">
            Times are the order of claims on this date. The file has a service date and no clock time.
          </p>
          {clinic.rows
            .filter((row) => !top.some((t) => t.patientId === row.patientId))
            .map((row) => (
              <PatientCard
                key={row.patientId}
                row={row}
                nctId={nctId}
                open={openId === row.patientId}
                onToggle={() => setOpenId(openId === row.patientId ? null : row.patientId)}
                acted={acted[`${row.patientId}:${nctId}`]}
                onAct={(kind) => setActed((prev) => ({ ...prev, [`${row.patientId}:${nctId}`]: kind }))}
              />
            ))}
        </section>

        <footer className="pb-6 text-[11px] leading-relaxed text-ink-3">
          {clinic.source.name}, {clinic.source.sample}. {clinic.source.note}{" "}
          {clinic.doctor.pickedBecause}{" "}
          <a className="underline" href={clinic.source.url}>
            CMS source
          </a>
          . <a className="underline" href="/worklist">Coordinator console</a>
          . Verdicts are <span className="font-mono">evaluate()</span> on these claim lines. A missing
          result stays unknown.
        </footer>
      </main>
    </div>
  );
}

function compareRows(a: ClinicRow, b: ClinicRow, trialId: string): number {
  const fa = fitOf(a, trialId);
  const fb = fitOf(b, trialId);
  const ruled = Number(fa.status === "ruled_out") - Number(fb.status === "ruled_out");
  if (ruled !== 0) return ruled;
  const lung = Number(b.lungCancerClaim) - Number(a.lungCancerClaim);
  if (lung !== 0) return lung;
  return (
    fa.unknownCount - fb.unknownCount ||
    fb.expectedValue - fa.expectedValue ||
    a.patientId.localeCompare(b.patientId)
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2">
      <dt className="text-[11px] text-ink-3">{label}</dt>
      <dd className="font-mono text-[18px] text-ink">{value}</dd>
    </div>
  );
}

function PatientCard({
  row,
  nctId,
  rank,
  open,
  onToggle,
  acted,
  onAct,
  prominent = false,
}: {
  row: ClinicRow;
  nctId: string;
  rank?: number;
  open: boolean;
  onToggle: () => void;
  acted?: "ordered" | "sent";
  onAct: (kind: "ordered" | "sent") => void;
  prominent?: boolean;
}) {
  const fit = fitOf(row, nctId);
  const status = STATUS[fit.status];
  const others = row.fits.filter((item) => item.nctId !== nctId);

  return (
    <article className={`rounded-lg border bg-surface ${prominent ? "border-ink" : "border-line"}`}>
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-3 px-3 py-3 text-left" aria-expanded={open}>
        <div className="w-12 shrink-0 font-mono text-[12px] text-ink-2">
          {rank ? <div className="text-ink">{rank}</div> : null}
          <div>{row.time}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-[13px] text-ink" title={row.patientId}>
              {shortId(row.patientId)}
            </span>
            <span className="text-[12px] text-ink-2">
              {row.age}
              {row.sex} · {row.race}
            </span>
          </div>
          <p className="mt-0.5 text-[13px] leading-snug text-ink">{summary(row, fit)}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${status.className}`}>{status.label}</span>
            {row.lungCancerClaim && (
              <span className="rounded bg-line-2 px-1.5 py-0.5 text-[11px] text-ink-2">Lung-cancer claim</span>
            )}
          </div>
        </div>
      </button>

      {open && (
        <div className="space-y-3 border-t border-line-2 px-3 py-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">What the claim says</div>
            <ul className="mt-1 space-y-1">
              {row.claimLines.length === 0 && <li className="text-[13px] text-ink-2">No diagnosis or dispense line retained for this visit.</li>}
              {row.claimLines.map((line) => (
                <li key={`${line.kind}:${line.code}:${line.date}`} className="text-[13px] leading-snug text-ink">
                  <span className="font-mono text-[11px] text-ink-3">{line.date}</span>{" "}
                  {line.kind === "diagnosis" ? `ICD-9 ${line.code}` : line.code} — {line.label}
                </li>
              ))}
            </ul>
          </div>

          {fit.status === "ruled_out" && fit.ruledOutBy && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">Why there is no message</div>
              <p className="mt-1 text-[13px] text-ink">{fit.ruledOutBy.criterionCitation}</p>
              {fit.ruledOutBy.claimCitation && (
                <p className="mt-1 text-[13px] text-ink-2">{fit.ruledOutBy.claimCitation}</p>
              )}
            </div>
          )}

          {fit.steps.length > 0 && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">Still open</div>
              <ul className="mt-1 space-y-2">
                {groupOrders(fit.steps).map((group) => (
                  <li key={group.title}>
                    <div className="text-[13px] font-medium text-ink">{group.title}</div>
                    <p className="text-[12px] leading-relaxed text-ink-2">{group.detail}</p>
                    {group.citations.map((citation) => (
                      <p key={citation} className="mt-0.5 text-[12px] text-ink-3">
                        Trial: {citation}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Action fit={fit} row={row} acted={acted} onAct={onAct} />

          <p className="text-[11px] text-ink-3">
            Also checked:{" "}
            {others
              .map((item) => `${item.nctId} ${STATUS[item.status].label.toLowerCase()}`)
              .join(" · ")}
          </p>
        </div>
      )}
    </article>
  );
}

function groupOrders(steps: Step[]): { title: string; detail: string; citations: string[] }[] {
  const groups: { title: string; detail: string; citations: string[] }[] = [];
  for (const step of steps) {
    const existing = groups.find((group) => group.title === step.title);
    if (existing) {
      if (!existing.citations.includes(step.criterionCitation)) existing.citations.push(step.criterionCitation);
      continue;
    }
    groups.push({ title: step.title, detail: step.detail, citations: [step.criterionCitation] });
  }
  const clarify = (title: string) => title.startsWith("Clarify");
  return groups.sort((a, b) => Number(clarify(a.title)) - Number(clarify(b.title)));
}

function summary(row: ClinicRow, fit: TrialFit): string {
  if (fit.status === "ready") return "Claims clear every criterion. The next step is a call, not a test.";
  if (fit.status === "ruled_out") return "A claim already rules this trial out. No outreach.";
  if (!row.lungCancerClaim) {
    return "No lung-cancer code on file. Diagnosis is unknown, not a no, and this patient ranks below those who have the code.";
  }
  const orders = groupOrders(fit.steps);
  const lead = orders.find((order) => !order.title.startsWith("Clarify")) ?? orders[0];
  return lead ? `${orders.length} open. First: ${lead.title}.` : "Claims leave this open.";
}

function Action({
  fit,
  row,
  acted,
  onAct,
}: {
  fit: TrialFit;
  row: ClinicRow;
  acted?: "ordered" | "sent";
  onAct: (kind: "ordered" | "sent") => void;
}) {
  if (fit.status === "ruled_out") return null;

  if (fit.status === "ready") {
    return (
      <div>
        {acted === "sent" ? (
          <Draft row={row} fit={fit} />
        ) : (
          <button
            type="button"
            onClick={() => onAct("sent")}
            className="rounded-md bg-ink px-3 py-2 text-[13px] font-medium text-surface"
          >
            Draft the note to the site
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      {acted === "ordered" ? (
        <p className="text-[13px] text-ink">
          Marked for this visit. Do not tell {shortId(row.patientId)} they qualify. The claim has not confirmed it.
        </p>
      ) : (
        <button
          type="button"
          onClick={() => onAct("ordered")}
          className="rounded-md bg-ink px-3 py-2 text-[13px] font-medium text-surface"
        >
            Add {groupOrders(fit.steps).length === 1 ? "this order" : "these orders"} to the visit
        </button>
      )}
    </div>
  );
}

function Draft({ row, fit }: { row: ClinicRow; fit: TrialFit }) {
  return (
    <div className="rounded-md border border-line bg-canvas px-3 py-2 text-[13px] leading-relaxed text-ink">
      <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">Note to the site</div>
      <p className="mt-1">
        {shortId(row.patientId)}, age {row.age}, clears {fit.nctId} on the claims Impiricus holds. Please contact
        the office about referral. A person still decides enrollment.
      </p>
    </div>
  );
}
