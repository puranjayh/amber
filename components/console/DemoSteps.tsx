import Link from "next/link";

const STEPS = [
  { key: "patient", href: "/patient?demo=1", label: "Criteria" },
  { key: "alert", href: "/alert?demo=1", label: "Alert" },
  { key: "elasticity", href: "/elasticity?demo=1", label: "Elasticity" },
  { key: "equity", href: "/equity?demo=1", label: "Equity" },
  { key: "market", href: "/market?demo=1", label: "Market" },
  { key: "landscape", href: "/landscape?demo=1", label: "Landscape" },
  { key: "payer", href: "/payer?demo=1", label: "Payer" },
] as const;

export type DemoStep = (typeof STEPS)[number]["key"];

/** The presentation path, pinned to the demo pair on every step — no clicking through lists. */
export function DemoSteps({ current }: { current: DemoStep }) {
  const index = STEPS.findIndex((s) => s.key === current);
  const next = STEPS[index + 1];
  return (
    <nav
      aria-label="Demo path"
      className="flex flex-col gap-2 rounded-md border border-ink bg-surface px-2.5 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-3"
    >
      <ol className="-mx-0.5 flex items-center gap-x-0.5 overflow-x-auto font-mono text-[11px]">
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex shrink-0 items-center gap-0.5">
            {i > 0 && <span className="text-ink-3" aria-hidden>›</span>}
            <Link
              href={s.href}
              aria-current={s.key === current ? "step" : undefined}
              className={`rounded px-1.5 py-0.5 ${
                s.key === current ? "bg-ink text-surface" : "text-ink-2 hover:text-ink"
              }`}
            >
              {i + 1}. {s.label}
            </Link>
          </li>
        ))}
      </ol>
      {next && (
        <Link
          href={next.href}
          className="shrink-0 self-start rounded bg-ink px-2.5 py-1 text-[12px] font-medium text-surface hover:bg-ink-2"
        >
          Next: {next.label} →
        </Link>
      )}
    </nav>
  );
}
