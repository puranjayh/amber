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
            <span className="text-[15px] font-medium text-ink">Amber</span>
            <span className="text-[13px] text-ink-3">Your preferences</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <IdentitySwitcher current="patient" trial={trial} />
            <span className="text-[13px] text-ink-3">As of {asOf}</span>
            <span className="text-[13px] text-unknown">Amber means unknown</span>
          </div>
        </div>
        <p className="mx-auto max-w-xl px-3 pb-3 text-[13px] leading-[1.55] text-ink-3 sm:px-6">
          Four questions. Nothing medical. This page never starts a conversation. You do not see
          another patient&apos;s chart, and you do not see the trial coordinator&apos;s roster.
        </p>
      </header>
    </>
  );
}
