import { PHYSICIANS } from "./roster";

/** Identity only — not a roster. A doctor does not see other doctors' panels. */
export function HcpPhysician({ physicianId }: { physicianId: string }) {
  const physician = PHYSICIANS.find((p) => p.id === physicianId) ?? PHYSICIANS[0];
  return (
    <p className="text-[12px] text-ink-2" aria-label="Signed in physician">
      Signed in as <span className="font-medium text-ink">{physician.name}</span>
      <span className="text-ink-3"> · {physician.site}</span>
    </p>
  );
}
