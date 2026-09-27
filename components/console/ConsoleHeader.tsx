import type { ReactNode } from "react";
import Link from "next/link";
import { ANCHORS } from "./anchors";
import { AmberMark } from "./AmberMark";
import { ThemeToggle } from "./ThemeToggle";
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

function NavLink({ href, label, on, small = false }: { href: string; label: string; on: boolean; small?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`rounded-md px-3 ${small ? "py-1.5 text-[13px]" : "py-2 text-[15px]"} ${
        on ? "bg-brand font-medium text-on-brand" : "text-ink-2 hover:bg-brand-bg hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
}

/** Left rail for the trial site, in the doctor portal's style. Pages render inside it. */
export function ConsoleHeader({
  active,
  demo = false,
  demoMode = "1",
  trial = ANCHORS[0].nctId,
  children,
}: {
  asOf: string;
  active: NavKey;
  demo?: boolean;
  demoMode?: "1" | "static";
  trial?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh w-full">
      <aside className="console-rail no-print sticky top-0 flex h-dvh w-[148px] shrink-0 flex-col self-start overflow-y-auto border-r border-brand-line px-3 py-4 sm:w-60 sm:px-5">
        <AmberMark href={hrefFor("/", demo, demoMode)} side />
        <p className="mt-2 text-[13px] font-medium text-brand">Trial site</p>
        {demo && (
          <span className="mt-2 w-fit rounded border border-line px-1.5 py-px text-[11px] text-ink-3">
            Demo
          </span>
        )}
        <div className="mt-5">
          <TrialSwitcher current={trial} demo={demo ? demoMode : ""} />
        </div>
        <nav className="mt-5 flex flex-col gap-0.5" aria-label="Views">
          {NAV.map((item) => (
            <NavLink
              key={item.key}
              href={hrefFor(item.href, demo, demoMode)}
              label={item.label}
              on={item.key === active}
            />
          ))}
          <div className="my-2 border-t border-brand-line" />
          {UTILITY.map((item) => (
            <NavLink key={item.key} href={item.href} label={item.label} on={item.key === active} small />
          ))}
        </nav>
        <div className="mt-auto flex flex-col items-start gap-3 pt-6">
          <ThemeToggle />
        </div>
      </aside>
      <div className="console-stage min-w-0 flex-1">{children}</div>
    </div>
  );
}
