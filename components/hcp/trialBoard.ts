import type { CriterionLeaf, PairResult, Trial } from "@/src/contracts";
import { TIER_LABEL } from "@/src/contracts";
import type { RegistryStudy, WorklistRow } from "@/app/_data/schema";
import { orderFor } from "@/components/alert/alert";
import { collectLeaves } from "@/components/criteria/rows";
import { distancePhrase, nearestSite, statusLine } from "@/components/loop/registry";
import { readiness } from "@/components/worklist/readiness";
import { trialWords } from "./clinic";

export type TrialCard = {
  nctId: string;
  title: string;
  phase: string;
  enrollment: number | null;
  eligible: number;
  one: number;
  several: number;
  /** Eligible now, plus one unknown away. This is the rank, not the trial's size. */
  close: number;
  statusLine: string | null;
  siteCount: number;
  site: string | null;
  blocker: string | null;
  topics: string[];
};

const STUB_PATIENT = { id: "panel", age: 0, sex: "unknown" as const, race: "", facts: [] };

function leafMap(trial: Trial | undefined): Map<string, CriterionLeaf> {
  return trial ? collectLeaves(trial.criteria) : new Map();
}

function shortFact(leaf: CriterionLeaf): string {
  const raw = (leaf.analyte || leaf.sourceSpan || "").replace(/\s+/g, " ").trim();
  const cut = raw.split(/[.;]/)[0]?.trim() ?? "";
  if (cut.length <= 90) return cut;
  return `${cut.slice(0, 87)}…`;
}

/** The sentence a physician can act on. A shared lab is one order; a washout is not a test. */
export function blockerSentence(count: number, leaf: CriterionLeaf | undefined): string {
  if (count < 1) return "";
  const people = `${count} of your patients`;
  if (!leaf) return `${people} are held by the same criterion.`;
  if (leaf.predicate === "washout") {
    const named = shortFact(leaf);
    return named ? `${people} are waiting out the same washout — ${named}.` : `${people} are waiting out the same washout.`;
  }
  const order = orderFor(
    leaf,
    {
      patientId: STUB_PATIENT.id,
      nctId: "NCT00000000",
      criterionId: leaf.id,
      verdict: "UNKNOWN",
      reason: "absent",
      criterionCitation: leaf.sourceSpan,
      tier: leaf.tier,
    },
    STUB_PATIENT,
  );
  if (leaf.predicate === "lab_value" || leaf.predicate === "biomarker") {
    return `${people} need the same test — ${order.title}.`;
  }
  if (leaf.predicate === "staging") return `${people} need the same imaging — ${order.title}.`;
  return `${people} need the same chart review — ${order.title}.`;
}

