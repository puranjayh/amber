import Link from "next/link";

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

/** Above the tabs. Three apps, not three screens of one app. */
export function PortalSwitcher({
  current,
  demo = false,
  demoMode = "1",
}: {
  current: PortalId;
  demo?: boolean;
  demoMode?: "1" | "static";
}) {
  return (
    <div className="border-b border-line bg-canvas">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-3 py-2 sm:px-6">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">Switch app</span>
        <div className="flex flex-wrap gap-1" role="navigation" aria-label="Portals">
          {PORTALS.map((portal) => {
            const on = portal.id === current;
            return (
              <Link
                key={portal.id}
                href={withDemo(portal.href, demo, demoMode)}
                aria-current={on ? "page" : undefined}
                className={`rounded-full px-2.5 py-1 text-[12px] ${
                  on ? "bg-ink font-medium text-surface" : "border border-line text-ink-2 hover:text-ink"
                }`}
              >
                {portal.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
