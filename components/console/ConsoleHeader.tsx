import Link from "next/link";

const NAV = [
  { href: "/", key: "worklist", label: "Worklist" },
  { href: "/hcp", key: "hcp", label: "HCP" },
  { href: "/elasticity", key: "elasticity", label: "Elasticity" },
  { href: "/payer", key: "payer", label: "Payer" },
] as const;

/** Reachable, but not part of the demo walkthrough. */
const DEEP_DIVES = [
  { href: "/patient-portal", key: "patient-portal", label: "Patient portal" },
  { href: "/eval", key: "eval", label: "Eval" },
  { href: "/preflight", key: "preflight", label: "Preflight" },
] as const;

export type NavKey = (typeof NAV)[number]["key"] | (typeof DEEP_DIVES)[number]["key"] | "patient" | "alert" | "equity" | "market" | "landscape";

export function ConsoleHeader({
  asOf,
  active,
  demo = false,
}: {
  asOf: string;
  active: NavKey;
  demo?: boolean;
}) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 pt-2.5 sm:px-6">
        <div className="flex items-baseline gap-2.5">
          <Link href="/" className="font-mono text-[14px] font-medium tracking-[0.18em] text-ink">
            AMBER
          </Link>
          <span className="text-[12px] text-ink-3">Screening Console</span>
          {demo && (
            <span className="rounded border border-ink px-1.5 py-px font-mono text-[10px] font-medium tracking-wide text-ink">
              DEMO
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px] text-ink-3">
          <span>as of {asOf}</span>
          <span className="hidden items-center gap-1.5 sm:inline-flex">
            <span className="inline-block h-2 w-2 rounded-full bg-unknown-line" aria-hidden />
            amber = unknown
          </span>
        </div>
      </div>
      <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-2 sm:px-5" aria-label="Views">
        {NAV.map((item) => {
          const current = item.key === active;
          const keepDemo = demo && item.key !== "worklist";
          return (
            <Link
              key={item.key}
              href={keepDemo ? `${item.href}?demo=1` : item.href}
              aria-current={current ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap border-b-2 px-1 py-2 text-[10px] sm:px-2 sm:text-[12px] ${
                current
                  ? "border-ink font-medium text-ink"
                  : "border-transparent text-ink-3 hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
        <span className="ml-auto flex shrink-0 items-center gap-2 pl-3">
          <span className="text-[10px] text-ink-3 sm:text-[11px]">deep dives</span>
          {DEEP_DIVES.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={item.key === active ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap text-[10px] sm:text-[11px] ${
                item.key === active ? "text-ink" : "text-ink-3 hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </span>
      </nav>
    </header>
  );
}
