import type { LoopNudge, RegistryStudy } from "@/app/_data/schema";
import { statusSentence } from "@/components/loop/registry";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type TrialNewsItem = {
  nctId: string;
  title: string;
  /** ISO date from the registry, used only to sort. */
  date: string;
  dateLabel: string;
  text: string;
  followUps: number;
};

/**
 * One dated line per trial, from the fields ClinicalTrials.gov actually returned.
 * A study with no posted update date contributes nothing.
 */
export function trialNews(
  studies: readonly { nctId: string; title: string; study: RegistryStudy }[],
  followUps: ReadonlyMap<string, number>,
): TrialNewsItem[] {
  const items: TrialNewsItem[] = [];
  for (const row of studies) {
    const posted = row.study.lastUpdatePostDate;
    if (!posted) continue;
    const dateLabel = formatRegistryDate(posted);
    if (!dateLabel) continue;
    const status = row.study.overallStatus.trim();
    const meaning = plainStatus(status);
    const completion = row.study.primaryCompletionDate
      ? formatRegistryDate(row.study.primaryCompletionDate)
      : null;
    const text = [
      `status changed to ${status}.`,
      meaning ? `${meaning}.` : "",
      completion ? `Primary completion ${completion}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    items.push({
      nctId: row.nctId,
      title: row.title,
      date: posted,
      dateLabel,
      text,
      followUps: followUps.get(row.nctId) ?? 0,
    });
  }
  return items.sort(
    (a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title) || a.nctId.localeCompare(b.nctId),
  );
}

/** Patients on this panel who were actually told to book a follow-up for that trial. */
export function followUpsByTrial(
  nudges: readonly LoopNudge[],
  patientIds: ReadonlySet<string>,
): Map<string, number> {
  const byTrial = new Map<string, Set<string>>();
  for (const nudge of nudges) {
    if (nudge.kind !== "trial_update" || nudge.held === true || !nudge.nctId) continue;
    if (!patientIds.has(nudge.patientId)) continue;
    const set = byTrial.get(nudge.nctId) ?? new Set<string>();
    set.add(nudge.patientId);
    byTrial.set(nudge.nctId, set);
  }
  return new Map([...byTrial].map(([nctId, ids]) => [nctId, ids.size]));
}

export function formatRegistryDate(iso: string): string | null {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(iso.trim());
  if (!match) return null;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return null;
  if (!match[3]) return `${month} ${match[1]}`;
  return `${Number(match[3])} ${month} ${match[1]}`;
}

function plainStatus(status: string): string {
  const raw = statusSentence(status);
  if (!raw.startsWith("That status means")) return "";
  const meaning = raw
    .replace(/^That status means the study is /i, "")
    .replace(/^That status means the study /i, "")
    .replace(/\.$/, "");
  if (!meaning) return "";
  return meaning.charAt(0).toUpperCase() + meaning.slice(1);
}
