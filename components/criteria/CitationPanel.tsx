import { TIER_LABEL, type CriterionLeaf, type CubeCell, type Patient } from "@/src/contracts";
import { shownCitation } from "./cite";
import { toneMeaning } from "./tone";

const REASON_COPY: Record<CubeCell["reason"], string> = {
  satisfied: "A fact in the record shows this condition holds, within its recency window.",
  contradicted: "A fact in the record shows this condition does not hold.",
  absent: "Nothing in the record answers this. Absence of evidence is not evidence of absence.",
  stale: "The record has a fact, but it is older than this criterion allows.",
  unsupported: "The engine cannot evaluate this criterion type yet.",
};

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-[13px] text-ink-3">{children}</div>;
}

function ChartSide({
  leaf,
  cell,
  citation,
}: {
  leaf: CriterionLeaf;
  cell: CubeCell;
  citation?: string;
}) {
  const meta = [
    cell.observedAt && `observed ${cell.observedAt}`,
    cell.ageDays !== undefined && `${cell.ageDays} days ago`,
  ]
    .filter(Boolean)
    .join(" · ");

  if (citation) {
    const stale = cell.reason === "stale";
    return (
      <>
        <blockquote
          className={`border-l-2 pl-3 text-[15px] leading-[1.55] text-ink ${
            stale ? "border-unknown-line" : "border-ink-3"
          }`}
        >
          “{citation}”
        </blockquote>
        {meta && <div className="mt-1.5 font-mono text-[11px] text-ink-3">{meta}</div>}
        {stale && leaf.maxAgeDays !== undefined && (
          <div className="mt-1.5 text-[13px] text-unknown">
            {cell.ageDays ?? "?"} days old — window is {leaf.maxAgeDays} days.
          </div>
        )}
      </>
    );
  }

  if (cell.verdict === "UNKNOWN") {
    return (
      <div className="rounded border border-dashed border-unknown-line bg-unknown-bg/50 px-3 py-2 text-[13px] text-unknown">
        No sentence in the patient record addresses this criterion.
      </div>
    );
  }

  return (
    <div className="rounded border border-dashed border-fail-line px-3 py-2 text-[13px] text-fail">
      Missing chart citation for a {cell.verdict} verdict — this is an engine bug.
    </div>
  );
}

export function CitationPanel({
  leaf,
  cell,
  patient,
  leaves,
}: {
  leaf: CriterionLeaf;
  cell?: CubeCell;
  patient?: Pick<Patient, "facts">;
  leaves?: readonly CriterionLeaf[];
}) {
  const citation =
    cell && patient && leaves ? shownCitation(patient, leaf, cell, leaves) : cell?.chartCitation;
  return (
    <div className="grid gap-4 border-t border-line-2 bg-canvas/60 px-3 py-3 sm:grid-cols-2 sm:px-4">
      <section>
        <Label>
          Trial criterion <span className="font-mono font-normal">{leaf.id}</span>
        </Label>
        <blockquote className="border-l-2 border-ink-3 pl-3 text-[15px] leading-[1.55] text-ink">
          “{cell?.criterionCitation ?? leaf.sourceSpan}”
        </blockquote>
      </section>

      <section>
        <Label>Patient record</Label>
        {cell ? (
          <ChartSide leaf={leaf} cell={cell} citation={citation} />
        ) : (
          <div className="rounded border border-dashed border-ink-3 px-3 py-2 text-[13px] text-ink-2">
            The engine returned no cell for this criterion.
          </div>
        )}
      </section>

      {cell && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2 sm:col-span-2">
          <span className="w-full font-medium text-ink">
            {cell.verdict} — {toneMeaning(cell.verdict, leaf.type)}
          </span>
          <span>
            <span className="text-ink-3">Reason</span> {cell.reason} — {REASON_COPY[cell.reason]}
          </span>
          <span>
            <span className="text-ink-3">Tier {cell.tier}</span> {TIER_LABEL[cell.tier]}
          </span>
          {cell.pFavorable !== undefined && (
            <span>
              <span className="text-ink-3">Chance it comes back favourable</span>{" "}
              {Math.round(cell.pFavorable * 100)}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}
