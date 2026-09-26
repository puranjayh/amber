import type { Verdict } from "@/src/contracts";
import { displayTone, toneMeaning, type CriterionType, type Tone } from "./tone";

const TONE_STYLE: Record<Tone, { glyph: string; className: string }> = {
  green: { glyph: "✓", className: "bg-pass-bg text-pass border-pass-line" },
  red: { glyph: "✕", className: "bg-fail-bg text-fail border-fail-line" },
  amber: { glyph: "?", className: "bg-unknown-bg text-unknown border-unknown-line" },
};

/** Text is the stored, criterion-oriented verdict; colour and glyph are the derived tone. */
export function VerdictBadge({
  verdict,
  type,
  size = "md",
}: {
  verdict: Verdict | null;
  type: CriterionType;
  size?: "sm" | "md";
}) {
  const sizing = size === "sm" ? "px-1.5 py-px text-[11px]" : "px-2 py-0.5 text-[11px]";
  if (verdict === null) {
    return (
      <span
        className={`inline-flex shrink-0 items-center rounded border border-dashed border-line font-medium text-ink-2 ${sizing}`}
        title="The engine returned no cell for this criterion"
      >
        No cell
      </span>
    );
  }
  const tone = displayTone({ verdict }, type);
  const { className } = TONE_STYLE[tone];
  const meaning = toneMeaning(verdict, type);
  const clears = type === "exclusion" && verdict === "FAIL";
  const label = clears ? "clears" : verdict;
  const glyph = clears ? null : TONE_STYLE[tone].glyph;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded border font-medium ${className} ${sizing}`}
      title={`${label} — ${meaning}`}
      aria-label={`${label}, ${meaning}`}
    >
      {glyph && <span aria-hidden>{glyph}</span>}
      {label}
    </span>
  );
}
