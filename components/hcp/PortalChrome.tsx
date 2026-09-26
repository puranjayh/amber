import { ANCHORS } from "@/components/console/anchors";
import { AmberMark } from "@/components/console/AmberMark";
import { IdentitySwitcher } from "@/components/console/IdentitySwitcher";
import { PortalSwitcher } from "@/components/console/PortalSwitcher";

/** Patient-facing chrome. No screening routes, no medical facts. */
export function PortalChrome({ asOf, trial = ANCHORS[0].nctId }: { asOf: string; trial?: string }) {
  return (
    <>
      <PortalSwitcher current="patient" />
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2.5 sm:px-6">
          <div className="flex items-center gap-3">
            <AmberMark href="/patient-portal" />
            <span className="text-[13px] text-ink-3">Your preferences</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <IdentitySwitcher current="patient" trial={trial} />
            <span className="text-[13px] text-ink-3">As of {asOf}</span>
          </div>
        </div>
      </header>
    </>
  );
}
