/** Offline, batch-only eligibility compiler. Never import this from the app. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import OpenAI from "openai";
import { z } from "zod";
import { CriterionNode, Trial } from "@/src/contracts";
import type { CriterionNode as CriterionNodeValue, Trial as TrialValue } from "@/src/contracts";
import { RawClinicalTrial } from "@/src/compiler/fetch-trials";
import { publishCompilationResults } from "@/src/compiler/publish";
import { partitionReviewFlags } from "@/src/compiler/review-flags";

export interface EligibilityBlock {
  type: "inclusion" | "exclusion" | "unknown";
  sourceText: string;
}

export interface CompileFailure {
  nctId: string;
  issues: string[];
}

export interface CompiledTrialResult {
  trial: TrialValue;
  failure?: CompileFailure;
  /** A usable tree with a semantic concern that a human must inspect. Never citation-only. */
  reviewReasons?: string[];
  /** Verbatim but coarse source citations; retained for audit, never demo-gating. */
  citationFlags?: string[];
  sourceText: string;
}

export type BlockCompiler = (block: EligibilityBlock) => Promise<CriterionNodeValue>;

export interface CompileBatchOptions {
  /** xAI permits far more, but 8 keeps spend and retries bounded. */
  concurrency?: number;
  onProgress?: (completed: number, total: number) => void;
}

const responseSchema = z.object({ root: CriterionNode });

/** xAI rejects recursive $ref schemas, so groups are inlined through this depth. */
export const MAX_GROUP_DEPTH = 3;

const leafJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { const: "leaf" },
    id: { type: "string" },
    type: { enum: ["inclusion", "exclusion"] },
    predicate: { enum: ["age", "lab_value", "biomarker", "prior_therapy", "performance_status", "diagnosis", "staging", "washout", "comorbidity", "contraindication"] },
    operator: { enum: [">=", "<=", ">", "<", "==", "!=", "in", "not_in"] },
    value: { anyOf: [{ type: "number" }, { type: "string" }, { type: "boolean" }, { type: "array", items: { type: "string" } }] },
    unit: { type: "string" },
    analyte: { type: "string" },
    drugClass: { type: "string" },
    members: { type: "array", items: { type: "string" }, minItems: 1 },
    maxAgeDays: { type: "integer", minimum: 1 },
    countingRule: { type: "string" },
    tier: { enum: [0, 1, 2, 3, 4] },
    pFavorable: { type: "number", minimum: 0, maximum: 1 },
    sweepable: { type: "boolean" },
    sweepRange: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
    sweepStep: { type: "number", exclusiveMinimum: 0 },
    sourceSpan: { type: "string", minLength: 1 },
  },
  required: ["kind", "id", "type", "predicate", "operator", "value", "tier", "sweepable", "sourceSpan"],
} as const;

function nodeAtDepth(depth: number): Record<string, unknown> {
  const child = depth === MAX_GROUP_DEPTH ? leafJsonSchema : nodeAtDepth(depth + 1);
  return {
    anyOf: [
      leafJsonSchema,
      {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { const: "group" },
          op: { enum: ["AND", "OR", "NOT"] },
          children: { type: "array", minItems: 1, items: child },
          sourceSpan: { type: "string" },
        },
        required: ["kind", "op", "children"],
      },
    ],
  };
}

/** A non-recursive schema: depth-3 group children are leaves, never $ref nodes. */
export const boundedResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: { root: nodeAtDepth(1) },
  required: ["root"],
} as const;

