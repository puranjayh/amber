/** Offline, batch-only eligibility compiler. Never import this from the app. */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
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
  sourceText: string;
}

export type BlockCompiler = (block: EligibilityBlock) => Promise<CriterionNodeValue>;

const responseSchema = z.object({ root: CriterionNode });
const responseJsonSchema = z.toJSONSchema(responseSchema, { target: "draft-7" });

const COMPILER_INSTRUCTIONS = `You compile clinical-trial eligibility protocol prose into ONE CriterionNode JSON object.

Return only JSON matching the supplied schema. Do not score a patient and do not infer facts.
Preserve boolean logic exactly: use nested {kind:"group", op:"AND"|"OR"|"NOT", children:[...]} nodes. Never flatten OR alternatives into a list of leaves. If the protocol says A and (B or C), the root is AND whose child is an OR group.
Every leaf must be grounded in a verbatim sourceSpan copied exactly from the supplied block. Set every leaf's type to the supplied block type, unless it is unknown.
Use only the contract predicates and operators. Do not invent clinical requirements. Keep prose that cannot be safely represented in countingRule, while retaining its exact sourceSpan.

Tier mapping: 0 = result from an existing specimen (usually biomarker/pathology); 1 = blood draw or in-clinic assessment (labs, ECOG, history); 2 = imaging; 3 = new invasive procedure/biopsy; 4 = time-bound/washout. Choose the lowest truthful resolution cost.
For EVERY numeric value leaf set sweepable:true, sweepRange:[low, high], and a positive sweepStep. The range must contain the threshold and be clinically useful around it (for example age >=18 -> [0,100], step 1; ANC >=1500 /uL -> [0,3000], step 100; creatinine clearance >=50 -> [0,150], step 5). Non-numeric leaves set sweepable:false and omit sweepRange/sweepStep.
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

/**
 * Enforces requirements that are intentionally stricter than the shared zod
 * type. It reports defects; it never fills in, changes, or flattens a tree.
 */
export function validateCompiledTree(
  candidate: unknown,
  block: EligibilityBlock,
): { success: true; data: CriterionNodeValue } | { success: false; issues: string[] } {
  const parsed = CriterionNode.safeParse(candidate);
  if (!parsed.success) return { success: false, issues: parsed.error.issues.map((issue) => issue.message) };

  const issues: string[] = [];
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
      if (!node.sweepable || !node.sweepRange || !node.sweepStep) {
        issues.push(`${node.id}: numeric leaf is missing sweep metadata`);
      } else if (
        !Number.isFinite(node.sweepRange[0]) ||
        !Number.isFinite(node.sweepRange[1]) ||
        node.sweepRange[0] >= node.sweepRange[1] ||
        node.value < node.sweepRange[0] ||
        node.value > node.sweepRange[1]
      ) {
        issues.push(`${node.id}: sweepRange must be an ordered range containing its threshold`);
      }
    } else if (node.sweepable || node.sweepRange || node.sweepStep) {
      issues.push(`${node.id}: non-numeric leaf has sweep metadata`);
    }
  });

  // This conservative sentinel catches the most costly common failure mode:
  // silently converting protocol alternatives into mandatory requirements.
  if (/\bor\b/i.test(block.sourceText) && !containsOr(parsed.data)) {
    issues.push("source text contains an alternative but compiled tree has no OR group");
  }

  return issues.length ? { success: false, issues } : { success: true, data: parsed.data };
}

export function createGrokBlockCompiler({
  apiKey = process.env.XAI_API_KEY,
  model = process.env.XAI_MODEL || "grok-4",
}: { apiKey?: string; model?: string } = {}): BlockCompiler {
  if (!apiKey) throw new Error("XAI_API_KEY is required to compile eligibility criteria");
  const client = new OpenAI({ apiKey, baseURL: "https://api.x.ai/v1" });

  return async (block) => {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0,
      messages: [
        { role: "developer", content: COMPILER_INSTRUCTIONS },
        { role: "user", content: `Block type: ${block.type}\n\nProtocol source:\n${block.sourceText}` },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "criterion_node",
          strict: true,
          schema: responseJsonSchema,
        },
      },
    });
    const content = completion.choices[0]?.message.content;
    if (!content) throw new Error("Grok returned no structured compilation");
    return responseSchema.parse(JSON.parse(content)).root;
  };
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
  for (const block of extractEligibilityBlocks(sourceText)) {
    try {
      const candidate = await compileBlock(block);
      const checked = validateCompiledTree(candidate, block);
      if (!checked.success) issues.push(...checked.issues);
      else criteria.push(checked.data);
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
    trial: Trial.parse({ ...base, criteria, compilerConfidence: 1, needsHumanReview: false }),
    sourceText,
  };
}

export async function compileRawTrials(
  rawTrials: RawClinicalTrial[],
  compileBlock: BlockCompiler,
): Promise<CompiledTrialResult[]> {
  const results: CompiledTrialResult[] = [];
  // Serial execution makes the API spend predictable and respects provider limits.
  for (const raw of rawTrials) results.push(await compileTrial(raw, compileBlock));
  return results;
}

async function main(): Promise<void> {
  const inputPath = resolve(process.argv[2] || "data/raw/clinicaltrials-lung-cancer-recruiting.json");
  const outputPath = resolve(process.argv[3] || "data/compiled/trials.json");
  const rawTrials = z.array(RawClinicalTrial).parse(JSON.parse(await readFile(inputPath, "utf8")));
  const results = await compileRawTrials(rawTrials, createGrokBlockCompiler());
  await writeFile(outputPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  console.log(`Compiled ${results.length - results.filter((result) => result.failure).length}; rejected ${results.filter((result) => result.failure).length}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  void main();
}
