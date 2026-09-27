import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

export type PortalId = "trial" | "doctor" | "patient";

const PORTALS: { id: PortalId; label: string; href: string }[] = [
  { id: "trial", label: "Trial portal", href: "/" },
  { id: "doctor", label: "Doctor portal", href: "/doctor" },
  { id: "patient", label: "Patient portal", href: "/patient-portal" },
];

function withDemo(href: string, demo: boolean, demoMode: "1" | "static"): string {
  if (!demo) return href;
  return `${href}?demo=${demoMode}`;
}

/** Above the tabs, or stacked in a rail. Three apps, not three screens of one app. */
export function PortalSwitcher({
  current,
  demo = false,
  demoMode = "1",
  stacked = false,
}: {
  current: PortalId;
  demo?: boolean;
  demoMode?: "1" | "static";
  stacked?: boolean;
}) {
  if (stacked) {
    return (
      <nav className="flex flex-col gap-0.5" aria-label="Portals">
        {PORTALS.map((portal) => {
          const on = portal.id === current;
          return (
            <Link
              key={portal.id}
              href={withDemo(portal.href, demo, demoMode)}
              aria-current={on ? "page" : undefined}
              className={`text-[13px] ${on ? "font-medium text-brand" : "text-ink-3 hover:text-ink"}`}
            >
              {portal.label}
            </Link>
          );
        })}
      </nav>
    );
  }
  return (
    <div className="border-b border-line bg-canvas">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 sm:px-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1" role="navigation" aria-label="Portals">
          {PORTALS.map((portal) => {
            const on = portal.id === current;
            return (
              <Link
                key={portal.id}
                href={withDemo(portal.href, demo, demoMode)}
                aria-current={on ? "page" : undefined}
                className={`text-[13px] ${on ? "font-medium text-ink" : "text-ink-3 hover:text-ink"}`}
              >
                {portal.label}
              </Link>
            );
          })}
        </div>
        <ThemeToggle />
      </div>
    </div>
  );
}