const COMPILER_INSTRUCTIONS = `You compile clinical-trial eligibility protocol prose into ONE CriterionNode JSON object.

Return only JSON matching the supplied schema. Do not score a patient and do not infer facts.
Preserve boolean logic exactly: use nested {kind:"group", op:"AND"|"OR"|"NOT", children:[...]} nodes. Never flatten OR alternatives into a list of leaves. If the protocol says A and (B or C), the root is AND whose child is an OR group.
Every leaf must be grounded in a verbatim sourceSpan copied exactly from the supplied block. Set every leaf's type to the supplied block type, unless it is unknown.
Use only the contract predicates and operators. Do not invent clinical requirements. Keep prose that cannot be safely represented in countingRule, while retaining its exact sourceSpan.

Washout leaves are time since a SPECIFIC prior exposure, never generic time since any treatment. Every washout leaf must have a numeric duration in days, tier:4, and a non-empty target in drugClass or analyte. Put the target in drugClass whenever it is a treatment category: RADIOTHERAPY, PLATINUM_CHEMOTHERAPY, INVESTIGATIONAL_AGENT, or SURGERY. For example, “prior palliative or curative radiotherapy must be completed at least 14 days prior” is a washout leaf with value:14, unit:"days", operator:">=", drugClass:"RADIOTHERAPY", tier:4. Preserve “palliative or curative” as a sourceSpan/countingRule; it does not make the target optional.

Boolean leaves must name the thing a Fact would record: use analyte or drugClass and a boolean value. For “pregnant or lactating”, return exactly an OR group with named contraindication/comorbidity leaves for analyte:"pregnancy", value:true and analyte:"lactation", value:true. Never encode the entire sentence as an unnamed true value. If a criterion genuinely cannot be typed into a Fact comparison, emit no invented catch-all leaf: the result must fail validation and be reviewed.

Do not use washout for an imaging or assessment requirement. “Chest CT or PET/CT within 12 months” is not time since a dose; it is not representable by a washout leaf. Never put a quoted source sentence in value. Split enumerated requirements into typed leaves joined by an AND group. For example, “ANC >= 1500/uL, platelets >= 100,000/uL, CrCl >= 45 mL/min” becomes an AND group with three lab_value leaves, each with its own analyte, numeric value, unit, and sourceSpan. Never emit a catch-all boolean leaf (such as value:true) whose sourceSpan is a whole multi-requirement sentence. If a requirement cannot be represented as a predicate that a Fact can compare to, do not emit a leaf for it.

Tier mapping: 0 = result from an existing specimen (usually biomarker/pathology); 1 = blood draw or in-clinic assessment (labs, ECOG, history); 2 = imaging; 3 = new invasive procedure/biopsy; 4 = time-bound/washout. Choose the lowest truthful resolution cost.
For EVERY numeric value leaf set sweepable:true, sweepRange:[low, high], and a positive sweepStep. The range must contain the threshold and be clinically useful around it (for example age >=18 -> [0,100], step 1; ANC >=1500 /uL -> [0,3000], step 100; creatinine clearance >=50 -> [0,150], step 5). Non-numeric leaves set sweepable:false and omit sweepRange/sweepStep.
For prior-therapy drug-class criteria, use operator:"in" with a non-empty resolved members array of concrete drugs. Set value to that same array. Never represent a drug class with == and a bare drugClass; that cannot evaluate a medication history correctly.
IDs must be stable and unique inside this block: INC-1, INC-2, EXC-1, etc. The batch compiler will suffix a repeated id by source-block position to make it unique across the full trial. Do not explain your answer.`;

function cleanBlock(text: string): string {
  return text.trim().replace(/\r\n/g, "\n");
}

/** Split the CT.gov eligibility field into semantically distinct source blocks. */
export function extractEligibilityBlocks(eligibilityText: string): EligibilityBlock[] {
  const source = cleanBlock(eligibilityText);
  const heading = /(^|\n)\s*(inclusion|exclusion)\s+criteria\s*:?\s*(?=\n|$)/gi;
  const matches = [...source.matchAll(heading)];
  if (matches.length === 0) return [{ type: "unknown", sourceText: source }];

  const blocks: EligibilityBlock[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? source.length;
    const text = source.slice(start, end).trim();
    if (text) {
      blocks.push({
        type: match[2].toLowerCase() as "inclusion" | "exclusion",
        sourceText: text,
      });
    }
  }
  return blocks.length > 0 ? blocks : [{ type: "unknown", sourceText: source }];
}

function sourceTrial(raw: RawClinicalTrial): Omit<TrialValue, "criteria" | "compilerConfidence" | "needsHumanReview"> {
  const protocol = raw.protocolSection;
  return {
    nctId: protocol.identificationModule.nctId,
    title: protocol.identificationModule.briefTitle,
    phase: protocol.designModule.phases?.join(", ") || "NOT_APPLICABLE",
    condition: protocol.conditionsModule?.conditions?.join("; ") || "Lung cancer",
    // CT.gov publishes planned enrollment, not remaining capacity. Never fabricate slots.
    slots: 0,
  };
}

