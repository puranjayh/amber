import Link from "next/link";

const NAV = [
  { key: "patients", label: "Patients", path: "/", tab: undefined },
  { key: "physicians", label: "Physicians", path: "/", tab: "physicians" },
  { key: "elasticity", label: "Elasticity", path: "/elasticity", tab: undefined },
  { key: "payer", label: "Payer", path: "/payer", tab: undefined },
] as const;

const UTILITY = [
  { href: "/eval", key: "eval", label: "Eval" },
  { href: "/preflight", key: "preflight", label: "Preflight" },
] as const;

export type NavKey = (typeof NAV)[number]["key"] | (typeof UTILITY)[number]["key"];

function hrefFor(item: (typeof NAV)[number], demo: boolean, demoMode: "1" | "static"): string {
  const q = new URLSearchParams();
  if (item.tab) q.set("tab", item.tab);
  if (demo) q.set("demo", demoMode);
  const s = q.toString();
  return s ? `${item.path}?${s}` : item.path;
}

export function ConsoleHeader({
  asOf,
  active,
  demo = false,
  demoMode = "1",
}: {
  asOf: string;
  active: NavKey;
  demo?: boolean;
  demoMode?: "1" | "static";
}) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 pt-2.5 sm:px-6">
        <div className="flex items-baseline gap-2.5">
          <Link href={demo ? `/?demo=${demoMode}` : "/"} className="font-mono text-[14px] font-medium tracking-[0.18em] text-ink">
            AMBER
          </Link>
          <span className="text-[12px] text-ink-3">Trial portal</span>
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
          {UTILITY.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={item.key === active ? "page" : undefined}
              className={`hover:text-ink ${item.key === active ? "text-ink" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
      <nav className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-2 sm:px-5" aria-label="Trial portal">
        {NAV.map((item) => {
          const current = item.key === active;
          return (
            <Link
              key={item.key}
              href={hrefFor(item, demo, demoMode)}
              aria-current={current ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap border-b-2 px-2 py-2 text-[12px] ${
                current ? "border-ink font-medium text-ink" : "border-transparent text-ink-3 hover:text-ink"
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
