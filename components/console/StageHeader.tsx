import Link from "next/link";
import { AmberMark } from "./AmberMark";
import { ThemeToggle } from "./ThemeToggle";

/** Slim chrome for /demo and /preflight — no nine-item menu. */
export function StageHeader({ asOf, label }: { asOf: string; label: string }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-8">
        <div className="flex items-center gap-3">
          <AmberMark href="/demo" />
          <span className="text-[13px] text-ink-3">{label}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-3">
          <span>As of {asOf}</span>
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