function walk(node: CriterionNodeValue, visitor: (value: CriterionNodeValue) => void): void {
  visitor(node);
  if (node.kind === "group") node.children.forEach((child) => walk(child, visitor));
}

/**
 * Eligibility headings can repeat for protocol cohorts. The model numbers each
 * heading locally, but engine cells are keyed trial-wide, so preserve source order
 * and suffix only subsequent occurrences (INC-1, INC-1-2, INC-1-3, ...).
 */
export function uniquifyCriterionNodeIds(
  node: CriterionNodeValue,
  usedIds: Set<string>,
): { node: CriterionNodeValue; renamedIds: Map<string, string> } {
  const renamedIds = new Map<string, string>();
  const visit = (current: CriterionNodeValue): CriterionNodeValue => {
    if (current.kind === "group") return { ...current, children: current.children.map(visit) };
    const originalId = current.id;
    let uniqueId = originalId;
    let suffix = 2;
    while (usedIds.has(uniqueId)) uniqueId = `${originalId}-${suffix++}`;
    usedIds.add(uniqueId);
    if (uniqueId !== originalId) renamedIds.set(originalId, uniqueId);
    return uniqueId === originalId ? current : { ...current, id: uniqueId };
  };
  return { node: visit(node), renamedIds };
}

function renameFlagIds(reasons: string[], renamedIds: Map<string, string>): string[] {
  return reasons.map((reason) => {
    for (const [originalId, uniqueId] of renamedIds) {
      if (reason.startsWith(`${originalId} `)) return `${uniqueId}${reason.slice(originalId.length)}`;
    }
    return reason;
  });
}

function containsOr(node: CriterionNodeValue): boolean {
  if (node.kind === "group" && node.op === "OR") return true;
  return node.kind === "group" && node.children.some(containsOr);
}

function groupDepth(node: CriterionNodeValue): number {
  if (node.kind === "leaf") return 0;
  return 1 + Math.max(...node.children.map(groupDepth));
}

/** Normalisation is for comparison only; accepted sourceSpan text is retained. */
export function normalizeSourceText(text: string): string {
  return text
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:(?:[-*•]+)|(?:\d+[.)])|(?:[A-Za-z]+[.)]))\s*/, "").trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

/**
 * Compare against windows anchored on distinctive shared words. This catches a
 * near-verbatim sub-clause without punishing a leaf for being shorter than its
 * protocol bullet, and avoids a quadratic scan over an entire eligibility block.
 */
export function nearVerbatimSimilarity(sourceSpan: string, sourceText: string): number {
  const span = normalizeSourceText(sourceSpan).toLowerCase();
  const source = normalizeSourceText(sourceText).toLowerCase();
  if (!span || !source) return 0;
  if (source.includes(span)) return 1;

  const anchors = [...new Set(span.match(/[a-z0-9]{5,}/g) ?? [])]
    .sort((left, right) => right.length - left.length)
    .slice(0, 5);
  let best = 0;
  for (const anchor of anchors) {
    const relativeIndex = span.indexOf(anchor);
    let position = source.indexOf(anchor);
    let examined = 0;
    while (position >= 0 && examined < 40) {
      for (const offset of [-8, -4, 0, 4, 8]) {
        const start = Math.max(0, position - relativeIndex + offset);
        for (const multiplier of [0.9, 1, 1.1]) {
          const window = source.slice(start, start + Math.max(1, Math.round(span.length * multiplier)));
          const score = 1 - levenshtein(span, window) / Math.max(span.length, window.length);
          best = Math.max(best, score);
        }
      }
      position = source.indexOf(anchor, position + anchor.length);
      examined += 1;
    }
  }
  return best;
}

function reconcileSourceSpans(
  node: CriterionNodeValue,
  sourceText: string,
): { data: CriterionNodeValue; reviewReasons: string[] } {
  if (node.kind === "group") {
    const children = node.children.map((child) => reconcileSourceSpans(child, sourceText));
    return {
      data: { ...node, children: children.map((child) => child.data) },
      reviewReasons: children.flatMap((child) => child.reviewReasons),
    };
  }

  const span = normalizeSourceText(node.sourceSpan);
  const source = normalizeSourceText(sourceText);
  if (span && source.includes(span)) return { data: node, reviewReasons: [] };

  const similarity = nearVerbatimSimilarity(node.sourceSpan, sourceText);
  if (similarity >= 0.9) {
    return { data: node, reviewReasons: [`${node.id} sourceSpan near-verbatim`] };
  }
  // sourceSpan is required by the frozen contract. A full source block is
  // truthful and auditable; an empty string would be neither Zod-valid nor a citation.
  return {
    data: { ...node, sourceSpan: sourceText },
    reviewReasons: [`${node.id} sourceSpan not verifiable; full source block retained`],
  };
}

