import {
  TIER_LABEL,
  type CriterionLeaf,
  type PairResult,
  type Patient,
  type Trial,
} from "@/src/contracts";
import { unknownCells } from "./rows";
import { toneCounts } from "./tone";

function Stat({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className={`rounded border px-2.5 py-1.5 ${className}`}>
      <div className="font-mono text-[18px] font-medium leading-none">{value}</div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-wide">{label}</div>
    </div>
  );
}

function Status({ pair }: { pair: PairResult }) {
  if (pair.eliminated) {
    return <span className="text-[13px] font-medium text-fail">Eliminated</span>;
  }
  if (pair.unknownCount > 0) {
    return (
      <span className="text-[13px] font-medium text-unknown">
        Not ruled out — {pair.unknownCount} unknown{pair.unknownCount === 1 ? "" : "s"} to resolve
      </span>
    );
  }
  return <span className="text-[13px] font-medium text-pass">All criteria resolved</span>;
}

export function PatientStrip({ patient }: { patient: Patient }) {
  const bits = [
    `${patient.age} ${patient.sex}`,
    patient.race,
    patient.travelMinutes !== undefined ? `${patient.travelMinutes} min travel` : null,
  ].filter(Boolean);
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <h1 className="font-mono text-[16px] font-medium text-ink">{patient.id}</h1>
      <span className="text-[12px] text-ink-2">{bits.join(" · ")}</span>
      <span className="font-mono text-[10px] uppercase tracking-wide text-ink-3">synthetic</span>
    </div>
  );
}

export function PairSummary({
  trial,
  pair,
  leaves,
}: {
  trial: Trial;
  pair: PairResult;
  leaves: Map<string, CriterionLeaf>;
}) {
  const unknowns = unknownCells(pair.cells);
  const tones = toneCounts(pair.cells, (id) => leaves.get(id)?.type);
  return (
    <div className="rounded-md border border-line bg-surface">
      <div className="px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-baseline gap-x-2 font-mono text-[11px] text-ink-3">
          <span className="font-medium text-ink">{trial.nctId}</span>
          <span>{trial.phase}</span>
          <span>· {trial.slots} slots</span>
          <span>· compiler {Math.round(trial.compilerConfidence * 100)}%</span>
        </div>
        <p className="mt-1 text-[14px] font-medium leading-snug text-ink">{trial.title}</p>
        <p className="mt-0.5 text-[12px] text-ink-2">{trial.condition}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Stat label="favourable" value={tones.green} className="border-pass-line bg-pass-bg text-pass" />
          <Stat label="unfavourable" value={tones.red} className="border-fail-line bg-fail-bg text-fail" />
          <Stat
            label="unknown"
            value={tones.amber}
            className="border-unknown-line bg-unknown-bg text-unknown"
          />
          <div className="ml-1 min-w-0 flex-1 basis-40">
            <Status pair={pair} />
            <div className="font-mono text-[11px] text-ink-3">
              resolution cost {pair.resolutionCost} · EV {pair.expectedValue.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {unknowns.length > 0 && !pair.eliminated && (
        <div className="border-t border-line-2 px-3 py-2.5 sm:px-4">
          <div className="mb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-ink-3">
            To resolve · cheapest first
          </div>
          <ul className="space-y-1">
            {unknowns.map((c) => {
              const leaf = leaves.get(c.criterionId);
              return (
                <li key={c.criterionId} className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
                  <span className="font-mono font-medium text-unknown">{c.criterionId}</span>
                  <span className="text-ink">{leaf?.analyte ?? leaf?.predicate ?? ""}</span>
                  <span className="text-ink-3">
                    {c.reason} · tier {c.tier} {TIER_LABEL[c.tier]}
                    {c.pFavorable !== undefined && ` · p ${Math.round(c.pFavorable * 100)}%`}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
