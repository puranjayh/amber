import Link from "next/link";
import { TIER_LABEL, type Patient, type Trial } from "@/src/contracts";
import type { WorklistRow, WorklistStrip } from "@/app/_data/schema";
import { MEASURED_BENCH, formatBench, formatDollars, formatRealProtocols, type ScreenFailures } from "./strip";

export type WorklistItem = WorklistRow & {
  patient?: Patient;
  trial?: Trial;
  favourable: number;
  total: number;
};

function Blocking({ row }: { row: WorklistItem }) {
  if (row.blocking.length === 0) {
    return <span className="text-[12px] text-pass">none — ready to refer</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {row.blocking.map((b) => {
        const unknown = b.verdict === "UNKNOWN";
        return (
          <span
            key={b.criterionId}
            title={`${b.criterionId}: ${b.verdict} (${b.reason}), tier ${b.tier}`}
            className={`rounded border px-1.5 py-px font-mono text-[10px] ${
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

const COLS = "md:grid md:grid-cols-[2.5rem_9rem_minmax(0,1fr)_6.5rem_minmax(0,12rem)_8rem] md:items-center md:gap-3";

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
      title: "Not eliminated; the only remaining unknown is a single existing-specimen (tier 0) test",
      tone: strip.oneTier0Away > 0 ? "text-unknown" : "text-ink",
    },
  ] as const;

  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <dl className="grid grid-cols-3">
        {items.map((item) => (
          <div key={item.label} className="border-l border-line-2 px-3 py-2.5 first:border-l-0 sm:px-4" title={item.title}>
            <dt className="font-mono text-[10px] leading-tight uppercase tracking-[0.06em] text-ink-3">{item.label}</dt>
            <dd className={`mt-0.5 font-mono text-[22px] leading-none ${item.tone}`}>{item.value}</dd>
          </div>
        ))}
      </dl>
      {realProtocols > 0 && (
        <p className="border-t border-line-2 px-3 py-2 font-mono text-[11px] leading-relaxed text-ink sm:px-4">
          {formatRealProtocols(realProtocols)}
        </p>
      )}
      <p
        className="border-t border-line-2 px-3 py-2 font-mono text-[11px] leading-relaxed text-ink-2 sm:px-4"
        title="Industry oncology screen-fail rate 62% × $2,000. AMBER only eliminates on a matching fact — absence stays UNKNOWN."
      >
        {failures.patientsScreened} screened · {failures.expectedFailures} expected failures at 62% ·{" "}
        <span className="text-pass">{failures.failuresAvoided} avoided</span>
        {" · "}
        <span className="font-medium text-ink">{formatDollars(failures.dollarsAvoided)}</span>
      </p>
      <p
        className="border-t border-line-2 px-3 py-2 font-mono text-[11px] leading-relaxed text-ink-2 sm:px-4"
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
}: {
  rows: WorklistItem[];
  onSelect?: (row: WorklistItem) => void;
  selectedId?: string;
  /** When set, rows are buttons that ask DemoShell to reveal this beat. */
  advanceTo?: number;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <div className={`hidden border-b border-line bg-canvas px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-ink-3 ${COLS}`}>
        <span>#</span>
        <span>Patient</span>
        <span>Best trial</span>
        <span>Met / unknown</span>
        <span>Blocking</span>
        <span>Resolution tier</span>
      </div>
      <ol>
        {rows.map((row, i) => {
          const selected = selectedId === row.patientId;
          const cls = `block w-full px-3 py-3 text-left hover:bg-canvas sm:px-4 ${COLS} ${
            selected ? "bg-canvas" : ""
          }`;
          const body = (
            <>
              <span className="hidden font-mono text-[12px] text-ink-3 md:block">{i + 1}</span>

              <span className="flex items-baseline justify-between gap-2 md:block">
                <span className="font-mono text-[13px] font-medium text-ink" title={row.patientId}>
                  <span className="mr-1.5 text-ink-3 md:hidden">{i + 1}.</span>
                  {row.patientId.length > 16 ? `${row.patientId.slice(0, 14)}…` : row.patientId}
                </span>
                {row.patient && (
                  <span className="text-[11px] text-ink-3 md:block">
                    {row.patient.age} {row.patient.sex} · {row.patient.race}
                  </span>
                )}
              </span>

              <span className="mt-1 block min-w-0 md:mt-0">
                <span className="font-mono text-[12px] text-ink">{row.nctId}</span>
                {row.eliminated && (
                  <span className="ml-1.5 font-mono text-[10px] uppercase text-fail">eliminated</span>
                )}
                {row.trial && <span className="block truncate text-[11px] text-ink-3">{row.trial.title}</span>}
              </span>

              <span className="mt-1.5 flex items-center gap-1.5 font-mono text-[12px] md:mt-0">
                <span className="rounded border border-pass-line bg-pass-bg px-1.5 text-pass" title="Criteria in the patient's favour">
                  {row.favourable}/{row.total}
                </span>
                <span
                  className={`rounded border px-1.5 ${
                    row.unknownCount > 0 ? "border-unknown-line bg-unknown-bg text-unknown" : "border-line text-ink-3"
                  }`}
                  title="Unknown criteria"
                >
                  {row.unknownCount}?
                </span>
              </span>

              <span className="mt-1.5 block md:mt-0">
                <Blocking row={row} />
              </span>

              <span className="mt-1.5 block text-[12px] md:mt-0">
                {row.resolutionTier === null ? (
                  <span className="text-ink-3">—</span>
                ) : (
                  <>
                    <span className="font-mono text-ink">T{row.resolutionTier}</span>{" "}
                    <span className="text-ink-2">{TIER_LABEL[row.resolutionTier]}</span>
                  </>
                )}
              </span>
            </>
          );
          return (
            <li key={row.patientId} className="border-b border-line-2 last:border-b-0">
              {advanceTo !== undefined || onSelect ? (
                <button
                  type="button"
                  data-advance={advanceTo}
                  onClick={onSelect ? () => onSelect(row) : undefined}
                  className={cls}
                  aria-current={selected ? "true" : undefined}
                >
                  {body}
                </button>
              ) : (
                <Link href={`/patient?patient=${row.patientId}&trial=${row.nctId}`} className={cls}>
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
