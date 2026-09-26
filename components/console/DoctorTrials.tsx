"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { TrialCard } from "@/components/hcp/trialBoard";
import type { TrialNewsItem } from "./trialNews";

export function DoctorTrials({
  items,
  cards,
}: {
  items: TrialNewsItem[];
  cards: (TrialCard & { href: string })[];
}) {
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const fromHash = () => {
      const id = decodeURIComponent(window.location.hash.replace(/^#trial-/, ""));
      if (id) setOpen(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const news = new Map(items.map((item) => [item.nctId, item]));
  const rows = [...cards].sort((a, b) => {
    const left = news.get(a.nctId)?.date ?? "";
    const right = news.get(b.nctId)?.date ?? "";
    return right.localeCompare(left) || a.title.localeCompare(b.title);
  });

  if (rows.length === 0) {
    return <p className="text-[15px] text-ink-2">None of your patients have been scored against a trial yet.</p>;
  }

  return (
    <ol className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
      {rows.map((card) => {
        const item = news.get(card.nctId);
        const expanded = open === card.nctId;
        return (
          <li key={card.nctId} id={`trial-${card.nctId}`} className="scroll-mt-6">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : card.nctId)}
              className="flex w-full flex-col gap-2 px-4 py-3 text-left hover:bg-canvas sm:flex-row sm:gap-6 sm:px-5"
            >
              {item ? (
                <time className="shrink-0 font-mono text-[18px] font-semibold text-ink" dateTime={item.date}>
                  {item.dateLabel}
                </time>
              ) : (
                <span className="shrink-0 font-mono text-[18px] text-ink-3">—</span>
              )}
              <span className="min-w-0">
                <span className="flex items-baseline justify-between gap-4">
                  <span className="break-words text-[15px] font-medium text-ink">{card.title}</span>
                  <span className="shrink-0 font-mono text-[13px] text-ink-3">{card.nctId}</span>
                </span>
                {item ? <span className="mt-1 block break-words text-[15px] leading-snug text-ink">{item.text}</span> : null}
                {item && item.followUps > 0 ? (
                  <span className="mt-1 block text-[15px] text-ink">
                    {item.followUps === 1
                      ? "1 of your patients was told to book a follow-up"
                      : `${item.followUps} of your patients were told to book a follow-up`}
                  </span>
                ) : null}
              </span>
            </button>
            {expanded ? <TrialDetail card={card} href={card.href} /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function TrialDetail({ card, href }: { card: TrialCard; href: string }) {
  return (
    <div className="space-y-2 border-t border-line px-4 py-3 sm:px-5">
      <div className="flex flex-wrap gap-8">
        <div>
          <div className="font-mono text-[18px] font-semibold leading-none text-ink">{card.enrollment ?? "—"}</div>
          <div className="mt-1 text-[13px] text-ink-3">Enrollment target</div>
        </div>
        <div>
          <div className="font-mono text-[18px] font-semibold leading-none text-ink">{card.close}</div>
          <div className="mt-1 text-[13px] text-ink-3">Near eligible</div>
        </div>
      </div>
      {card.statusLine ? <p className="text-[15px] text-ink">{card.statusLine}</p> : null}
      {card.site ? (
        <p className="text-[15px] text-ink-2">
          {card.site}
          {card.siteCount > 0 ? ` · ${card.siteCount} ${card.siteCount === 1 ? "site" : "sites"}` : ""}
        </p>
      ) : null}
      {card.blocker ? <p className="text-[15px] font-medium text-ink">{card.blocker}</p> : null}
      <Link href={href} className="inline-block text-[13px] text-ink-2 hover:text-ink">
        My patients on this trial
      </Link>
    </div>
  );
}
