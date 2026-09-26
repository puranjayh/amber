import type { ReactNode } from "react";

/** Doctor's own login. Not the trial portal — no Worklist / Elasticity / Payer nav. */
export function HcpChrome({
  asOf,
  demo = false,
  children,
}: {
  asOf: string;
  demo?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 pt-2.5 sm:px-6">
        <div className="flex items-baseline gap-2.5">
          <span className="font-mono text-[14px] font-medium tracking-[0.18em] text-ink">IMPIRICUS</span>
          <span className="text-[12px] text-ink-3">Physician portal</span>
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
      {children ? <div className="mx-auto max-w-5xl px-3 pb-2.5 pt-2 sm:px-6">{children}</div> : null}
    </header>
  );
}
