import { ANCHORS } from "@/components/console/anchors";
import { IdentitySwitcher } from "@/components/console/IdentitySwitcher";
import { PortalSwitcher } from "@/components/console/PortalSwitcher";

/** Patient-facing chrome. No screening routes, no medical facts. */
export function PortalChrome({ asOf, trial = ANCHORS[0].nctId }: { asOf: string; trial?: string }) {
  return (
    <>
    <PortalSwitcher current="patient" />
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-xl flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2.5 sm:px-6">
        <div className="flex items-baseline gap-2.5">
          <span className="font-mono text-[14px] font-medium tracking-[0.18em] text-ink">AMBER</span>
          <span className="text-[12px] text-ink-3">Your preferences</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <IdentitySwitcher current="patient" trial={trial} />
          <span className="font-mono text-[11px] text-ink-3">as of {asOf}</span>
        </div>
      </div>
      <p className="mx-auto max-w-xl px-3 pb-2 text-[11px] text-ink-3 sm:px-6">
        Four questions. Nothing medical. This page never starts a conversation. You do not see another
        patient&apos;s chart, and you do not see the trial coordinator&apos;s roster.
      </p>
    </header>
    </>
  );
}
