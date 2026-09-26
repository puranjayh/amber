import Link from "next/link";

const NAV = [
  { href: "/", key: "patient", label: "Patient" },
  { href: "/alert", key: "alert", label: "Physician alert" },
  { href: "/elasticity", key: "elasticity", label: "Elasticity" },
  { href: "/landscape", key: "landscape", label: "Landscape" },
] as const;

export type NavKey = (typeof NAV)[number]["key"];

export function ConsoleHeader({ asOf, active }: { asOf: string; active: NavKey }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 pt-2.5 sm:px-6">
        <div className="flex items-baseline gap-2.5">
          <span className="font-mono text-[14px] font-medium tracking-[0.18em] text-ink">AMBER</span>
          <span className="text-[12px] text-ink-3">Screening Console</span>
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
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={current ? "page" : undefined}
              className={`border-b-2 px-2 py-2 text-[12px] ${
                current
                  ? "border-ink font-medium text-ink"
                  : "border-transparent text-ink-3 hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