function structuralAlternative(text: string): boolean {
  return /\beither\b[\s\S]{0,240}\bor\b|\bunless\b|\bwhichever\b|\bin which case\b/i.test(text);
}

function nonEmptyText(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Count explicit threshold comparisons in a source clause, not commas in prose. */
function enumeratedThresholdCount(text: string): number {
  const matches = text.match(/(?:>=|<=|≥|≤|(?<![A-Za-z])>|(?<![A-Za-z])<|\bat least\b|\bno more than\b|\bless than\b|\bgreater than\b)\s*\d/gi);
  return matches?.length ?? 0;
}

function leafCount(node: CriterionNodeValue): number {
  return node.kind === "leaf" ? 1 : node.children.reduce((count, child) => count + leafCount(child), 0);
}

function hasEnumeratedAndGroup(node: CriterionNodeValue, requiredLeaves: number): boolean {
  if (node.kind === "leaf") return false;
  if (node.op === "AND" && leafCount(node) >= requiredLeaves) return true;
  return node.children.some((child) => hasEnumeratedAndGroup(child, requiredLeaves));
}

function validateComparableLeaf(node: Extract<CriterionNodeValue, { kind: "leaf" }>): string[] {
  const issues: string[] = [];
  const numericOperator = [">=", "<=", ">", "<"].includes(node.operator);
  const membershipOperator = node.operator === "in" || node.operator === "not_in";

  if (numericOperator && typeof node.value !== "number") {
    issues.push(`${node.id}: ${node.operator} requires a numeric value that can be compared to a fact`);
  }
  if (membershipOperator && (!Array.isArray(node.value) || node.value.length === 0)) {
    issues.push(`${node.id}: ${node.operator} requires a non-empty list value that can be compared to a fact`);
  }
  if (!membershipOperator && Array.isArray(node.value)) {
    issues.push(`${node.id}: ${node.operator} cannot compare an array value to a single fact`);
  }
  if (typeof node.value === "string" && node.value.length > 40) {
    issues.push(`${node.id}: string value exceeds 40 characters; it is likely unparsed protocol prose`);
  }
  if (typeof node.value === "boolean" && !nonEmptyText(node.analyte) && !nonEmptyText(node.drugClass)) {
    issues.push(`${node.id}: boolean leaf has no named subject (analyte or drugClass required)`);
  }

  if (node.predicate === "lab_value" && (typeof node.value !== "number" || !nonEmptyText(node.analyte))) {
    issues.push(`${node.id}: lab_value requires a numeric value and a named analyte`);
  }
  if (node.predicate === "washout") {
    if (typeof node.value !== "number" || !numericOperator) {
      issues.push(`${node.id}: washout requires a numeric duration and a numeric comparison operator`);
    }
    if (!nonEmptyText(node.drugClass) && !nonEmptyText(node.analyte)) {
      issues.push(`${node.id}: washout duration has no target exposure (drugClass or analyte required)`);
    }
    if (node.tier !== 4) issues.push(`${node.id}: washout must use tier 4`);
  }
  if (enumeratedThresholdCount(node.sourceSpan) > 1) {
    issues.push(`${node.id}: sourceSpan contains multiple threshold requirements; compile an AND group of typed leaves`);
  }
  return issues;
}

export type FidelityDefectClass =
  | "sentence-as-boolean"
  | "washout-without-target"
  | "quoted-sentence-in-value";

function looksLikeQuotedSentence(value: string): boolean {
  return /[.!?]$/.test(value.trim()) || value.trim().split(/\s+/).length >= 6;
}

/**
 * A narrow, named audit for the defect classes found in the fidelity review.
 * Validation prevents these new trees; the audit makes the smoke/full-run gate
 * observable and refuses to publish if a future validation change regresses it.
 */
export function fidelityDefects(node: CriterionNodeValue): FidelityDefectClass[] {
  const defects: FidelityDefectClass[] = [];
  walk(node, (current) => {
    if (current.kind !== "leaf") return;
    if (typeof current.value === "boolean" && !nonEmptyText(current.analyte) && !nonEmptyText(current.drugClass)) {
      defects.push("sentence-as-boolean");
    }
    if (current.predicate === "washout") {
      if (!nonEmptyText(current.analyte) && !nonEmptyText(current.drugClass)) defects.push("washout-without-target");
      if (typeof current.value === "string" && looksLikeQuotedSentence(current.value)) defects.push("quoted-sentence-in-value");
    }
  });
  return defects;
}

export function fidelityDefectCounts(results: readonly CompiledTrialResult[]): Record<FidelityDefectClass, number> {
  const counts: Record<FidelityDefectClass, number> = {
    "sentence-as-boolean": 0,
    "washout-without-target": 0,
    "quoted-sentence-in-value": 0,
  };
  for (const result of results) {
    for (const criterion of result.trial.criteria) {
      for (const defect of fidelityDefects(criterion)) counts[defect] += 1;
    }
  }
  return counts;
}

function longStringValueLeaves(results: readonly CompiledTrialResult[]): string[] {
  const ids: string[] = [];
  for (const result of results) {
    for (const criterion of result.trial.criteria) {
      walk(criterion, (node) => {
        if (node.kind === "leaf" && typeof node.value === "string" && node.value.length > 40) {
          ids.push(`${result.trial.nctId}/${node.id}`);
        }
      });
    }
  }
  return ids;
}

/**
 * Sweep metadata controls a UI optimisation, not clinical eligibility. xAI
 * sometimes emits a zero step to signal that it has no meaningful slider.
 * Strip only that invalid hint before the clinical tree reaches Zod.
 */
export function normalizeSweepMetadata(candidate: unknown): unknown {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) return candidate;
  const node = candidate as Record<string, unknown>;
  if (node.kind === "group" && Array.isArray(node.children)) {
    return { ...node, children: node.children.map(normalizeSweepMetadata) };
  }
  if (node.kind !== "leaf") return node;

  // A slider only has clinical meaning for a numeric threshold. This is a
  // presentation hint, so discard model-emitted sweep fields on string,
  // boolean, and member-list leaves without altering the criterion itself.
  if (typeof node.value !== "number") {
    const { sweepRange: _range, sweepStep: _step, ...withoutSweepMetadata } = node;
    return { ...withoutSweepMetadata, sweepable: false };
  }

  const range = node.sweepRange;
  const step = node.sweepStep;
  const validRange = Array.isArray(range) && range.length === 2 &&
    range.every((value) => typeof value === "number" && Number.isFinite(value)) &&
    (range[0] as number) < (range[1] as number);
  const validStep = typeof step === "number" && Number.isFinite(step) && step > 0;
  if (validRange && validStep) return node;

  const { sweepRange: _range, sweepStep: _step, ...withoutSweepMetadata } = node;
  return { ...withoutSweepMetadata, sweepable: false };
}

