"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { TrialCard } from "@/components/hcp/trialBoard";
import type { TrialNewsItem } from "./trialNews";

const SORTS = [
  { id: "date", label: "Date" },
  { id: "eligible", label: "Eligible now" },
  { id: "name", label: "Name" },
] as const;

type SortId = (typeof SORTS)[number]["id"];

export function DoctorTrials({
  items,
  cards,
}: {
  items: TrialNewsItem[];
  cards: (TrialCard & { href: string })[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [sort, setSort] = useState<SortId>("date");
  const [topic, setTopic] = useState("");

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
  const topics = [...new Set(cards.flatMap((card) => card.topics))].sort((a, b) => a.localeCompare(b));
  const rows = cards
    .filter((card) => !topic || card.topics.includes(topic))
    .sort((a, b) => compareTrials(a, b, sort, news));

  if (cards.length === 0) {
    return <p className="text-[15px] text-ink-2">None of your patients have been scored against a trial yet.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex w-full min-w-0 flex-wrap items-end gap-3">
        <label className="block min-w-0 max-w-full flex-[1_1_100%] text-[13px] text-ink-3 sm:max-w-xs sm:flex-none">
          Sort
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortId)}
            className="mt-1 block w-full max-w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[15px] text-ink"
          >
            {SORTS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0 max-w-full flex-[1_1_100%] text-[13px] text-ink-3 sm:max-w-xs sm:flex-none">
          Topic
          <select
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            className="mt-1 block w-full max-w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[15px] text-ink"
          >
            <option value="">Any</option>
            {topics.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>
      {rows.length === 0 ? (
        <p className="text-[15px] text-ink-2">No trials match this topic.</p>
      ) : (
        <ol className="overflow-hidden rounded-md border border-line bg-surface">
          {rows.map((card) => {
            const item = news.get(card.nctId);
            const expanded = open === card.nctId;
            return (
              <li key={card.nctId} id={`trial-${card.nctId}`} className="scroll-mt-6 border-b border-line-2 last:border-b-0">
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : card.nctId)}
                  className="flex w-full flex-col gap-4 px-4 py-4 text-left hover:bg-canvas lg:flex-row lg:items-center lg:justify-between"
                >
                  <span className="min-w-0">
                    <span className="flex items-baseline gap-3">
                      {item ? (
                        <time className="shrink-0 font-mono text-[28px] font-semibold leading-none text-brand" dateTime={item.date}>
                          {item.dateLabel}
                        </time>
                      ) : (
                        <span className="shrink-0 font-mono text-[28px] font-semibold leading-none text-ink-3">—</span>
                      )}
                      <span className="min-w-0 text-[22px] font-semibold leading-tight text-ink">
                        {card.title}
                        <span className="ml-2 font-mono text-[12px] font-normal text-ink-3">{card.nctId}</span>
                      </span>
                    </span>
                    {item ? <span className="mt-1 block text-[13px] text-ink-3">{item.text}</span> : null}
                  </span>
                  <span className="flex shrink-0 gap-6">
                    <span className="min-w-[4.5rem] text-left">
                      <span className="block font-mono text-[24px] font-semibold leading-none text-pass">{card.eligible}</span>
                      <span className="mt-1 block text-[13px] text-ink-3">Eligible</span>
                    </span>
                    <span className="min-w-[4.5rem] text-left">
                      <span className="block font-mono text-[24px] font-semibold leading-none text-unknown">{card.close}</span>
                      <span className="mt-1 block text-[13px] text-ink-3">Partially fulfilled</span>
                    </span>
                  </span>
                </button>
                {expanded ? <TrialDetail card={card} href={card.href} /> : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function compareTrials(
  a: TrialCard,
  b: TrialCard,
  sort: SortId,
  news: Map<string, TrialNewsItem>,
): number {
  if (sort === "eligible") return b.eligible - a.eligible || b.close - a.close || a.title.localeCompare(b.title);
  if (sort === "name") return a.title.localeCompare(b.title);
  const left = news.get(a.nctId)?.date ?? "";
  const right = news.get(b.nctId)?.date ?? "";
  return right.localeCompare(left) || a.title.localeCompare(b.title);
}

function TrialDetail({ card, href }: { card: TrialCard; href: string }) {
  return (
    <div className="space-y-3 border-t border-line-2 bg-canvas px-4 py-4">
      <div className="flex flex-wrap gap-8">
        <div>
          <div className="font-mono text-[24px] font-semibold leading-none text-ink">{card.enrollment ?? "—"}</div>
          <div className="mt-1 text-[13px] text-ink-3">Enrollment target</div>
        </div>
        <div>
          <div className="font-mono text-[24px] font-semibold leading-none text-pass">{card.close}</div>
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
      <Link href={href} className="inline-block text-[13px] font-medium text-brand hover:text-ink">
        My patients on this trial
      </Link>
    </div>
  );
}
