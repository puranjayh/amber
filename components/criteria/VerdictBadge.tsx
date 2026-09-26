import type { Verdict } from "@/src/contracts";

const STYLE: Record<Verdict, { glyph: string; className: string }> = {
  PASS: { glyph: "✓", className: "bg-pass-bg text-pass border-pass-line" },
  FAIL: { glyph: "✕", className: "bg-fail-bg text-fail border-fail-line" },
  UNKNOWN: { glyph: "?", className: "bg-unknown-bg text-unknown border-unknown-line" },
};

export function VerdictBadge({
  verdict,
  size = "md",
}: {
  verdict: Verdict | null;
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
  const { glyph, className } = STYLE[verdict];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded border font-mono font-medium tracking-wide ${className} ${sizing}`}
    >
      <span aria-hidden>{glyph}</span>
      {verdict}
    </span>
  );
}