/**
 * Enforces requirements that are intentionally stricter than the shared zod
 * type. It reports defects; it never fills in, changes, or flattens a tree.
 */
export function validateCompiledTree(
  candidate: unknown,
  block: EligibilityBlock,
): { success: true; data: CriterionNodeValue; reviewReasons: string[] } | { success: false; issues: string[] } {
  const parsed = CriterionNode.safeParse(candidate);
  if (!parsed.success) return { success: false, issues: parsed.error.issues.map((issue) => issue.message) };

  const issues: string[] = [];
  const reconciled = reconcileSourceSpans(parsed.data, block.sourceText);
  const reviewReasons: string[] = [...reconciled.reviewReasons];
  const ids = new Set<string>();
  walk(reconciled.data, (node) => {
    if (node.kind !== "leaf") return;
    if (block.type !== "unknown" && node.type !== block.type) {
      issues.push(`${node.id}: leaf type does not match the source block`);
    }
    if (ids.has(node.id)) issues.push(`${node.id}: duplicate criterion id`);
    ids.add(node.id);

    if (typeof node.value === "number") {
      if (node.sweepable && (!node.sweepRange || !node.sweepStep)) {
        issues.push(`${node.id}: numeric leaf is missing sweep metadata`);
      } else if (node.sweepable && node.sweepRange && node.sweepStep && (
        !Number.isFinite(node.sweepRange[0]) ||
        !Number.isFinite(node.sweepRange[1]) ||
        node.sweepRange[0] >= node.sweepRange[1] ||
        node.value < node.sweepRange[0] ||
        node.value > node.sweepRange[1]
      )) {
        issues.push(`${node.id}: sweepRange must be an ordered range containing its threshold`);
      }
    } else if (node.sweepable || node.sweepRange || node.sweepStep) {
      issues.push(`${node.id}: non-numeric leaf has sweep metadata`);
    }

    if (node.predicate === "prior_therapy" && node.drugClass !== undefined) {
      if (node.operator !== "in") {
        issues.push(`${node.id}: drug-class therapy leaves must use the in operator`);
      }
      if (!node.members?.length) {
        issues.push(`${node.id}: drug-class therapy leaves require resolved members`);
      }
      if (!Array.isArray(node.value) || node.value.length === 0 || node.value.join("\u0000") !== node.members?.join("\u0000")) {
        issues.push(`${node.id}: drug-class therapy leaf value must equal its resolved members`);
      }
    }
    issues.push(...validateComparableLeaf(node));
  });

  // Ordinary prose uses “or” descriptively (e.g. advanced or metastatic), so
  // only explicit disjunction markers warrant human review. Keep the usable tree.
  if (structuralAlternative(block.sourceText) && !containsOr(reconciled.data)) {
    reviewReasons.push("possible structural alternative has no OR group");
  }
  if (groupDepth(reconciled.data) > MAX_GROUP_DEPTH) {
    reviewReasons.push(`tree exceeds the supported nesting depth of ${MAX_GROUP_DEPTH} groups`);
  }
  const enumeratedRequirements = enumeratedThresholdCount(block.sourceText);
  if (enumeratedRequirements > 1 && !hasEnumeratedAndGroup(reconciled.data, enumeratedRequirements)) {
    issues.push(`source block has ${enumeratedRequirements} threshold requirements but no AND group of typed leaves`);
  }

  return issues.length ? { success: false, issues } : { success: true, data: reconciled.data, reviewReasons };
}

