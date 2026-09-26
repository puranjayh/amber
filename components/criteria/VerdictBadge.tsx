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
  const sizing =
    size === "sm" ? "h-5 px-1.5 text-[10px] gap-1" : "h-6 px-2 text-[11px] gap-1.5";
  if (verdict === null) {
    return (
      <span
        className={`inline-flex shrink-0 items-center rounded border border-dashed border-ink-3 font-mono font-medium tracking-wide text-ink-2 ${sizing}`}
        title="The engine returned no cell for this criterion"
      >
        NO CELL
      </span>
    );
  }
  const { glyph, className } = TONE_STYLE[displayTone({ verdict }, type)];
  const meaning = toneMeaning(verdict, type);
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded border font-mono font-medium tracking-wide ${className} ${sizing}`}
      title={`${verdict} — ${meaning}`}
      aria-label={`${verdict}, ${meaning}`}
    >
      <span aria-hidden>{glyph}</span>
      {verdict}
    </span>
  );
}
