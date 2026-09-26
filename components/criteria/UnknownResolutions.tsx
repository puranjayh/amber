import { TIER_LABEL, type PairResult, type Patient, type Trial } from "@/src/contracts";
import { orderCorresponds, orderFor } from "@/components/alert/alert";
import { leafForCell, unknownCells } from "./rows";

/** Every UNKNOWN, the tier it sits on, and the order that would resolve it. */
export function UnknownResolutions({
  patient,
  trial,
  pair,
}: {
  patient: Patient;
  trial: Trial;
  pair: PairResult;
}) {
  const cells = unknownCells(pair.cells);
  return (
    <section
      className="rounded-md border border-line bg-surface px-3 py-3 sm:px-4"
      aria-label="Unknowns to resolve"
    >
      <h2 className="text-[18px] font-medium text-ink">Unknowns</h2>
      {cells.length === 0 ? (
        <p className="mt-1 text-[13px] text-pass">No unknowns. Nothing left to resolve.</p>
      ) : (
        <ol className="mt-2 space-y-2">
          {cells.map((cell) => {
            const leaf = leafForCell(trial.criteria, cell);
            const order = leaf ? orderFor(leaf, cell, patient) : undefined;
            const matches = Boolean(leaf && order && orderCorresponds(leaf, cell, order));
            return (
              <li
                key={`${cell.criterionId}:${cell.reason}`}
                className="border-t border-line-2 pt-2 first:border-t-0 first:pt-0"
              >
                <p className="text-[15px] leading-[1.55] text-ink">
                  {matches && order ? order.title : (leaf?.sourceSpan ?? "No order matches this criterion.")}
                </p>
                <p className="mt-1 font-mono text-[11px] text-ink-3">
                  {cell.criterionId} · T{cell.tier} {TIER_LABEL[cell.tier]} · {cell.reason}
                </p>
                {matches && order ? (
                  <p className="mt-1 text-[13px] leading-[1.55] text-ink-2">{order.detail}</p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
