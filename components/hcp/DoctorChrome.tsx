import { ANCHORS } from "@/components/console/anchors";
import { IdentitySwitcher } from "@/components/console/IdentitySwitcher";
import { PortalSwitcher } from "@/components/console/PortalSwitcher";
import { HcpPhysician } from "./HcpPhysician";

/** Doctor's own app. No Worklist / HCP / Elasticity / Payer tabs. */
export function DoctorChrome({
  asOf,
  demo = false,
  demoMode = "1",
  physicianId,
  trial = ANCHORS[0].nctId,
}: {
  asOf: string;
  demo?: boolean;
  demoMode?: "1" | "static";
  physicianId: string;
  trial?: string;
}) {
  return (
    <>
      <PortalSwitcher current="doctor" demo={demo} demoMode={demoMode} />
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 pt-2.5 sm:px-6">
          <div className="flex items-baseline gap-2.5">
            <span className="text-[15px] font-medium text-ink">Impiricus</span>
            <span className="text-[13px] text-ink-3">Doctor portal</span>
            {demo && (
              <span className="rounded border border-line px-1.5 py-px text-[11px] text-ink-3">
                Demo
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <IdentitySwitcher current="physician" trial={trial} demo={demo ? demoMode : ""} />
            <span className="text-[13px] text-ink-3">As of {asOf}</span>
            <span className="text-[13px] text-unknown">Amber means unknown</span>
          </div>
        </div>
        <div className="mx-auto max-w-5xl space-y-1 px-3 pb-2.5 pt-2 sm:px-6">
          <HcpPhysician physicianId={physicianId} />
          <p className="text-[13px] text-ink-2">
            You see only your own patients, and the nudges a coordinator sent you. A coordinator on
            the trial portal sees across physicians. You do not.
          </p>
        </div>
      </header>
    </>
  );
}
