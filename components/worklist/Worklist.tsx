import { TIER_LABEL, type Patient, type Trial } from "@/src/contracts";
import type { WorklistRow, WorklistStrip } from "@/app/_data/schema";
import { trialPatientPath } from "@/components/hcp/access";
import { trialWords } from "@/components/hcp/clinic";
import { LabelledRows, type LabelledRow } from "@/components/roster/LabelledRows";
import {
  MEASURED_BENCH,
  formatBench,
  formatDollars,
  formatRealProtocols,
  type ScreenFailures,
} from "./strip";

export type WorklistAction = {
  label: string;
  disabled?: boolean;
  onClick: () => void;
};

export type WorklistItem = WorklistRow & {
  patient?: Patient;
  trial?: Trial;
  favourable: number;
  total: number;
  reason?: string;
  note?: string;
  /** Answered-cohort summary. Not a patient, so it is not a link. */
  inert?: boolean;
  action?: WorklistAction;
};

function Blocking({ row }: { row: WorklistItem }) {
  if (row.blocking.length === 0) {
    return <span className="text-[13px] text-pass">none — ready to refer</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {row.blocking.map((b) => {
        const unknown = b.verdict === "UNKNOWN";
        return (
          <span
            key={`${b.criterionId}:${b.reason}:${b.tier}`}
            title={`${b.criterionId}: ${b.verdict} (${b.reason}), tier ${b.tier}`}
            className={`rounded border px-1.5 py-px font-mono text-[11px] ${
              unknown
                ? "border-unknown-line bg-unknown-bg text-unknown"
                : "border-fail-line bg-fail-bg text-fail"
            }`}
          >
            {b.criterionId} {unknown ? b.reason : "eliminates"}
          </span>
        );
      })}
    </span>
  );
}

export function WorklistHeader({
  strip,
  failures,
  realProtocols = 0,
}: {
  strip: WorklistStrip;
  failures: ScreenFailures;
  realProtocols?: number;
}) {
  const items = [
    {
      value: strip.pairsEvaluated,
      label: "pairs evaluated",
      title: "evaluate(patient, trial) for every patient × trial",
      tone: "text-ink",
    },
    {
      value: strip.eligibleNow,
      label: "eligible now",
      title: "Not eliminated, and no criterion is UNKNOWN",
      tone: "text-pass",
    },
    {
      value: strip.oneTier0Away,
      label: "one Tier-0 away",
      title:
        "Not eliminated; the only remaining unknown is a single existing-specimen (tier 0) test",
      tone: strip.oneTier0Away > 0 ? "text-unknown" : "text-ink",
    },
  ] as const;

  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <dl className="grid grid-cols-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="border-l border-line-2 px-3 py-2.5 first:border-l-0 sm:px-4"
            title={item.title}
          >
            <dt className="text-[11px] leading-tight text-ink-3">{item.label}</dt>
            <dd className={`mt-0.5 font-mono text-[24px] leading-none ${item.tone}`}>
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
      {realProtocols > 0 && (
        <p className="border-t border-line-2 px-4 py-3 text-[13px] leading-[1.55] text-ink sm:px-4">
          {formatRealProtocols(realProtocols)}
        </p>
      )}
      <p
        className="border-t border-line-2 px-4 py-3 text-[13px] leading-[1.55] text-ink-2"
        title="Industry oncology screen-fail rate 62% × $2,000. AMBER only eliminates on a matching fact — absence stays UNKNOWN."
      >
        {failures.patientsScreened} screened · {failures.expectedFailures} expected failures at 62%
        · <span className="text-pass">{failures.failuresAvoided} avoided</span>
        {" · "}
        <span className="font-medium text-ink">{formatDollars(failures.dollarsAvoided)}</span>
      </p>
      <p
        className="border-t border-line-2 px-4 py-3 text-[13px] leading-[1.55] text-ink-2"
        title="Full cube, every cell emitted. 4,000 patients × 233 compiled trials."
      >
        {formatBench(MEASURED_BENCH)}
      </p>
    </div>
  );
}

export function Worklist({
  rows,
  onSelect,
  selectedId,
  advanceTo,
  demo = false,
  trial,
}: {
  rows: WorklistItem[];
  onSelect?: (row: WorklistItem) => void;
  selectedId?: string;
  /** When set, rows are buttons that ask DemoShell to reveal this beat. */
  advanceTo?: number;
  /** Static demo keeps the coordinator on the trial portal without the live loop. */
  demo?: boolean;
  trial?: string;
}) {
  const rowsOut: LabelledRow[] = rows.map((row, index) => ({
    key: row.patientId,
    rank: index + 1,
    patient: (
      <span>
        <span className="font-mono text-[15px]" title={row.patientId}>
          {row.patientId.length > 16 ? `${row.patientId.slice(0, 14)}…` : row.patientId}
        </span>
        {row.patient && (
          <span className="mt-0.5 block text-[13px] text-ink-3">
            {row.patient.age} {row.patient.sex}
            {row.patient.race ? ` · ${row.patient.race}` : ""}
          </span>
        )}
      </span>
    ),
    trial: (
      <span className="block min-w-0">
        <span className="block">{trialWords(row.nctId, row.trial?.title)}</span>
        <span className="font-mono text-[11px] text-ink-3">{row.nctId}</span>
        {row.eliminated && <span className="text-[13px] text-fail">Eliminated</span>}
      </span>
    ),
    met: row.favourable,
    total: row.total,
    blocking: <Blocking row={row} />,
    tier:
      row.resolutionTier === null ? (
        "—"
      ) : (
        <span>
          <span className="font-mono">T{row.resolutionTier}</span> {TIER_LABEL[row.resolutionTier]}
        </span>
      ),
    href:
      advanceTo !== undefined || onSelect || row.inert
        ? undefined
        : trialPatientPath(row.patientId, { trialId: trial, demo: demo ? "static" : null }),
    onClick: onSelect ? () => onSelect(row) : undefined,
    advanceTo,
    selected: selectedId === row.patientId,
  }));

  return (
    <div className="space-y-0">
      <LabelledRows label="Worklist" rows={rowsOut} />
      {rows.some((row) => row.reason || row.note || row.action) && (
        <ul className="mt-2 space-y-1">
          {rows.map((row) =>
            row.reason || row.note || row.action ? (
              <li
                key={row.patientId}
                className="flex flex-wrap items-center justify-between gap-2 px-1"
              >
                <div className="min-w-0 space-y-1">
                  {row.reason && <p className="text-[13px] text-ink-2">{row.reason}</p>}
                  {row.note && <p className="text-[13px] text-ink">{row.note}</p>}
                </div>
                {row.action && (
                  <button
                    type="button"
                    disabled={row.action.disabled}
                    onClick={row.action.onClick}
                    className="shrink-0 rounded-md bg-ink px-2.5 py-1 text-[13px] font-medium text-surface hover:bg-ink-2 disabled:opacity-40"
                  >
                    {row.action.label}
                  </button>
                )}
              </li>
            ) : null,
          )}
        </ul>
      )}
    </div>
  );
}
