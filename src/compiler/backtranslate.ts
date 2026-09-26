/**
 * Independent compiler defence: translate the structured tree back to prose
 * without exposing source spans, then compare it with the protocol's words.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import OpenAI from "openai";
import { z } from "zod";
import { Trial } from "@/src/contracts";
import type { CriterionLeaf, CriterionNode, Trial as TrialValue } from "@/src/contracts";
import type { CompiledTrialResult } from "@/src/compiler/compile";

export interface Backtranslation {
  id: string;
  type: "inclusion" | "exclusion";
  text: string;
}

export type Backtranslator = (treeWithoutSourceSpans: unknown) => Promise<Backtranslation[]>;

const BacktranslationResponse = z.object({
  criteria: z.array(z.object({
    id: z.string(),
    type: z.enum(["inclusion", "exclusion"]),
    text: z.string().min(1),
  })),
});
const backtranslationJsonSchema = z.toJSONSchema(BacktranslationResponse, { target: "draft-7" });

const BACKTRANSLATION_INSTRUCTIONS = `You are an independent safety checker. Render the supplied structured eligibility tree back into concise clinical English.

The source protocol is intentionally withheld. For every leaf return exactly its id, type, and one sentence describing its requirement. Preserve all numerical thresholds, units, comparators, values, alternatives, and especially polarity. An exclusion must remain a disqualifying condition; do not turn it into an inclusion. An inclusion that requires an absence must remain negative. Do not add or remove requirements. Return only the JSON schema response.`;

function stripSourceSpans(node: CriterionNode): unknown {
  if (node.kind === "leaf") {
    const { sourceSpan: _sourceSpan, ...leaf } = node;
    return leaf;
  }
  const { sourceSpan: _sourceSpan, children, ...group } = node;
  return { ...group, children: children.map(stripSourceSpans) };
}

function leaves(nodes: CriterionNode[]): CriterionLeaf[] {
  const result: CriterionLeaf[] = [];
  const visit = (node: CriterionNode): void => {
    if (node.kind === "leaf") result.push(node);
    else node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return result;
}

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "at", "be", "by", "for", "from", "has", "have", "in", "is", "of", "on", "or", "patient", "patients", "the", "to", "with", "years", "year",
]);
const NEGATION = /\b(no|not|without|never|exclude|excluded|prohibit|prohibited|absence|negative)\b/i;

function meaningfulTerms(text: string): Set<string> {
  return new Set(
    text.toLowerCase().match(/[a-z]+\d*|\d+(?:\.\d+)?/g)?.filter((word) => word.length > 2 && !STOP_WORDS.has(word)) ?? [],
  );
}

/**
 * The diff intentionally prioritizes safety-critical content over wording:
 * numbers, named clinical terms, leaf polarity, and inclusion/exclusion type.
 */
export function diffSourceSpan(leaf: CriterionLeaf, rendering: Backtranslation | undefined): string[] {
  if (!rendering) return [`${leaf.id}: backtranslation did not return this criterion`];
  const issues: string[] = [];
  if (rendering.type !== leaf.type) issues.push(`${leaf.id}: criterion type changed in backtranslation`);

  const sourceNumbers = leaf.sourceSpan.match(/\d+(?:\.\d+)?/g) ?? [];
  const renderedNumbers = rendering.text.match(/\d+(?:\.\d+)?/g) ?? [];
  if (sourceNumbers.join("|") !== renderedNumbers.join("|")) {
    issues.push(`${leaf.id}: numeric threshold or unit divergence`);
  }
  if (NEGATION.test(leaf.sourceSpan) !== NEGATION.test(rendering.text)) {
    issues.push(`${leaf.id}: polarity divergence`);
  }

  const sourceTerms = meaningfulTerms(leaf.sourceSpan);
  const renderedTerms = meaningfulTerms(rendering.text);
  const missingTerms = [...sourceTerms].filter((term) => term.length >= 5 && !renderedTerms.has(term));
  if (missingTerms.length) issues.push(`${leaf.id}: missing clinical terms: ${missingTerms.join(", ")}`);
  return issues;
}

export function createGrokBacktranslator({
  apiKey = process.env.XAI_BACKTRANSLATION_API_KEY || process.env.XAI_API_KEY,
  model = process.env.XAI_BACKTRANSLATION_MODEL || process.env.XAI_MODEL || "grok-4",
}: { apiKey?: string; model?: string } = {}): Backtranslator {
  const hasSecondKey = Boolean(process.env.XAI_BACKTRANSLATION_API_KEY);
  const compilerModel = process.env.XAI_MODEL || "grok-4";
  if (!apiKey) throw new Error("XAI_API_KEY is required to backtranslate criteria");
  if (hasSecondKey && (!process.env.XAI_BACKTRANSLATION_MODEL || model === compilerModel)) {
    throw new Error("XAI_BACKTRANSLATION_MODEL must be a different model when a second xAI key is configured");
  }
  const client = new OpenAI({ apiKey, baseURL: "https://api.x.ai/v1" });

  return async (treeWithoutSourceSpans) => {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0,
      messages: [
        { role: "developer", content: BACKTRANSLATION_INSTRUCTIONS },
        { role: "user", content: JSON.stringify(treeWithoutSourceSpans) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "backtranslation", strict: true, schema: backtranslationJsonSchema },
      },
    });
    const content = completion.choices[0]?.message.content;
    if (!content) throw new Error("Grok returned no backtranslation");
    return BacktranslationResponse.parse(JSON.parse(content)).criteria;
  };
}

export async function backtranslateTrial(
  result: CompiledTrialResult,
  backtranslate: Backtranslator,
): Promise<CompiledTrialResult> {
  if (result.failure || result.trial.needsHumanReview) return result;
  try {
    const translations = await backtranslate(result.trial.criteria.map(stripSourceSpans));
    const byId = new Map(translations.map((translation) => [translation.id, translation]));
    const issues = leaves(result.trial.criteria).flatMap((leaf) => diffSourceSpan(leaf, byId.get(leaf.id)));
    if (!issues.length) return result;
    return {
      ...result,
      trial: Trial.parse({ ...result.trial, needsHumanReview: true }),
      failure: { nctId: result.trial.nctId, issues },
    };
  } catch (error) {
    return {
      ...result,
      trial: Trial.parse({ ...result.trial, needsHumanReview: true }),
      failure: { nctId: result.trial.nctId, issues: [error instanceof Error ? error.message : "unknown backtranslation error"] },
    };
  }
}

export async function backtranslateTrials(
  results: CompiledTrialResult[],
  backtranslate: Backtranslator,
): Promise<CompiledTrialResult[]> {
  const checked: CompiledTrialResult[] = [];
  for (const result of results) checked.push(await backtranslateTrial(result, backtranslate));
  return checked;
}

async function main(): Promise<void> {
  const inputPath = resolve(process.argv[2] || "data/compiled/trials.json");
  const outputPath = resolve(process.argv[3] || "data/compiled/trials.backtranslated.json");
  const results = JSON.parse(await readFile(inputPath, "utf8")) as CompiledTrialResult[];
  const checked = await backtranslateTrials(results, createGrokBacktranslator());
  await writeFile(outputPath, `${JSON.stringify(checked, null, 2)}\n`, "utf8");
  console.log(`Backtranslation flagged ${checked.filter((result) => result.trial.needsHumanReview).length} of ${checked.length} trials`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  void main();
}