export function commonBlocker(
  pairs: readonly PairResult[],
  leaves: Map<string, CriterionLeaf>,
): string | null {
  const counts = new Map<string, number>();
  for (const pair of pairs) {
    if (pair.eliminated) continue;
    const ids = new Set(pair.cells.filter((cell) => cell.verdict === "UNKNOWN").map((cell) => cell.criterionId));
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  let bestId = "";
  let best = 0;
  for (const [id, count] of counts) {
    if (count > best || (count === best && id.localeCompare(bestId) < 0)) {
      best = count;
      bestId = id;
    }
  }
  if (best < 2) return null;
  return blockerSentence(best, leaves.get(bestId));
}

/** Coarse condition buckets a physician can filter by. One clause can name more than one. */
export function trialTopics(condition: string): string[] {
  const topics = new Set<string>();
  for (const clause of condition.split(/[;|]/)) {
    const topic = topicOf(clause);
    if (topic) topics.add(topic);
  }
  return topics.size > 0 ? [...topics] : ["Other"];
}

function topicOf(clause: string): string | null {
  const text = clause.toLowerCase();
  if (/non[-\s]?small[-\s]?cell|\bnsclc\b/.test(text)) return "Non-small cell lung cancer";
  if (/small[-\s]?cell|\bsclc\b/.test(text)) return "Small cell lung cancer";
  if (/breast/.test(text)) return "Breast cancer";
  if (/colorectal|\bcolon\b/.test(text)) return "Colorectal cancer";
  if (/lymphoma|leukemia|myeloma/.test(text)) return "Blood cancer";
  if (/head and neck/.test(text)) return "Head and neck cancer";
  if (/pancrea/.test(text)) return "Pancreatic cancer";
  if (/melanoma/.test(text)) return "Melanoma";
  if (/mesothelioma/.test(text)) return "Mesothelioma";
  if (/lung|pulmonary/.test(text)) return "Lung cancer";
  if (/solid tumor/.test(text)) return "Solid tumors";
  return null;
}

export function phaseWords(phase: string): string {
  const trimmed = phase.trim();
  if (!trimmed || /^(NA|N\/A|NOT_APPLICABLE)$/i.test(trimmed)) return "Phase not listed";
  const match = /^PHASE\s*([0-9]+)$/i.exec(trimmed);
  if (match) return `Phase ${match[1]}`;
  return trimmed.replace(/_/g, " ");
}

/**
 * One card per trial this physician's patients were scored against.
 * Ranked by how many are eligible now or one unknown away.
 */
export function buildTrialCards(args: {
  pairs: readonly PairResult[];
  trials: ReadonlyMap<string, Trial>;
  studies: ReadonlyMap<string, RegistryStudy>;
  origin?: { lat: number; lon: number };
}): TrialCard[] {
  const byTrial = new Map<string, PairResult[]>();
  for (const pair of args.pairs) {
    const list = byTrial.get(pair.nctId) ?? [];
    list.push(pair);
    byTrial.set(pair.nctId, list);
  }
  const cards: TrialCard[] = [];
  for (const [nctId, pairs] of byTrial) {
    let eligible = 0;
    let one = 0;
    let several = 0;
    for (const pair of pairs) {
      const ready = readiness(pair);
      if (ready === "eligible") eligible += 1;
      else if (ready === "one") one += 1;
      else if (ready === "several") several += 1;
    }
    const trial = args.trials.get(nctId);
    const study = args.studies.get(nctId);
    const near = args.origin && study ? nearestSite(study.sites, args.origin) : undefined;
    const leaves = leafMap(trial);
    cards.push({
      nctId,
      title: trialWords(nctId, trial?.title),
      phase: phaseWords(trial?.phase ?? ""),
      enrollment: study?.enrollmentCount ?? null,
      eligible,
      one,
      several,
      close: eligible + one,
      statusLine: study ? statusLine(study.overallStatus) : null,
      siteCount: study?.sites.length ?? 0,
      site: near
        ? `${near.site.facility}, ${near.site.city} — ${distancePhrase(near.km)}`
        : null,
      blocker: commonBlocker(pairs, leaves),
      topics: trialTopics(trial?.condition ?? ""),
    });
  }
  return cards.sort(
    (a, b) => b.close - a.close || b.several - a.several || a.title.localeCompare(b.title) || a.nctId.localeCompare(b.nctId),
  );
}

/** A cube pair, shaped like a worklist row, for a trial that was not pinned in anchors.json. */
export function pairAsWorklistRow(pair: PairResult): WorklistRow {
  const open = pair.cells.filter((cell) => cell.verdict === "UNKNOWN");
  const blocking = (open.length > 0 ? open : pair.eliminated ? pair.cells.filter((cell) => cell.verdict === "FAIL") : [])
    .map((cell) => ({
      criterionId: cell.criterionId,
      verdict: cell.verdict,
      reason: cell.reason,
      tier: cell.tier,
    }));
  const tiers = open.map((cell) => cell.tier);
  return {
    patientId: pair.patientId,
    nctId: pair.nctId,
    eliminated: pair.eliminated,
    passCount: pair.passCount,
    failCount: pair.failCount,
    unknownCount: pair.unknownCount,
    blocking,
    resolutionTier: tiers.length ? Math.max(...tiers) : null,
    resolutionCost: pair.resolutionCost,
    expectedValue: pair.expectedValue,
  };
}

export function tierLine(tier: number | null): string {
  if (tier === null) return "—";
  return `T${tier} ${TIER_LABEL[tier] ?? ""}`.trim();
}

/** Pinned anchor rows when this physician has any; otherwise every pair they have on the trial. */
export function rowsForTrial(
  mine: ReadonlySet<string>,
  pinned: readonly WorklistRow[],
  pairs: readonly PairResult[],
): WorklistRow[] {
  const fromPin = pinned.filter((row) => mine.has(row.patientId));
  if (fromPin.length > 0) return fromPin;
  return pairs
    .filter((pair) => mine.has(pair.patientId))
    .map(pairAsWorklistRow)
    .sort(
      (a, b) =>
        Number(a.eliminated) - Number(b.eliminated) ||
        a.unknownCount - b.unknownCount ||
        a.patientId.localeCompare(b.patientId),
    );
}
