import type { CriterionLeaf, PairResult, Patient, Trial } from "@/src/contracts";
import { shownCitation } from "@/components/criteria/cite";
import { collectLeaves, listLeaves } from "@/components/criteria/rows";
import { displayTone } from "@/components/criteria/tone";

export type SourcePlane = "chart" | "claims" | "patient_reported";

export type CitedReason = {
  criterionId: string;
  sentence: string;
  sourceLabel: string;
  quote: string | null;
};

export type OpenItem = {
  ids: string[];
  gap: string;
};

export type OpenGroup = {
  check: string;
  items: OpenItem[];
};

export type PatientLetter = {
  patientId: string;
  nctId: string;
  title: string;
  phaseLine: string;
  physicianName: string;
  physicianTalk: string;
  physicianSite: string;
  asOf: string;
  eliminated: boolean;
  scoreLine: string;
  reasons: CitedReason[];
  blockers: CitedReason[];
  questions: OpenGroup[];
  objective: string;
  location: string;
  travel: string;
  visits: string;
  duration: string;
  costs: string;
  travelCovered: string;
};

const NOT_STATED = "Not stated.";

/** Pull only sentences that are actually about the study's purpose, schedule, or pay. */
export function protocolBrief(sourceText: string | undefined): {
  objective?: string;
  duration?: string;
  visits?: string;
  costs?: string;
  travelCovered?: string;
} {
  const text = sourceText ?? "";
  return {
    objective: firstMatch(
      text,
      /(?:primary |study )?objectives?\s+(?:of this (?:study|trial)\s+)?(?:is|are)\s+[^.]+\./i,
      /the purpose of this (?:study|trial) is [^.]+\./i,
    ),
    duration: firstMatch(
      text,
      /(?:the |this )?(?:study|treatment) (?:lasts|duration is|period of|for up to) \d+ (?:days|weeks|months|years)/i,
    ),
    visits: firstMatch(text, /\d+ (?:clinic |study )?visits\b/i, /visits every \d+ (?:days|weeks|months)/i),
    costs: firstMatch(
      text,
      /(?:will be (?:reimbursed|paid)|compensation (?:of|for|is)|stipend|at no cost to (?:you|the participant)|no charge to (?:you|the participant))[^.]*/i,
    ),
    travelCovered: firstMatch(
      text,
      /travel (?:costs|expenses)[^.]{0,80}(?:reimburse|covered|paid)[^.]*/i,
      /reimburse[^.]{0,80}travel[^.]*/i,
    ),
  };
}

function firstMatch(text: string, ...patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const hit = text.match(pattern);
    if (hit) return hit[0].replace(/\s+/g, " ").trim();
  }
  return undefined;
}

export function buildLetter(input: {
  patient: Patient;
  trial: Trial;
  pair: PairResult;
  physicianName: string;
  physicianTalk: string;
  physicianSite: string;
  asOf: string;
  protocolText?: string;
  travelMinutes: number | null;
  travelFrom: "site" | "record" | "none";
}): PatientLetter {
  const leaves = collectLeaves(input.trial.criteria);
  const listed = listLeaves(input.trial.criteria);
  const reasons: CitedReason[] = [];
  const blockers: CitedReason[] = [];
  const unknownLeaves: { leaf: CriterionLeaf; reason: string }[] = [];
  let green = 0;
  let red = 0;
  let amber = 0;

  for (const cell of input.pair.cells) {
    const leaf = leaves.get(cell.criterionId);
    if (!leaf) continue;
    const tone = displayTone(cell, leaf.type);
    const citation = shownCitation(input.patient, leaf, cell, listed);
    if (tone === "green") {
      green += 1;
      if (citation) reasons.push(cite(input.patient, leaf, cell.criterionId, citation, "green"));
    } else if (tone === "red") {
      red += 1;
      if (citation) blockers.push(cite(input.patient, leaf, cell.criterionId, citation, "red"));
    } else {
      amber += 1;
      unknownLeaves.push({ leaf, reason: cell.reason });
    }
  }

  const distinctReasons = uniqueByFact(reasons);
  const distinctBlockers = uniqueByFact(blockers);
  const total = green + red + amber;
  const brief = protocolBrief(input.protocolText);
  const objective = brief.objective
    ? brief.objective
    : `Not stated in the protocol text we have. The eligibility section was compiled; the study objectives were not. The registered title is “${input.trial.title}.”`;

  return {
    patientId: input.patient.id,
    nctId: input.trial.nctId,
    title: input.trial.title,
    phaseLine: phasePlain(input.trial.phase),
    physicianName: input.physicianName,
    physicianTalk: input.physicianTalk,
    physicianSite: input.physicianSite,
    asOf: input.asOf,
    eliminated: input.pair.eliminated,
    scoreLine: input.pair.eliminated
      ? `This study is not a match. ${red} of ${total} checks in your record rule it out.${
          distinctBlockers.length < red ? " Where several checks use the same fact, it is listed once." : ""
        }`
      : `Compatibility: ${green} of ${total} checks already match your record.${
          distinctReasons.length < green ? " Where several checks use the same fact, it is listed once." : ""
        }`,
    reasons: distinctReasons,
    blockers: input.pair.eliminated ? distinctBlockers : [],
    questions: groupUnknowns(unknownLeaves),
    objective,
    location: `The protocol text we have does not name a clinic. This note was prepared at ${input.physicianSite}.`,
    travel:
      input.travelFrom === "site" && input.travelMinutes !== null
        ? `The study lists the site as about ${input.travelMinutes} minutes away.`
        : input.travelFrom === "record" && input.travelMinutes !== null
          ? `From your record, the trip is about ${input.travelMinutes} minutes.`
          : "Travel time is not in your record.",
    visits: brief.visits ?? NOT_STATED,
    duration: brief.duration ?? NOT_STATED,
    costs: brief.costs ?? NOT_STATED,
    travelCovered: brief.travelCovered ?? NOT_STATED,
  };
}

