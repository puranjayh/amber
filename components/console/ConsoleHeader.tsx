import Link from "next/link";
import { ANCHORS } from "./anchors";
import { IdentitySwitcher } from "./IdentitySwitcher";
import { PortalSwitcher } from "./PortalSwitcher";
import { TrialSwitcher } from "./TrialSwitcher";

const NAV = [
  { key: "worklist", label: "Worklist", href: "/" },
  { key: "hcp", label: "HCP", href: "/hcp" },
  { key: "elasticity", label: "Elasticity", href: "/elasticity" },
  { key: "payer", label: "Payer", href: "/payer" },
] as const;

const UTILITY = [
  { href: "/eval", key: "eval", label: "Eval" },
  { href: "/preflight", key: "preflight", label: "Preflight" },
] as const;

export type NavKey = (typeof NAV)[number]["key"] | (typeof UTILITY)[number]["key"];

function hrefFor(href: string, demo: boolean, demoMode: "1" | "static"): string {
  if (!demo) return href;
  return href === "/" ? `/?demo=${demoMode}` : `${href}?demo=${demoMode}`;
}

export function ConsoleHeader({
  asOf,
  active,
  demo = false,
  demoMode = "1",
  trial = ANCHORS[0].nctId,
}: {
  asOf: string;
  active: NavKey;
  demo?: boolean;
  demoMode?: "1" | "static";
  trial?: string;
}) {
  return (
    <>
      <PortalSwitcher current="trial" demo={demo} demoMode={demoMode} />
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 pt-3 sm:px-6">
          <div className="flex items-baseline gap-2.5">
            <Link href={hrefFor("/", demo, demoMode)} className="text-[15px] font-medium text-ink">
              Amber
            </Link>
            <span className="text-[13px] text-ink-3">Screening</span>
            {demo && (
              <span className="rounded border border-line px-1.5 py-px text-[11px] text-ink-3">
                Demo
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-[13px] text-ink-3">
            <IdentitySwitcher current="coordinator" trial={trial} demo={demo ? demoMode : ""} />
            <span>As of {asOf}</span>
            <span className="text-unknown">Amber means unknown</span>
          </div>
        </div>
        <div className="mx-auto flex max-w-5xl px-3 pb-2 sm:px-6">
          <TrialSwitcher current={trial} demo={demo ? demoMode : ""} />
        </div>
        <nav
          className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-2 sm:px-5"
          aria-label="Views"
        >
          {[...NAV, ...UTILITY].map((item) => {
            const current = item.key === active;
            return (
              <Link
                key={item.key}
                href={item.href.startsWith("/eval") || item.href.startsWith("/preflight")
                  ? item.href
                  : hrefFor(item.href, demo, demoMode)}
                aria-current={current ? "page" : undefined}
                className={`shrink-0 whitespace-nowrap border-b-2 px-2 py-2.5 text-[13px] ${
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
    </>
  );
}
