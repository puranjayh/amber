/** Offline, batch-only eligibility compiler. Never import this from the app. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import OpenAI from "openai";
import { z } from "zod";
import { CriterionNode, Trial } from "@/src/contracts";
import type { CriterionNode as CriterionNodeValue, Trial as TrialValue } from "@/src/contracts";
import { RawClinicalTrial } from "@/src/compiler/fetch-trials";

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
  /** A usable tree with a semantic concern that a human must inspect. */
  reviewReasons?: string[];
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

Tier mapping: 0 = result from an existing specimen (usually biomarker/pathology); 1 = blood draw or in-clinic assessment (labs, ECOG, history); 2 = imaging; 3 = new invasive procedure/biopsy; 4 = time-bound/washout. Choose the lowest truthful resolution cost.
For EVERY numeric value leaf set sweepable:true, sweepRange:[low, high], and a positive sweepStep. The range must contain the threshold and be clinically useful around it (for example age >=18 -> [0,100], step 1; ANC >=1500 /uL -> [0,3000], step 100; creatinine clearance >=50 -> [0,150], step 5). Non-numeric leaves set sweepable:false and omit sweepRange/sweepStep.
For prior-therapy drug-class criteria, use operator:"in" with a non-empty resolved members array of concrete drugs. Set value to that same array. Never represent a drug class with == and a bare drugClass; that cannot evaluate a medication history correctly.
IDs must be stable and unique inside this block: INC-1, INC-2, EXC-1, etc. Do not explain your answer.`;

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

function containsOr(node: CriterionNodeValue): boolean {
  if (node.kind === "group" && node.op === "OR") return true;
  return node.kind === "group" && node.children.some(containsOr);
}

function groupDepth(node: CriterionNodeValue): number {
  if (node.kind === "leaf") return 0;
  return 1 + Math.max(...node.children.map(groupDepth));
}

function structuralAlternative(text: string): boolean {
  return /\beither\b[\s\S]{0,240}\bor\b|\bunless\b|\bwhichever\b|\bin which case\b/i.test(text);
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
  const reviewReasons: string[] = [];
  const ids = new Set<string>();
  walk(parsed.data, (node) => {
    if (node.kind !== "leaf") return;
    if (block.type !== "unknown" && node.type !== block.type) {
      issues.push(`${node.id}: leaf type does not match the source block`);
    }
    if (!block.sourceText.includes(node.sourceSpan)) {
      issues.push(`${node.id}: sourceSpan is not verbatim protocol text`);
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
  });

  // Ordinary prose uses “or” descriptively (e.g. advanced or metastatic), so
  // only explicit disjunction markers warrant human review. Keep the usable tree.
  if (structuralAlternative(block.sourceText) && !containsOr(parsed.data)) {
    reviewReasons.push("possible structural alternative has no OR group");
  }
  if (groupDepth(parsed.data) > MAX_GROUP_DEPTH) {
    reviewReasons.push(`tree exceeds the supported nesting depth of ${MAX_GROUP_DEPTH} groups`);
  }

  return issues.length ? { success: false, issues } : { success: true, data: parsed.data, reviewReasons };
}

export function createGrokBlockCompiler({
  apiKey = process.env.XAI_API_KEY,
  model = process.env.XAI_MODEL || "grok-4",
}: { apiKey?: string; model?: string } = {}): BlockCompiler {
  if (!apiKey) throw new Error("XAI_API_KEY is required to compile eligibility criteria");
  const client = new OpenAI({ apiKey, baseURL: "https://api.x.ai/v1" });

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
  for (const block of extractEligibilityBlocks(sourceText)) {
    try {
      const candidate = await compileBlock(block);
      const checked = validateCompiledTree(candidate, block);
      if (!checked.success) issues.push(...checked.issues);
      else {
        criteria.push(checked.data);
        reviewReasons.push(...checked.reviewReasons);
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

async function main(): Promise<void> {
  const inputPath = resolve(process.argv[2] || "data/raw/clinicaltrials-lung-cancer-recruiting.json");
  const fullBatch = process.argv.includes("--full");
  const outputPath = resolve(process.argv[3] || (fullBatch ? "data/compiled/trials.json" : "data/compiled/trials.smoke.json"));
  const rawTrials = z.array(RawClinicalTrial).parse(JSON.parse(await readFile(inputPath, "utf8")));
  const batch = fullBatch ? rawTrials : rawTrials.slice(0, 3);
  if (!fullBatch) console.log("Smoke test: compiling 3 trials. Re-run with --full only after reviewing this output.");
  const results = await compileRawTrials(batch, createGrokBlockCompiler(), {
    concurrency: Number(process.env.COMPILER_CONCURRENCY || "8"),
    onProgress: (completed, total) => console.log(`${completed}/${total} trials compiled`),
  });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  console.log(`Compiled ${results.length - results.filter((result) => result.failure).length}; rejected ${results.filter((result) => result.failure).length}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  void main();
}
