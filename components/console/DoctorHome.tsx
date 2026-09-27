import Link from "next/link";

export type HomeReady = { name: string; trial: string; href: string };
export type HomeWaiting = { name: string; detail: string };

/** The day's work: who can enroll, who is one fact away, and follow-ups still held. */
export function DoctorHome({
  greeting,
  eligible,
  oneAway,
  toReview,
  ready,
  waiting,
  patientsHref,
  followHref,
}: {
  greeting: string;
  eligible: number;
  oneAway: number;
  toReview: number;
  ready: HomeReady[];
  waiting: HomeWaiting[];
  patientsHref: string;
  followHref: string;
}) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[28px] font-semibold text-ink">{greeting}</h1>
        <p className="mt-1 max-w-xl text-[15px] text-ink-2">
          Start with people who can enroll today. Then the ones missing a single fact, and the follow-ups you have not released.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <HomeCard
          href={patientsHref}
          tone="pass"
          label="Can enroll today"
          value={eligible}
          detail="Fully eligible on a trial. Nothing in the record is missing."
        />
        <HomeCard
          href={patientsHref}
          tone="unknown"
          label="One fact missing"
          value={oneAway}
          detail="Not rejected. One open fact is the only thing between them and eligible."
        />
        <HomeCard
          href={followHref}
          tone="brand"
          label="Follow-ups to release"
          value={toReview}
          detail="A registry change is waiting. The patient has not been told."
        />
      </div>
      <section className="space-y-3">
        <h2 className="text-[18px] font-medium text-ink">Can enroll today</h2>
        {ready.length === 0 ? (
          <p className="text-[15px] text-ink-2">No one on your panel is fully eligible today.</p>
        ) : (
          <ul className="divide-y divide-pass-line overflow-hidden rounded-md border border-pass-line bg-surface">
            {ready.map((row) => (
              <li key={row.href}>
                <Link href={row.href} className="block border-l-4 border-pass px-4 py-3 hover:bg-pass-bg">
                  <p className="text-[15px] font-medium text-ink">{row.name}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[18px] font-medium text-ink">Follow-ups to release</h2>
          <Link href={followHref} className="text-[13px] font-medium text-brand hover:text-ink">
            All follow-ups
          </Link>
        </div>
        {waiting.length === 0 ? (
          <p className="rounded-md border border-brand-line bg-brand-bg px-4 py-3 text-[15px] text-ink-2">
            Nothing is waiting on you to release.
          </p>
        ) : (
          <ul className="divide-y divide-brand-line overflow-hidden rounded-md border border-brand-line bg-surface">
            {waiting.map((row) => (
              <li key={`${row.name}-${row.detail}`} className="border-l-4 border-brand px-4 py-3">
                <p className="text-[15px] font-medium text-ink">{row.name}</p>
                <p className="text-[13px] text-ink-2">{row.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function HomeCard({
  href,
  tone,
  label,
  value,
  detail,
}: {
  href: string;
  tone: "pass" | "unknown" | "brand";
  label: string;
  value: number;
  detail: string;
}) {
  const skin =
    tone === "pass"
      ? "border-pass-line bg-pass-bg text-pass"
      : tone === "unknown"
        ? "border-unknown-line bg-unknown-bg text-unknown"
        : "border-brand-line bg-brand-bg text-brand";
  return (
    <Link href={href} className={`rounded-md border p-4 ${skin}`}>
      <p className="text-[13px] text-ink-2">{label}</p>
      <p className="mt-2 text-[28px] font-semibold leading-none">{value}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{detail}</p>
    </Link>
  );
}
