import type { ReactNode } from "react";
import Link from "next/link";
import { AmberMark } from "@/components/console/AmberMark";
import { ThemeToggle } from "@/components/console/ThemeToggle";
import { PHYSICIANS } from "./roster";

export type DoctorView = "home" | "trials" | "patients" | "followups";

const ITEMS: { id: DoctorView; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "trials", label: "Trials" },
  { id: "patients", label: "My patients" },
  { id: "followups", label: "Follow-ups" },
];

function doctorName(physicianId: string): string {
  const physician = PHYSICIANS.find((p) => p.id === physicianId) ?? PHYSICIANS[0];
  const withoutDegree = physician.name.replace(/,?\s*MD$/, "").trim();
  return withoutDegree.startsWith("Dr ") ? withoutDegree : `Dr ${withoutDegree}`;
}

function viewHref(id: DoctorView, physicianId: string, trial: string | undefined, demo: string): string {
  const q = new URLSearchParams();
  if (demo) q.set("demo", demo);
  q.set("physician", physicianId);
  if (trial) q.set("trial", trial);
  if (id !== "home") q.set("view", id);
  return `/doctor?${q}`;
}

/** Left rail for the doctor's own app. Portal switching stays off this screen. */
export function DoctorChrome({
  demo = false,
  demoMode = "1",
  physicianId,
  trial,
  view = "home",
  children,
}: {
  asOf: string;
  demo?: boolean;
  demoMode?: "1" | "static";
  physicianId: string;
  trial?: string;
  view?: DoctorView;
  children: ReactNode;
}) {
  const demoFlag = demo ? demoMode : "";
  const home = viewHref("home", physicianId, trial, demoFlag);
  return (
    <div className="flex min-h-dvh w-full">
      <aside className="doctor-rail no-print sticky top-0 flex h-dvh w-[148px] shrink-0 flex-col self-start overflow-y-auto border-r border-brand-line px-3 py-4 sm:w-60 sm:px-5">
        <AmberMark href={home} side />
        {demo && (
          <span className="mt-3 w-fit rounded border border-line px-1.5 py-px text-[11px] text-ink-3">
            Demo
          </span>
        )}
        <nav className="mt-6 flex flex-col gap-0.5" aria-label="Doctor views">
          {ITEMS.map((item) => {
            const on = item.id === view;
            return (
              <Link
                key={item.id}
                href={viewHref(item.id, physicianId, trial, demoFlag)}
                aria-current={on ? "page" : undefined}
                className={`rounded-md px-3 py-2 text-[15px] ${on ? "bg-brand font-medium text-on-brand" : "text-ink-2 hover:bg-brand-bg hover:text-ink"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col items-start gap-2 pt-6">
          <p className="text-[14px] font-medium text-brand">{doctorName(physicianId)}</p>
          <ThemeToggle />
        </div>
      </aside>
      <div className="doctor-stage min-w-0 flex-1">{children}</div>
    </div>
  );
}
