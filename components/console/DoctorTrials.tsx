import Link from "next/link";
import type { TrialCard } from "@/components/hcp/trialBoard";
import type { TrialNewsItem } from "./trialNews";

export function DoctorTrials({
  items,
  cards,
  hrefFor,
}: {
  items: TrialNewsItem[];
  cards: TrialCard[];
  hrefFor: (nctId: string) => string;
}) {
  return (
    <div className="space-y-8">
      <section aria-label="Registry updates">
        {items.length === 0 ? (
          <p className="text-[15px] text-ink-2">No dated registry update on file.</p>
        ) : (
          <ol className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
            {items.map((item) => (
              <li key={`${item.nctId}:${item.date}`}>
                <a href={`#trial-${item.nctId}`} className="block px-4 py-4 hover:bg-canvas sm:px-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
                    <time className="shrink-0 font-mono text-[18px] font-semibold text-ink" dateTime={item.date}>
                      {item.dateLabel}
                    </time>
                    <p className="min-w-0 break-words text-[15px] leading-snug text-ink">
                      <span className="font-medium">{item.title}:</span> {item.text}
                      {item.followUps > 0 ? (
                        <span className="mt-1 block">
                          {item.followUps === 1
                            ? "1 of your patients was told to book a follow-up"
                            : `${item.followUps} of your patients were told to book a follow-up`}
                        </span>
                      ) : null}
                    </p>
                  </div>
                </a>
              </li>
            ))}
          </ol>
        )}
      </section>
      {cards.length === 0 ? (
        <p className="text-[15px] text-ink-2">None of your patients have been scored against a trial yet.</p>
      ) : (
        <ol className="space-y-4">
          {cards.map((card) => (
            <li key={card.nctId} id={`trial-${card.nctId}`} className="scroll-mt-6">
              <Link
                href={hrefFor(card.nctId)}
                className="block rounded-md border border-line bg-surface px-5 py-5 hover:bg-canvas"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h2 className="min-w-0 max-w-full break-words text-[32px] font-semibold leading-tight text-ink">{card.title}</h2>
                  <span className="font-mono text-[13px] text-ink-3">
                    {card.phase && !card.phase.startsWith("Phase not") ? `${card.phase} · ` : ""}
                    {card.nctId}
                  </span>
                </div>
                <div className="mt-5 flex flex-wrap gap-10">
                  <div>
                    <div className="font-mono text-[28px] font-semibold leading-none text-ink">
                      {card.enrollment ?? "—"}
                    </div>
                    <div className="mt-1 text-[13px] text-ink-3">Enrollment target</div>
                  </div>
                  <div>
                    <div className="font-mono text-[28px] font-semibold leading-none text-ink">{card.close}</div>
                    <div className="mt-1 text-[13px] text-ink-3">Near eligible</div>
                  </div>
                </div>
                {card.statusLine ? <p className="mt-4 text-[15px] text-ink">{card.statusLine}</p> : null}
                {card.site ? (
                  <p className="mt-1 text-[15px] text-ink-2">
                    {card.site}
                    {card.siteCount > 0 ? ` · ${card.siteCount} ${card.siteCount === 1 ? "site" : "sites"}` : ""}
                  </p>
                ) : null}
                {card.blocker ? <p className="mt-3 text-[15px] font-medium text-ink">{card.blocker}</p> : null}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
