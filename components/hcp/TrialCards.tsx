import Link from "next/link";
import type { TrialCard } from "./trialBoard";

function Chip({
  count,
  label,
  tone,
}: {
  count: number;
  label: string;
  tone: "pass" | "unknown" | "ink";
}) {
  const toneClass =
    tone === "pass"
      ? "border-pass-line bg-pass-bg text-pass"
      : tone === "unknown"
        ? "border-unknown-line bg-unknown-bg text-unknown"
        : "border-line bg-canvas text-ink-2";
  return (
    <span className={`rounded border px-2 py-0.5 text-[13px] ${toneClass}`}>
      {count} {label}
    </span>
  );
}

export function TrialCards({ cards, hrefFor }: { cards: TrialCard[]; hrefFor: (nctId: string) => string }) {
  if (cards.length === 0) {
    return <p className="text-[15px] text-ink-2">None of your patients have been scored against a trial yet.</p>;
  }
  return (
    <ol className="space-y-4">
      {cards.map((card) => (
        <li key={card.nctId}>
          <Link
            href={hrefFor(card.nctId)}
            className="block rounded-md border border-line bg-surface px-4 py-4 hover:bg-canvas"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="text-[18px] font-medium text-ink">{card.title}</h2>
              <span className="font-mono text-[11px] text-ink-3">{card.nctId}</span>
            </div>
            <p className="mt-1 text-[15px] text-ink-2">
              {card.phase || "Phase not listed"}
              {card.enrollment !== null ? ` · ${card.enrollment} participants` : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Chip count={card.eligible} label="eligible now" tone="pass" />
              <Chip count={card.one} label="one unknown away" tone="unknown" />
              <Chip count={card.several} label="several unknowns" tone="ink" />
            </div>
            <p className="mt-3 text-[15px] leading-[1.55] text-ink">
              {card.site ?? "Nearest site is not on the registry record yet."}
              {card.siteCount > 0 ? (
                <span className="text-ink-3">
                  {" "}
                  · {card.siteCount} {card.siteCount === 1 ? "site" : "sites"}
                </span>
              ) : null}
            </p>
            {card.statusLine && <p className="mt-2 text-[15px] text-ink">{card.statusLine}</p>}
            {card.blocker && <p className="mt-3 text-[15px] font-medium leading-[1.55] text-ink">{card.blocker}</p>}
          </Link>
        </li>
      ))}
    </ol>
  );
}