export function createGrokBlockCompiler({
  apiKey = process.env.XAI_API_KEY,
  model = process.env.XAI_MODEL || "grok-4",
}: { apiKey?: string; model?: string } = {}): BlockCompiler {
  if (!apiKey) throw new Error("XAI_API_KEY is required to compile eligibility criteria");
  // Individual stalled responses must not hold a pilot (or the full batch)
  // indefinitely. Transient timeouts flow through the bounded retry policy below.
  const client = new OpenAI({ apiKey, baseURL: "https://api.x.ai/v1", timeout: 90_000, maxRetries: 0 });

  return async (block) => {
    try {
      return await compileWithBoundedSchema(client, model, block);
    } catch (error) {
      if (!unsupportedStructuredSchema(error)) throw error;
      return compileWithJsonMode(client, model, block);
    }
  };
}

function messagesFor(block: EligibilityBlock, jsonMode = false) {
  return [
    {
      role: "developer" as const,
      content: jsonMode
        ? `${COMPILER_INSTRUCTIONS}\nReturn one JSON object with exactly one key, root. Do not use markdown.`
        : COMPILER_INSTRUCTIONS,
    },
    { role: "user" as const, content: `Block type: ${block.type}\n\nProtocol source:\n${block.sourceText}` },
  ];
}

function parseCompilerResponse(content: string): CriterionNodeValue {
  return responseSchema.parse({ root: normalizeSweepMetadata(JSON.parse(content).root) }).root;
}

async function compileWithBoundedSchema(
  client: OpenAI,
  model: string,
  block: EligibilityBlock,
): Promise<CriterionNodeValue> {
  const completion = await withRetry(() =>
    client.chat.completions.create({
      model,
      temperature: 0,
      messages: messagesFor(block),
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "bounded_criterion_node",
          strict: true,
          schema: boundedResponseJsonSchema,
        },
      },
    }),
  );
  const content = completion.choices[0]?.message.content;
  if (!content) throw new Error("Grok returned no structured compilation");
  return parseCompilerResponse(content);
}

