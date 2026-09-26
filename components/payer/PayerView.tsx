import type { ChartNeed, ClaimsCoverage, PayerView as PayerModel, SettledExclusion } from "@/app/_data/schema";
import { CoverageChart } from "./CoverageChart";

function Settled({ rows }: { rows: SettledExclusion[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-[13px] text-ink-2">
        No claim in this extract answered an exclusion the fixture trials can fire — prior EGFR TKI
        fill or an ILD diagnosis code.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-line-2">
      {rows.map((row) => (
        <li key={`${row.patientId}:${row.nctId}:${row.criterionId}`} className="px-3 py-2.5 sm:px-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <span className="font-mono text-[12px] font-medium text-ink">{row.patientId}</span>
            <span className="font-mono text-[11px] uppercase tracking-wide text-fail">{row.kind}</span>
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-ink-3">
            {row.nctId} · {row.criterionId} · {row.predicate}
          </div>
          <blockquote className="mt-1.5 border-l-2 border-fail-line pl-3 text-[13px] leading-relaxed text-ink">
            “{row.claimLine}”
          </blockquote>
          {row.sourceDoc && <div className="mt-1 font-mono text-[11px] text-ink-3">{row.sourceDoc}</div>}
        </li>
      ))}
    </ul>
  );
}

function Needs({ rows }: { rows: ChartNeed[] }) {
  if (rows.length === 0) {
    return <p className="text-[13px] text-ink-2">Every remaining criterion settled — unexpected on claims alone.</p>;
  }
  return (
    <ul className="divide-y divide-line-2">
      {rows.map((row) => (
        <li key={`${row.predicate}:${row.analyte ?? ""}`} className="px-3 py-2.5 sm:px-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <span className="font-mono text-[12px] font-medium text-unknown">
              {row.analyte ?? row.predicate}
            </span>
            <span className="font-mono text-[11px] text-ink-3">
              {row.patientIds.length} beneficiary{row.patientIds.length === 1 ? "" : "s"}
            </span>
          </div>
          <p className="mt-0.5 text-[13px] text-ink">{row.need}</p>
          <p className="mt-0.5 text-[12px] text-ink-2">{row.why}</p>
          <div className="mt-1 font-mono text-[11px] text-ink-3">{row.criterionIds.join(" · ")}</div>
        </li>
      ))}
    </ul>
  );
}

export function PayerSplit({ view }: { view: PayerModel }) {
  return (
    <div className="space-y-3">
      {view.coverage ? (
        <CoverageChart coverage={view.coverage} />
      ) : (
        <p className="rounded-md border border-line bg-surface px-3 py-3 font-mono text-[12px] text-ink-3 sm:px-4">
          Coverage figure pending engine republish of data/compiled/coverage.json.
        </p>
      )}
      <header>
        <h1 className="text-[16px] font-medium text-ink">{view.headline}</h1>
        <p className="mt-1 text-[13px] text-ink">
          Claims settled {new Set(view.settled.map((row) => row.patientId)).size.toLocaleString("en-US")} of{" "}
          {view.beneficiaries.toLocaleString("en-US")}
        </p>
        <p className="mt-0.5 text-[12px] text-ink-2">
          {view.settled.length} eliminating claim line{view.settled.length === 1 ? "" : "s"} ·{" "}
          {view.needs.length} kinds of UNKNOWN a chart has to close.
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="overflow-hidden rounded-md border border-fail-line bg-surface">
          <h2 className="border-b border-fail-line bg-fail-bg px-3 py-2 text-[13px] font-medium text-fail sm:px-4">
            What claims settle
          </h2>
          <Settled rows={view.settled} />
        </section>
        <section className="overflow-hidden rounded-md border border-unknown-line bg-surface">
          <h2 className="border-b border-unknown-line bg-unknown-bg px-3 py-2 text-[13px] font-medium text-unknown sm:px-4">
            What claims cannot settle
          </h2>
          <Needs rows={view.needs} />
        </section>
      </div>

      <aside className="rounded-md border border-line bg-surface px-3 py-3 sm:px-4">
        <div className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-ink-3">
          Who is notified
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-ink">
          The plan notifies the member&apos;s own physician. Never the patient directly, never the
          sponsor. AMBER drafts the unknown list; the treating clinician decides whether to order
          anything.
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-2">
          No genetic or biomarker data is ever sent to a payer. GINA bars health insurers from using
          genetic information for underwriting or eligibility — we do not put it on the wire.
        </p>
      </aside>
    </div>
  );
}
