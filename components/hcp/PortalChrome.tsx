import type { ReactNode } from "react";
import Link from "next/link";
import { AmberMark } from "@/components/console/AmberMark";
import { ThemeToggle } from "@/components/console/ThemeToggle";
import { panelName } from "@/components/hcp/clinic";
import { PortalSelect } from "./PortalSelect";

/** Patient-facing rail. No portal switcher, no date, no screening routes. */
export function PortalChrome({
  patientId,
  ids,
  children,
}: {
  patientId: string;
  ids: string[];
  children: ReactNode;
}) {
  const name = patientId ? panelName(patientId) : "";
  const home = patientId ? `/patient-portal?patient=${encodeURIComponent(patientId)}` : "/patient-portal";
  return (
    <div className="flex min-h-dvh w-full">
      <aside className="doctor-rail no-print sticky top-0 flex h-dvh w-[148px] shrink-0 flex-col self-start overflow-y-auto border-r border-brand-line px-3 py-4 sm:w-60 sm:px-5">
        <AmberMark href={home} side />
        <nav className="mt-6 flex flex-col gap-0.5" aria-label="Patient views">
          <Link
            href={home}
            aria-current="page"
            className="rounded-md bg-brand px-3 py-2 text-[15px] font-medium text-on-brand"
          >
            Preferences
          </Link>
        </nav>
        <div className="mt-auto flex flex-col items-start gap-3 pt-6">
          {name ? <p className="text-[14px] font-medium text-brand">{name}</p> : null}
          <PortalSelect ids={ids} current={patientId} />
          <ThemeToggle />
        </div>
      </aside>
      <div className="doctor-stage min-w-0 flex-1">{children}</div>
    </div>
  );
}
