import Link from "next/link";

/** Patient-facing chrome. No screening routes, no medical facts. */
export function PortalChrome({ asOf }: { asOf: string }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-xl flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2.5 sm:px-6">
        <div className="flex items-baseline gap-2.5">
          <span className="font-mono text-[14px] font-medium tracking-[0.18em] text-ink">AMBER</span>
          <span className="text-[12px] text-ink-3">Your preferences</span>
        </div>
        <span className="font-mono text-[11px] text-ink-3">as of {asOf}</span>
      </div>
      <p className="mx-auto max-w-xl px-3 pb-2 text-[11px] text-ink-3 sm:px-6">
        Four questions. Nothing medical. This page never starts a conversation.{" "}
        <Link href="/hcp" className="text-ink-2 underline-offset-2 hover:text-ink hover:underline">
          Doctor&apos;s panel
        </Link>
      </p>
    </header>
  );
}
