import Link from "next/link";

export function DoctorTabs({
  physicianId,
  trial,
  demo,
  view,
}: {
  physicianId: string;
  trial: string;
  demo?: "1" | "static" | null;
  view: "patients" | "trials";
}) {
  const patients = new URLSearchParams();
  const trials = new URLSearchParams();
  if (demo) {
    patients.set("demo", demo);
    trials.set("demo", demo);
  }
  patients.set("physician", physicianId);
  trials.set("physician", physicianId);
  if (trial) {
    patients.set("trial", trial);
    trials.set("trial", trial);
  }
  trials.set("view", "trials");
  const item = (current: boolean) =>
    `border-b-2 px-1 py-2 text-[15px] ${current ? "border-ink font-medium text-ink" : "border-transparent text-ink-3 hover:text-ink"}`;
  return (
    <nav className="flex gap-4" aria-label="Doctor views">
      <Link href={`/doctor?${patients}`} aria-current={view === "patients" ? "page" : undefined} className={item(view === "patients")}>
        My patients
      </Link>
      <Link href={`/doctor?${trials}`} aria-current={view === "trials" ? "page" : undefined} className={item(view === "trials")}>
        Trials
      </Link>
    </nav>
  );
}