function unsupportedStructuredSchema(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unsupported response format|self referenced definition|json.?schema/i.test(message);
}

/**
 * Provider fallback: JSON mode has no schema recursion to reject. We still
 * reject malformed output through the exact recursive Zod schema, retrying a
 * parse failure once before letting the trial enter human review.
 */
async function compileWithJsonMode(
  client: OpenAI,
  model: string,
  block: EligibilityBlock,
): Promise<CriterionNodeValue> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const completion = await withRetry(() =>
        client.chat.completions.create({
          model,
          temperature: 0,
          messages: messagesFor(block, true),
          response_format: { type: "json_object" },
        }),
      );
      const content = completion.choices[0]?.message.content;
      if (!content) throw new Error("Grok returned no JSON-mode compilation");
      return parseCompilerResponse(content);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function retryable(error: unknown): boolean {
  const status = typeof error === "object" && error !== null && "status" in error
    ? (error as { status?: unknown }).status
    : undefined;
  return status === 408 || status === 409 || status === 429 || (typeof status === "number" && status >= 500);
}

function backoffMilliseconds(attempt: number): number {
  // Deterministic jitter avoids synchronized retries while retaining reproducible tests.
  return 250 * 2 ** attempt + attempt * 37;
}

/** Retry only transient provider failures; invalid schemas must fail immediately. */
export async function withRetry<T>(
  operation: () => Promise<T>,
  { attempts = 4, sleep = (milliseconds: number) => new Promise<void>((resolveSleep) => setTimeout(resolveSleep, milliseconds)) }:
    { attempts?: number; sleep?: (milliseconds: number) => Promise<void> } = {},
): Promise<T> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!retryable(error) || attempt === attempts - 1) throw error;
      await sleep(backoffMilliseconds(attempt));
    }
  }
  throw new Error("unreachable retry state");
}

export async function compileTrial(
  raw: RawClinicalTrial,
  compileBlock: BlockCompiler,
): Promise<CompiledTrialResult> {
  const base = sourceTrial(raw);
  const sourceText = raw.protocolSection.eligibilityModule?.eligibilityCriteria?.trim() || "";
  if (!sourceText) {
    return { trial: Trial.parse({ ...base, criteria: [], compilerConfidence: 0, needsHumanReview: true }), sourceText, failure: { nctId: base.nctId, issues: ["missing eligibility criteria"] } };
  }

  const criteria: CriterionNodeValue[] = [];
  const issues: string[] = [];
  const reviewReasons: string[] = [];
  const citationFlags: string[] = [];
  const usedIds = new Set<string>();
  for (const block of extractEligibilityBlocks(sourceText)) {
    try {
      const candidate = await compileBlock(block);
      const checked = validateCompiledTree(candidate, block);
      if (!checked.success) issues.push(...checked.issues);
      else {
        const unique = uniquifyCriterionNodeIds(checked.data, usedIds);
        criteria.push(unique.node);
        const partitioned = partitionReviewFlags(renameFlagIds(checked.reviewReasons, unique.renamedIds));
        reviewReasons.push(...partitioned.semanticReasons);
        citationFlags.push(...partitioned.citationFlags);
      }
    } catch (error) {
      issues.push(error instanceof Error ? error.message : "unknown compiler error");
    }
  }

  if (issues.length) {
    return {
      trial: Trial.parse({ ...base, criteria: [], compilerConfidence: 0, needsHumanReview: true }),
      sourceText,
      failure: { nctId: base.nctId, issues },
    };
  }
  return {
    // This reflects successful schema + provenance validation, not a clinical decision.
    trial: Trial.parse({ ...base, criteria, compilerConfidence: 1, needsHumanReview: reviewReasons.length > 0 }),
    sourceText,
    ...(reviewReasons.length ? { reviewReasons } : {}),
    ...(citationFlags.length ? { citationFlags } : {}),
  };
}

export async function compileRawTrials(
  rawTrials: RawClinicalTrial[],
  compileBlock: BlockCompiler,
  { concurrency = 8, onProgress }: CompileBatchOptions = {},
): Promise<CompiledTrialResult[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 10) {
    throw new Error("concurrency must be an integer from 1 through 10");
  }

  const results = new Array<CompiledTrialResult>(rawTrials.length);
  let nextIndex = 0;
  let completed = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= rawTrials.length) return;
      results[index] = await compileTrial(rawTrials[index], compileBlock);
      completed += 1;
      onProgress?.(completed, rawTrials.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, rawTrials.length) }, worker));
  return results;
}

