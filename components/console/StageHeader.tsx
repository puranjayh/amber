import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

/** Slim chrome for /demo and /preflight — no nine-item menu. */
export function StageHeader({ asOf, label }: { asOf: string; label: string }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-3 sm:px-6">
        <div className="flex items-baseline gap-2.5">
          <Link href="/demo" className="text-[15px] font-medium text-ink">
            Amber
          </Link>
          <span className="text-[13px] text-ink-3">{label}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-3">
          <span>As of {asOf}</span>
          <span>Amber means unknown</span>
          <Link href="/preflight" className="hover:text-ink">
            Preflight
          </Link>
          <Link href="/" className="hover:text-ink">
            Deep dives
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
