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
      skin: "border-brand-line bg-brand-bg text-brand",
    },
    {
      value: strip.eligibleNow,
      label: "eligible now",
      title: "Not eliminated, and no criterion is UNKNOWN",
      skin: "border-pass-line bg-pass-bg text-pass",
    },
    {
      value: strip.oneTier0Away,
      label: "one Tier-0 away",
      title:
        "Not eliminated; the only remaining unknown is a single existing-specimen (tier 0) test",
      skin:
        strip.oneTier0Away > 0
          ? "border-unknown-line bg-unknown-bg text-unknown"
          : "border-line bg-surface text-ink",
    },
  ] as const;

  return (
    <div className="space-y-4">
      <dl className="grid gap-4 sm:grid-cols-3">
        {items.map((item) => (
          <div key={item.label} className={`rounded-md border p-4 ${item.skin}`} title={item.title}>
            <dt className="text-[13px] text-ink-2 first-letter:uppercase">{item.label}</dt>
            <dd className="mt-2 text-[28px] font-semibold leading-none">{item.value}</dd>
          </div>
        ))}
      </dl>
      <div className="overflow-hidden rounded-md border border-line bg-surface">
        {realProtocols > 0 && (
          <p className="border-b border-line-2 px-4 py-3 text-[13px] leading-[1.55] text-ink">
            {formatRealProtocols(realProtocols)}
          </p>
        )}
        <p
          className="border-b border-line-2 px-4 py-3 text-[13px] leading-[1.55] text-ink-2"
          title="Industry oncology screen-fail rate 62% × $2,000. AMBER only eliminates on a matching fact — absence stays UNKNOWN."
        >
          {failures.patientsScreened} screened · {failures.expectedFailures} expected failures at 62%
          · <span className="text-pass">{failures.failuresAvoided} avoided</span>
          {" · "}
          <span className="font-medium text-ink">{formatDollars(failures.dollarsAvoided)}</span>
        </p>
        <p
          className="px-4 py-3 text-[13px] leading-[1.55] text-ink-2"
          title="Full cube, every cell emitted. 4,000 patients × 233 compiled trials."
        >
          {formatBench(MEASURED_BENCH)}
        </p>
      </div>
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
      <span title={row.patientId}>
        {row.patientId.length > 16 ? `${row.patientId.slice(0, 14)}…` : row.patientId}
      </span>
    ),
    trial: trialWords(row.nctId, row.trial?.title),
    details: (
      <>
        {row.patient && (
          <>
            {row.patient.age} {row.patient.sex}
            {row.patient.race ? ` · ${row.patient.race}` : ""}
            {" · "}
          </>
        )}
        {trialWords(row.nctId, row.trial?.title)} <span className="font-mono">{row.nctId}</span>
        {row.eliminated && <span className="text-fail"> · Eliminated</span>}
      </>
    ),
    met: row.favourable,
    total: row.total,
    stats: [
      {
        value: (
          <>
            {row.favourable}
            <span className="font-normal text-ink-3">/{row.total}</span>
          </>
        ),
        label: "Met",
        tone: "text-ink",
      },
      { value: row.unknownCount, label: "Unknown", tone: row.unknownCount > 0 ? "text-unknown" : "text-ink-3" },
    ],
    tone: row.eliminated ? "rejected" : row.unknownCount > 0 ? "partial" : undefined,
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
      <LabelledRows label="Worklist" rows={rowsOut} layout="clinic" />
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
                    className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-on-brand disabled:opacity-40"
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