/** Select exactly the requested trials for a bounded retry; never rerun the corpus by accident. */
export function selectRawTrialsByNctIds(rawTrials: RawClinicalTrial[], nctIds: string[]): RawClinicalTrial[] {
  const byNctId = new Map(rawTrials.map((trial) => [trial.protocolSection.identificationModule.nctId, trial]));
  const missing = nctIds.filter((nctId) => !byNctId.has(nctId));
  if (missing.length) throw new Error(`Requested retry trials are absent from the raw cache: ${missing.join(", ")}`);
  return nctIds.map((nctId) => byNctId.get(nctId)!);
}

function cliArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const inputPath = resolve(process.argv[2] || "data/raw/clinicaltrials-lung-cancer-recruiting.json");
  const fullBatch = process.argv.includes("--full");
  const retryIdsPath = cliArgument("--nct-ids");
  const requestedSmokeCount = cliArgument("--smoke-count");
  const smokeCount = requestedSmokeCount === undefined ? 3 : Number(requestedSmokeCount);
  const requireAllCompiled = process.argv.includes("--require-all-compiled");
  const printTrees = process.argv.includes("--print-trees");
  if (!Number.isInteger(smokeCount) || smokeCount < 1) throw new Error("--smoke-count must be a positive integer");
  const outputPath = resolve(process.argv[3] || (retryIdsPath ? "data/compiled/trials.retry.json" : fullBatch ? "data/compiled/trials.json" : "data/compiled/trials.smoke.json"));
  const rawTrials = z.array(RawClinicalTrial).parse(JSON.parse(await readFile(inputPath, "utf8")));
  const retryNctIds = retryIdsPath
    ? z.array(z.string().regex(/^NCT\d{8}$/)).parse(JSON.parse(await readFile(resolve(retryIdsPath), "utf8")))
    : undefined;
  const batch = retryNctIds ? selectRawTrialsByNctIds(rawTrials, retryNctIds) : fullBatch ? rawTrials : rawTrials.slice(0, smokeCount);
  if (retryNctIds) console.log(`Targeted retry: compiling ${batch.length} requested trials only.`);
  else if (!fullBatch) console.log(`Smoke test: compiling ${batch.length} trials. Re-run with --full only after reviewing this output.`);
  const results = await compileRawTrials(batch, createGrokBlockCompiler(), {
    concurrency: Number(process.env.COMPILER_CONCURRENCY || "8"),
    onProgress: (completed, total) => console.log(`${completed}/${total} trials compiled`),
  });
  const defects = fidelityDefectCounts(results);
  const longValues = longStringValueLeaves(results);
  console.log(`Fidelity defect scan: sentence-as-boolean ${defects["sentence-as-boolean"]}; washout-without-target ${defects["washout-without-target"]}; quoted-sentence-in-value ${defects["quoted-sentence-in-value"]}`);
  console.log(`Long string value scan (>40 chars): ${longValues.length}`);
  if (printTrees) {
    for (const result of results) {
      console.log(`\n=== ${result.trial.nctId} ===\nSOURCE:\n${result.sourceText}\nTREE:\n${JSON.stringify(result.trial.criteria, null, 2)}${result.failure ? `\nREJECTED: ${result.failure.issues.join(" | ")}` : ""}`);
    }
  }
  if (Object.values(defects).some((count) => count > 0)) {
    throw new Error("Refusing to publish compilation containing fidelity defect classes");
  }
  if (longValues.length > 0) throw new Error(`Refusing to publish ${longValues.length} long literal criterion values`);
  if (requireAllCompiled && results.some((result) => result.failure)) {
    throw new Error("Pilot requires every requested trial to compile before publication");
  }
  const published = await publishCompilationResults(results, outputPath);
  console.log(`Compiled ${published.compiledTrees}; rejected ${results.filter((result) => result.failure).length}${published.previousCompiledTrees === undefined ? "" : `; previous corpus had ${published.previousCompiledTrees} compiled trees`}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  void main();
}
