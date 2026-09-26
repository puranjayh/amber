import Link from "next/link";

const STEPS = [
  { key: "patient", href: "/patient?demo=1", label: "Criteria" },
  { key: "alert", href: "/alert?demo=1", label: "Alert" },
  { key: "elasticity", href: "/elasticity?demo=1", label: "Elasticity" },
  { key: "equity", href: "/equity?demo=1", label: "Equity" },
  { key: "market", href: "/market?demo=1", label: "Market" },
] as const;

export type DemoStep = (typeof STEPS)[number]["key"];

/** The presentation path, pinned to the demo pair on every step — no clicking through lists. */
export function DemoSteps({ current }: { current: DemoStep }) {
  const index = STEPS.findIndex((s) => s.key === current);
  const next = STEPS[index + 1];
  return (
    <nav
      aria-label="Demo path"
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ink bg-surface px-3 py-2"
    >
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 font-mono text-[11px]">
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex items-center gap-1">
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
        <Link href={next.href} className="rounded bg-ink px-2.5 py-1 text-[12px] font-medium text-surface hover:bg-ink-2">
          Next: {next.label} →
        </Link>
      )}
    </nav>
  );
}
