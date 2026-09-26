/** Read a filled blind-label CSV and reject anything that is not a contract EvalSet. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { EvalSet, Reason, Verdict, type EvalLabel } from "@/src/contracts";
import { LABELLING_COLUMNS } from "@/src/eval/make-sheet";

type ParsedRow = Record<string, string>;

/** CSV parser supporting the escaped quotes emitted by make-sheet.ts. */
export function parseCsv(text: string): ParsedRow[] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      records.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field");
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    records.push(row);
  }
  const [header, ...body] = records;
  if (!header) throw new Error("CSV is empty");
  if (header.join("\u0000") !== LABELLING_COLUMNS.join("\u0000")) {
    throw new Error(`CSV headers must be exactly: ${LABELLING_COLUMNS.join(", ")}`);
  }
  return body.filter((values) => values.some(Boolean)).map((values, rowIndex) => {
    if (values.length !== header.length) throw new Error(`CSV row ${rowIndex + 2} has ${values.length} values; expected ${header.length}`);
    return Object.fromEntries(header.map((name, index) => [name, values[index]]));
  });
}

export function labelsFromSheet(csv: string, labeller: string): EvalLabel[] {
  if (!labeller.trim()) throw new Error("labeller is required; never fabricate who made a human label");
  return EvalSet.parse(parseCsv(csv).map((row, index) => {
    const verdict = Verdict.safeParse(row.verdict);
    if (!verdict.success) throw new Error(`CSV row ${index + 2} needs a PASS, FAIL, or UNKNOWN verdict`);
    const reason = row.reason ? Reason.safeParse(row.reason) : undefined;
    if (reason && !reason.success) throw new Error(`CSV row ${index + 2} has an invalid reason`);
    return {
      patientId: row.patient_id,
      nctId: row.nct_id,
      criterionId: row.criterion_id,
      expected: verdict.data,
      expectedReason: reason?.data,
      labeller,
      note: row.notes || undefined,
    };
  }));
}

export async function ingestLabellingSheet({
  inputPath = "data/eval/labelling-sheet.csv",
  outputPath = "data/eval/labels.json",
  labeller,
}: {
  inputPath?: string;
  outputPath?: string;
  labeller: string;
}): Promise<EvalLabel[]> {
  const labels = labelsFromSheet(await readFile(resolve(inputPath), "utf8"), labeller);
  const path = resolve(outputPath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(labels, null, 2)}\n`, "utf8");
  return labels;
}

async function main(): Promise<void> {
  const inputPath = process.argv[2] || "data/eval/labelling-sheet.csv";
  const labellerFlag = process.argv.indexOf("--labeller");
  const labeller = labellerFlag >= 0 ? process.argv[labellerFlag + 1] : "";
  const outputFlag = process.argv.indexOf("--out");
  const outputPath = outputFlag >= 0 ? process.argv[outputFlag + 1] : "data/eval/labels.json";
  const labels = await ingestLabellingSheet({ inputPath, outputPath, labeller });
  console.log(`Validated and wrote ${labels.length} human labels to ${resolve(outputPath)}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  void main();
}