/** Plain text of the take-home note, for a downloaded PDF. */
export function letterText(letter: PatientLetter): string {
  const lines = [
    "Information for you",
    "",
    letter.title,
    `${letter.nctId}. ${letter.phaseLine}`,
    "",
    `Prepared for ${letter.patientId} by ${letter.physicianName}, ${letter.physicianSite}. Screened as of ${letter.asOf}.`,
    "This is information to take away and think about. It does not sign you up, it does not enrol you, and it does not reserve a place.",
    "",
    "Why you, specifically",
    letter.scoreLine,
  ];
  if (letter.reasons.length === 0) {
    lines.push("None of the checks can be confirmed from your record yet.");
  } else {
    for (const reason of letter.reasons) {
      lines.push(reason.sentence);
      lines.push(
        reason.quote
          ? `${reason.sourceLabel}: "${reason.quote}"`
          : `${reason.sourceLabel}. The exact sentence was not stored with this check.`,
      );
      lines.push("");
    }
  }
  if (letter.blockers.length > 0) {
    lines.push("Why this study does not fit");
    for (const reason of letter.blockers) {
      lines.push(reason.sentence);
      lines.push(
        reason.quote
          ? `${reason.sourceLabel}: "${reason.quote}"`
          : `${reason.sourceLabel}. The exact sentence was not stored with this check.`,
      );
      lines.push("");
    }
  }
  lines.push("What still needs checking");
  if (letter.questions.length === 0) {
    lines.push("Nothing in this check is still unknown.");
  } else {
    for (const group of letter.questions) {
      lines.push(group.check);
      for (const item of group.items) lines.push(`- ${item.gap}`);
      lines.push("");
    }
  }
  lines.push(
    "What the trial is trying to find out",
    letter.objective,
    "",
    "What it would involve",
    `Where: ${letter.location}`,
    `Travel: ${letter.travel}`,
    `Visits: ${letter.visits}`,
    `How long: ${letter.duration}`,
    `Costs: ${letter.costs}`,
    `Travel costs: ${letter.travelCovered}`,
    "",
    "What happens next",
    `Nothing happens unless you decide to talk about it with ${letter.physicianTalk}. Taking this page home does not sign you up and does not enrol you. The choice is yours, discussed with your doctor.`,
    "",
    `Prepared by ${letter.physicianName}.`,
  );
  return lines.join("\n");
}

