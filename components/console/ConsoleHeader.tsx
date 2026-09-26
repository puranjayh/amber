export function ConsoleHeader({ asOf }: { asOf: string }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2.5 sm:px-6">
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
    </header>
  );
}
