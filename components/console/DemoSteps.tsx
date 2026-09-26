import Link from "next/link";

const STEPS = [
  { key: "worklist", path: "/", label: "Worklist" },
  { key: "hcp", path: "/hcp", label: "HCP" },
  { key: "elasticity", path: "/elasticity", label: "Elasticity" },
  { key: "payer", path: "/payer", label: "Payer" },
] as const;

export type DemoStep = (typeof STEPS)[number]["key"];

/** The presentation path — four screens. Live loop is the default; this is ?demo=1 / ?demo=static. */
export function DemoSteps({ current, mode = "1" }: { current: DemoStep; mode?: "1" | "static" }) {
  const index = STEPS.findIndex((s) => s.key === current);
  const next = STEPS[index + 1];
  const href = (path: string) => `${path}?demo=${mode}`;
  return (
    <nav
      aria-label="Demo path"
      className="flex flex-col gap-2 rounded-md border border-ink bg-surface px-2.5 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-3"
    >
      <ol className="-mx-0.5 flex items-center gap-x-0.5 overflow-x-auto font-mono text-[11px]">
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex shrink-0 items-center gap-0.5">
            {i > 0 && (
              <span className="text-ink-3" aria-hidden>
                ›
              </span>
            )}
            <Link
              href={href(s.path)}
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
          href={href(next.path)}
          className="shrink-0 self-start rounded bg-ink px-2.5 py-1 text-[13px] font-medium text-surface hover:bg-ink-2"
        >
          Next: {next.label} →
        </Link>
      )}
    </nav>
  );
}