function uniqueByFact(rows: CitedReason[]): CitedReason[] {
  const seen = new Set<string>();
  const out: CitedReason[] = [];
  for (const row of rows) {
    const key = `${row.sentence}\n${row.quote ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function cite(
  patient: Patient,
  leaf: CriterionLeaf,
  criterionId: string,
  chartCitation: string | undefined,
  tone: "green" | "red",
): CitedReason {
  const fact = chartCitation
    ? patient.facts.find((row) => row.sourceQuote === chartCitation || chartCitation.includes(row.sourceQuote))
    : undefined;
  const quote = fact?.sourceQuote ?? chartCitation ?? null;
  return {
    criterionId,
    sentence: sentenceFor(leaf, tone),
    sourceLabel: sourceLabel(fact?.provenance, quote),
    quote,
  };
}

function sourceLabel(plane: SourcePlane | undefined, quote: string | null): string {
  if (quote && /structured demographics/i.test(quote)) return "From your chart (registration record)";
  if (plane === "claims") return "From insurance claims";
  if (plane === "patient_reported") return "From what you reported";
  if (plane === "chart" || quote) return "From your chart";
  return "From your record";
}

function sentenceFor(leaf: CriterionLeaf, tone: "green" | "red"): string {
  const good = tone === "green";
  switch (leaf.predicate) {
    case "age":
      return good ? "You are old enough for this study." : "You are not in the age range this study asks for.";
    case "diagnosis":
      return good
        ? "Your cancer type matches what this study is for."
        : "Your cancer type does not match what this study is for.";
    case "staging":
      return stagingSentence(leaf.value, good);
    case "lab_value":
      return labSentence(leaf, good);
    case "performance_status":
      return good
        ? "How well you can carry out daily activities is in the range this study asks for. Doctors score that as ECOG."
        : "How well you can carry out daily activities is outside the range this study asks for. Doctors score that as ECOG.";
    case "biomarker":
      return good
        ? `Your tumor has ${explainMutation(leaf.value)}, which this study is looking for.`
        : `Your tumor does not show ${explainMutation(leaf.value)}, which this study is looking for.`;
    case "prior_therapy":
      return therapySentence(leaf, good);
    case "washout":
      return good
        ? "Enough time has passed since the treatment this study restricts."
        : "Not enough time has passed since a treatment this study restricts.";
    case "comorbidity":
      return good
        ? "The chart does not show another illness that would keep you out of this study."
        : "The chart shows another illness that would keep you out of this study.";
    case "contraindication":
      return good
        ? "The chart does not show a medical reason that would keep you out of this study."
        : "The chart shows a medical reason that would keep you out of this study.";
  }
}

function stagingSentence(value: unknown, good: boolean): string {
  const text = String(value);
  if (/measurable/i.test(text)) {
    return good
      ? "The chart shows disease that can be measured on a scan, which this study needs."
      : "The chart does not show disease that can be measured on a scan, which this study needs.";
  }
  if (/lung|nsclc|cancer/i.test(text)) {
    return good
      ? "Your cancer type matches what this study is for."
      : "Your cancer type does not match what this study is for.";
  }
  return good
    ? "Your cancer stage matches what this study is for."
    : "Your cancer stage does not match what this study is for.";
}

function labSentence(leaf: CriterionLeaf, good: boolean): string {
  const what = plainAnalyte(leaf.analyte);
  if (leaf.type === "exclusion") {
    return good
      ? `Your ${what} is not in the range that would rule this study out.`
      : `Your ${what} is in a range that rules this study out.`;
  }
  return good
    ? `Your ${what} is in the range this study asks for.`
    : `Your ${what} is outside the range this study asks for.`;
}

function therapySentence(leaf: CriterionLeaf, good: boolean): string {
  const drug = therapyPhrase(leaf);
  if (leaf.type === "inclusion") {
    return good
      ? `You have had ${drug} before, which this study asks for.`
      : `You have not had ${drug} before, which this study asks for.`;
  }
  return good
    ? `You have not had ${drug} before.`
    : `You have had ${drug} before, which this study does not allow.`;
}

export function plainAnalyte(analyte: string | undefined): string {
  const name = (analyte ?? "").toLowerCase();
  if (!name) return "lab result";
  if (/neutrophil|\banc\b/.test(name)) return "infection-fighting white blood cell count";
  if (/platelet/.test(name)) return "platelet count (cells that help blood clot)";
  if (/creatinine|crcl|kidney/.test(name)) return "kidney function";
  if (/bilirubin/.test(name)) return "bilirubin (a liver test)";
  if (/ast|alt/.test(name)) return "liver enzyme level";
  if (/qtc/.test(name)) return "heart rhythm measurement";
  if (/lvef|ejection/.test(name)) return "heart pumping strength";
  if (/hemoglobin|\bhgb\b|\bhgb\b/.test(name)) return "hemoglobin (the part of blood that carries oxygen)";
  return `${analyte} (a lab result)`;
}

function therapyPhrase(leaf: CriterionLeaf): string {
  const blob = [leaf.drugClass ?? "", leaf.analyte ?? "", valueText(leaf.value), ...(leaf.members ?? [])].join(" ");
  if (/erlotinib|gefitinib|afatinib/i.test(blob)) {
    return "a targeted drug for the EGFR gene (erlotinib, gefitinib, or afatinib)";
  }
  if (/egfr/i.test(blob)) return "a drug that targets the EGFR gene";
  if (/platinum|carboplatin|cisplatin/i.test(blob)) return "a platinum chemotherapy drug";
  const named = valueText(leaf.value) || leaf.drugClass;
  return named || "this treatment";
}

function explainMutation(value: unknown): string {
  const text = valueText(value);
  const bits: string[] = [];
  if (/exon 19 deletion/i.test(text)) bits.push("an exon 19 deletion, a missing piece of the EGFR gene");
  if (/L858R/i.test(text)) bits.push("L858R, a specific change in exon 21 of the EGFR gene");
  if (/G719/i.test(text)) bits.push("G719X, a specific change in exon 18 of the EGFR gene");
  if (/L861/i.test(text)) bits.push("L861Q, a specific change in exon 21 of the EGFR gene");
  if (/exon 20/i.test(text)) bits.push("an exon 20 insertion, an extra piece in the EGFR gene");
  if (/T790M/i.test(text)) bits.push("T790M, a change in the EGFR gene that can appear after earlier treatment");
  if (bits.length) return bits.join("; ");
  if (/egfr/i.test(text)) return `a change in the EGFR gene (${text})`;
  return text || "a gene change this study is looking for";
}

function valueText(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value === undefined || value === null) return "";
  return String(value);
}

function groupUnknowns(rows: { leaf: CriterionLeaf; reason: string }[]): OpenGroup[] {
  const biomarkers = rows.filter((row) => row.leaf.predicate === "biomarker" && row.reason === "absent");
  const rest = rows.filter((row) => !biomarkers.includes(row));
  const items: { leaf: CriterionLeaf; gap: string; reason: string }[] = [];
  if (biomarkers.length) {
    items.push({
      leaf: biomarkers[0].leaf,
      reason: "absent",
      gap: "There is no EGFR gene test result in the chart. This study needs that result before anyone can say the tumor matches.",
    });
  }
  for (const row of rest) {
    items.push({ leaf: row.leaf, reason: row.reason, gap: gapLine(row.leaf, row.reason) });
  }

  const groups = new Map<string, OpenGroup>();
  for (const item of items) {
    const key = checkKey(item.leaf, item.reason);
    const group = groups.get(key) ?? { check: "", items: [] };
    if (!group.items.some((row) => row.gap === item.gap)) {
      group.items.push({ ids: [item.leaf.id], gap: item.gap });
    }
    groups.set(key, group);
  }
  for (const [key, group] of groups) group.check = checkCopy(key, group.items.length);
  return [...groups.values()];
}

function gapLine(leaf: CriterionLeaf, reason: string): string {
  if (leaf.predicate === "lab_value" && !leaf.analyte) {
    return "The chart has lab numbers, but this question is not written as a number those results can answer.";
  }
  const topic = topicOf(leaf);
  if (reason === "absent") return `There is no result for ${topic} in the chart.`;
  if (reason === "stale") return `The result for ${topic} is too old to use.`;
  if (reason === "unsupported") return `The chart has something about ${topic}, but not in a form that answers this.`;
  return `We cannot tell yet about ${topic}.`;
}

function topicOf(leaf: CriterionLeaf): string {
  switch (leaf.predicate) {
    case "age":
      return "your age";
    case "diagnosis":
      return "your cancer type";
    case "staging":
      return /measurable/i.test(valueText(leaf.value))
        ? "whether the cancer can be measured on a scan"
        : "your cancer stage";
    case "lab_value":
      return plainAnalyte(leaf.analyte);
    case "performance_status":
      return "how well you can carry out daily activities";
    case "biomarker":
      return "an EGFR gene test";
    case "prior_therapy":
      return `prior treatment with ${therapyPhrase(leaf)}`;
    case "washout":
      return "how long it has been since the last restricted treatment";
    case "comorbidity":
      return "other illnesses";
    case "contraindication":
      return "a medical reason that would keep you out";
  }
}

function checkKey(leaf: CriterionLeaf, reason: string): string {
  if (reason === "unsupported") return "unsupported";
  if (leaf.tier === 1 && leaf.predicate === "lab_value") return "blood";
  if (leaf.tier === 0) return "specimen";
  if (leaf.tier === 1) return "clinic";
  if (leaf.tier === 2) return "scan";
  if (leaf.tier === 3) return "procedure";
  return "wait";
}

function checkCopy(key: string, count: number): string {
  if (key === "unsupported") return "The study asks this in a way a new test may not settle.";
  if (key === "blood") {
    return count === 1
      ? "One blood test would confirm whether this trial fits."
      : "Blood tests would confirm whether this trial fits.";
  }
  if (key === "specimen") {
    return "A test on a sample the lab already has would confirm whether this trial fits.";
  }
  if (key === "clinic") return "A routine clinic check would confirm whether this trial fits.";
  if (key === "scan") return "A scan would confirm whether this trial fits.";
  if (key === "procedure") return "A biopsy or other procedure would confirm whether this trial fits.";
  return "This can only be answered by waiting. Ordering a test will not settle it.";
}

function phasePlain(phase: string): string {
  const n = phase.match(/\d+/)?.[0];
  if (!n) return phase ? `Registered phase: ${phase}.` : "Phase is not stated.";
  return `Registered as phase ${n}.`;
}
