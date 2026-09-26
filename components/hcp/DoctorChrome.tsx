import { PortalSwitcher } from "@/components/console/PortalSwitcher";
import { HcpPhysician } from "./HcpPhysician";

/** Doctor's own app. No Worklist / HCP / Elasticity / Payer tabs. */
export function DoctorChrome({
  asOf,
  demo = false,
  demoMode = "1",
  physicianId,
}: {
  asOf: string;
  demo?: boolean;
  demoMode?: "1" | "static";
  physicianId: string;
}) {
  return (
    <>
      <PortalSwitcher current="doctor" demo={demo} demoMode={demoMode} />
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 pt-2.5 sm:px-6">
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono text-[14px] font-medium tracking-[0.18em] text-ink">IMPIRICUS</span>
            <span className="text-[12px] text-ink-3">Doctor portal</span>
            {demo && (
              <span className="rounded border border-ink px-1.5 py-px font-mono text-[10px] font-medium tracking-wide text-ink">
                DEMO
              </span>
            )}
          </div>
          <span className="font-mono text-[11px] text-ink-3">as of {asOf}</span>
        </div>
        <div className="mx-auto max-w-5xl space-y-1 px-3 pb-2.5 pt-2 sm:px-6">
          <HcpPhysician physicianId={physicianId} />
          <p className="text-[12px] text-ink-2">
            You see only your own patients, and the nudges a coordinator sent you. A coordinator on the
            trial portal sees across physicians. You do not.
          </p>
        </div>
      </header>
    </>
  );
}
