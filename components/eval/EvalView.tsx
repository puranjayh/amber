import type { EvalReport } from "@/app/_data/schema";
import { isHumanValidated } from "./labelSource";

const ORDER = ["PASS", "FAIL", "UNKNOWN"] as const;

function pct(n: number | null) {
  if (n === null) return "—";
  const p = n * 100;
  return Number.isInteger(p) ? `${p}%` : `${p.toFixed(1)}%`;
}

function humanLabel(expected: string, reason?: string) {
  return reason ? `${expected}/${reason}` : expected;
}

export function EvalView({
  report,
  forceDraft = false,
}: {
  report: EvalReport;
  forceDraft?: boolean;
}) {
  const human = !forceDraft && isHumanValidated(report.labelSource);
  return (
    <div className="space-y-3">
      <header>
        <h1 className="text-[24px] font-medium text-ink">
          {human ? "Human-labelled evaluation" : "Model-draft agreement"}
        </h1>
        <p className="mt-0.5 text-[13px] text-ink-2">
          {human
            ? "Confusion matrix of engine cells against hand labels. Human rows, engine columns."
            : "Not human-validated. Do not read these numbers as a grade of the engine."}
        </p>
      </header>

      <div
        className={`rounded-md border px-3 py-2.5 sm:px-4 ${
          human
            ? "border-line bg-surface text-ink"
            : "border-unknown-line bg-unknown-bg text-unknown"
        }`}
        role="status"
      >
        <div className="text-[11px] font-medium ">labelSource</div>
        <p className="mt-0.5 font-mono text-[15px] font-medium">
          {human ? "human" : "model-draft"}
        </p>
        <p className="mt-1 text-[13px] leading-relaxed">
          {human
            ? `${report.evaluatedCells} cells labelled by a person before the engine ran. 83.3% with a named failure mode — not a perfect score.`
            : "Model-draft — not human-validated. Never merge these cells with the human run."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
        {[
          ["evaluatedCells", String(report.evaluatedCells)],
          ["precision", pct(report.precision)],
          ["recall", pct(report.recall)],
          ["UNKNOWN agree", pct(report.unknownAgreement)],
        ].map(([label, value]) => (
          <div key={label} className="bg-surface px-3 py-2.5">
            <div className="font-mono text-[18px] font-medium leading-none text-ink">{value}</div>
            <div className="mt-1 font-mono text-[11px] text-ink-3">{label}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full min-w-[20rem] border-collapse text-[13px]">
          <caption className="sr-only">
            Confusion matrix, human labels as rows, engine as columns
          </caption>
          <thead>
            <tr className="border-b border-line bg-canvas text-[11px] text-ink-3">
              <th className="px-3 py-2 text-left font-medium">human \ engine</th>
              {ORDER.map((v) => (
                <th key={v} className="px-3 py-2 text-right font-medium">
                  {v}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ORDER.map((expected) => (
              <tr key={expected} className="border-b border-line-2 last:border-b-0">
                <th className="px-3 py-2 text-left font-mono font-medium text-ink">{expected}</th>
                {ORDER.map((actual) => {
                  const n = report.confusionMatrix[expected]?.[actual] ?? 0;
                  const agree = expected === actual;
                  return (
                    <td
                      key={actual}
                      className={`px-3 py-2 text-right font-mono ${agree ? "font-medium text-ink" : "text-ink-3"}`}
                    >
                      {n}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="overflow-hidden rounded-md border border-line bg-surface">
        <h2 className="border-b border-line px-3 py-2.5 text-[18px] font-medium text-ink sm:px-4">
          Disagreements
          <span className="ml-2 font-mono text-[11px] font-normal text-ink-3">
            {report.disagreements.length}
          </span>
        </h2>
        {report.disagreements.length === 0 ? (
          <p className="px-3 py-3 text-[13px] text-ink-2 sm:px-4">None on this label set.</p>
        ) : (
          <ol className="divide-y divide-line-2">
            {report.disagreements.map((d) => (
              <li
                key={`${d.patientId}:${d.nctId}:${d.criterionId}`}
                className="px-3 py-2.5 sm:px-4"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 font-mono text-[13px]">
                  <span className="font-medium text-ink">{d.patientId}</span>
                  <span className="text-ink-3">{d.nctId}</span>
                  <span className="text-ink">{d.criterionId}</span>
                </div>
                {d.trialTitle && <p className="mt-0.5 text-[13px] text-ink-2">{d.trialTitle}</p>}
                <p className="mt-0.5 text-[13px] text-ink">
                  human {humanLabel(d.expected, d.expectedReason)} · engine {d.actual}
                </p>
                <blockquote className="mt-1.5 border-l-2 border-line pl-3 text-[13px] leading-relaxed text-ink-2">
                  “{d.criterionCitation}”
                </blockquote>
                {d.chartCitation && (
                  <blockquote className="mt-1 border-l-2 border-ink-3 pl-3 text-[13px] leading-relaxed text-ink">
                    “{d.chartCitation}”
                  </blockquote>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {report.issues.length > 0 && (
        <p className="font-mono text-[11px] text-ink-3">
          {report.issues.length} label{report.issues.length === 1 ? "" : "s"} could not be scored
          (missing patient, trial, or criterion).
        </p>
      )}
    </div>
  );
}
