import { AmberMark } from "@/components/console/AmberMark";
import { PortalSwitcher } from "@/components/console/PortalSwitcher";
import { PHYSICIANS } from "./roster";

function doctorName(physicianId: string): string {
  const physician = PHYSICIANS.find((p) => p.id === physicianId) ?? PHYSICIANS[0];
  const withoutDegree = physician.name.replace(/,?\s*MD$/, "").trim();
  return withoutDegree.startsWith("Dr ") ? withoutDegree : `Dr ${withoutDegree}`;
}

/** Doctor's own app. No Worklist / HCP / Elasticity / Payer tabs. */
export function DoctorChrome({
  demo = false,
  demoMode = "1",
  physicianId,
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
        <div className="mx-auto grid max-w-[1600px] grid-cols-1 items-center gap-2 px-4 py-3 sm:grid-cols-[1fr_auto_1fr] sm:px-8">
          <div className="order-2 flex items-center gap-3 sm:order-1">
            <span className="text-[13px] text-ink-3">Doctor portal</span>
            {demo && (
              <span className="rounded border border-line px-1.5 py-px text-[11px] text-ink-3">
                Demo
              </span>
            )}
          </div>
          <div className="order-1 flex justify-center sm:order-2">
            <AmberMark href="/doctor" large />
          </div>
          <div className="order-3 flex justify-end">
            <span className="text-[15px] font-medium text-ink">{doctorName(physicianId)}</span>
          </div>
        </div>
      </header>
    </>
  );
}
