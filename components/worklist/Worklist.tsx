import Link from "next/link";
import { TIER_LABEL, type Patient, type Trial } from "@/src/contracts";
import type { WorklistRow } from "@/app/_data/schema";

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

export function Worklist({ rows }: { rows: WorklistItem[] }) {
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
        {rows.map((row, i) => (
          <li key={row.patientId} className="border-b border-line-2 last:border-b-0">
            <Link
              href={`/patient?patient=${row.patientId}&trial=${row.nctId}`}
              className={`block px-3 py-3 hover:bg-canvas sm:px-4 ${COLS}`}
            >
              <span className="hidden font-mono text-[12px] text-ink-3 md:block">{i + 1}</span>

              <span className="flex items-baseline justify-between gap-2 md:block">
                <span className="font-mono text-[13px] font-medium text-ink">
                  <span className="mr-1.5 text-ink-3 md:hidden">{i + 1}.</span>
                  {row.patientId}
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
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
