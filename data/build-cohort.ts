/**
 * Synthetic lung-cancer cohort for NCT02496663 and NCT06281964.
 *
 * Patients are not real. Marker draws are seeded. Run from the repo root:
 *   npx tsx data/build-cohort.ts
 *
 * Writes fixtures/cohort.json and fixtures/COHORT.md. The markdown reports
 * what this run produced.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { PatientsFixture, Trial, type CriterionLeaf, type Fact, type Patient, type Trial as TrialT } from "@/src/contracts";
import { allLeaves, evaluate } from "@/src/engine/evaluate";

const AS_OF = "2026-09-25";
const SEED = 20260926;
const N = 150;

const STAGE_VALUE =
  "stage IV or recurrent/metastatic histologically confirmed non-small cell lung cancer (NSCLC)";

const EGFR_SUBTYPES: [string, number][] = [
  ["Exon 19 deletion", 0.52],
  ["Exon 21 L858R", 0.4],
  ["Exon 18 G719X", 0.03],
  ["Exon 21 L861Q", 0.025],
  ["EGFR Exon 20 insertion", 0.025],
];

/** Protocol-visible labs. Dropping one of these opens a cell on NCT02496663. */
const VISIBLE_LABS = [
  "Absolute neutrophil count",
  "Platelets",
  "Total bilirubin",
  "AST/ALT",
  "Creatinine clearance",
  "QTcF",
  "LVEF",
] as const;

type Bucket = "complete" | "gaps" | "several" | "eliminated";
type SiteKind = "academic" | "community";
type ElimReason = "egfr-negative" | "no-tki" | "ecog" | "anc" | "crcl" | "bilirubin" | "ild";

interface Site {
  kind: SiteKind;
  name: string;
  zip: string;
  travel: [number, number];
}

const ACADEMIC: Site[] = [
  { kind: "academic", name: "Synthetic academic centre, Boston", zip: "02115", travel: [12, 35] },
  { kind: "academic", name: "Synthetic academic centre, New York", zip: "10065", travel: [15, 40] },
  { kind: "academic", name: "Synthetic academic centre, Houston", zip: "77030", travel: [18, 45] },
  { kind: "academic", name: "Synthetic academic centre, Durham", zip: "27710", travel: [15, 40] },
];

const COMMUNITY: Site[] = [
  { kind: "community", name: "Synthetic community oncology, Springfield", zip: "01103", travel: [55, 130] },
  { kind: "community", name: "Synthetic community oncology, Fresno", zip: "93721", travel: [80, 170] },
  { kind: "community", name: "Synthetic community oncology, Boise", zip: "83702", travel: [70, 150] },
  { kind: "community", name: "Synthetic community oncology, Macon", zip: "31201", travel: [60, 140] },
];

const FIRST_GEN = ["erlotinib", "gefitinib", "afatinib"] as const;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

function weighted<T>(rng: () => number, pairs: readonly [T, number][]): T {
  let r = rng();
  for (const [item, w] of pairs) {
    r -= w;
    if (r <= 0) return item;
  }
  return pairs[pairs.length - 1]![0];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function pretty(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${d} ${months[(m ?? 1) - 1]} ${y}`;
}

function fact(partial: Omit<Fact, "provenance"> & { provenance?: Fact["provenance"] }): Fact {
  return { provenance: "chart", ...partial };
}

function loadTrial(nctId: string): TrialT {
  const raw = JSON.parse(readFileSync("data/compiled/trials.json", "utf8")) as unknown[];
  for (const row of raw) {
    const trial =
      row && typeof row === "object" && "trial" in row
        ? (row as { trial: unknown }).trial
        : row;
    if (trial && typeof trial === "object" && (trial as { nctId?: string }).nctId === nctId) {
      const parsed = Trial.safeParse(trial);
      if (!parsed.success) throw new Error(`${nctId} failed Trial schema: ${parsed.error.message}`);
      return parsed.data;
    }
  }
  throw new Error(`missing compiled trial ${nctId}`);
}

interface Spec {
  site: Site;
  bucket: Bucket;
  reason?: ElimReason;
}

function assignSpecs(rng: () => number): Spec[] {
  const specs: Spec[] = [];
  const academicPool = ACADEMIC;
  const communityPool = COMMUNITY;
  const fill = (kind: SiteKind, counts: Record<Bucket, number>) => {
    const sites = kind === "academic" ? academicPool : communityPool;
    const rows: Spec[] = [];
    (Object.keys(counts) as Bucket[]).forEach((bucket) => {
      for (let i = 0; i < counts[bucket]; i++) rows.push({ site: pick(rng, sites), bucket });
    });
    for (let i = rows.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [rows[i], rows[j]] = [rows[j]!, rows[i]!];
    }
    specs.push(...rows);
  };
  fill("academic", { complete: 15, gaps: 27, several: 12, eliminated: 6 });
  fill("community", { complete: 7, gaps: 25, several: 33, eliminated: 25 });

  const reasons: ElimReason[] = [
    ...Array<ElimReason>(10).fill("egfr-negative"),
    ...Array<ElimReason>(6).fill("no-tki"),
    ...Array<ElimReason>(4).fill("ecog"),
    ...Array<ElimReason>(4).fill("anc"),
    ...Array<ElimReason>(3).fill("crcl"),
    ...Array<ElimReason>(2).fill("bilirubin"),
    ...Array<ElimReason>(2).fill("ild"),
  ];
  for (let i = reasons.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [reasons[i], reasons[j]] = [reasons[j]!, reasons[i]!];
  }
  let r = 0;
  for (const spec of specs) {
    if (spec.bucket === "eliminated") spec.reason = reasons[r++]!;
  }
  if (r !== reasons.length) throw new Error(`elim reasons ${r} != ${reasons.length}`);
  return specs;
}

function egfrSubtype(rng: () => number): string {
  return weighted(rng, EGFR_SUBTYPES);
}

function buildPatient(rng: () => number, spec: Spec, seq: number): Patient {
  const egfrPositive = spec.bucket !== "several" && spec.reason !== "egfr-negative";
  const subtype = egfrPositive ? egfrSubtype(rng) : null;
  const femaleP = egfrPositive ? 0.62 : 0.42;
  const sex: Patient["sex"] = rng() < femaleP ? "F" : "M";
  const age = Math.round(clamp((egfrPositive ? 64 : 69) + 8.5 * gauss(rng), 42, 88));
  const race = weighted(rng, [
    ["White", 0.72],
    ["Black or African American", 0.13],
    ["Asian", 0.1],
    ["Other", 0.04],
    ["American Indian or Alaska Native", 0.01],
  ] as [string, number][]);
  const ethnicity = rng() < 0.09 ? "Hispanic or Latino" : "Not Hispanic or Latino";
  const histology = weighted(rng, egfrPositive
    ? ([["adenocarcinoma", 0.9], ["adenosquamous carcinoma", 0.05], ["non-small cell lung cancer, NOS", 0.05]] as [string, number][])
    : ([["adenocarcinoma", 0.55], ["squamous cell carcinoma", 0.3], ["large cell carcinoma", 0.08], ["non-small cell lung cancer, NOS", 0.07]] as [string, number][]));
  const ajcc = weighted(rng, [["IVA", 0.46], ["IVB", 0.28], ["IIIB", 0.16], ["IIIC", 0.1]] as [string, number][]);
  const siteKind = spec.site.kind === "academic" ? "academic centre" : "community oncology";
  const id = `LC-${spec.site.kind === "academic" ? "A" : "C"}-${String(seq).padStart(3, "0")}`;

  const pathDate = addDays("2026-03-01", Math.floor(rng() * 120));
  const stageDate = addDays(pathDate, 7 + Math.floor(rng() * 40));
  const panelDate = addDays("2026-05-02", Math.floor(rng() * 28));
  // Newest biomarker fact wins for every unscoped biomarker leaf. EGFR has to be last
  // or a numeric PD-L1 / TMB result makes the mutation leaves unsupported.
  const egfrDate = addDays(panelDate, 40);
  const labDate = addDays("2026-09-08", Math.floor(rng() * 10));
  const ecogDate = addDays(labDate, -2);
  const ecgDate = addDays(labDate, 3);
  const surgeryDate = addDays(AS_OF, -(70 + Math.floor(rng() * 40)));

  const facts: Fact[] = [];

  facts.push(fact({
    predicate: "diagnosis",
    value: histology,
    observedAt: pathDate,
    sourceQuote: `Synthetic chart. ${spec.site.name}. Pathology ${pretty(pathDate)}: ${histology}.`,
    sourceDoc: `synthetic pathology ${pathDate}, ${siteKind}`,
  }));

  facts.push(fact({
    predicate: "staging",
    value: STAGE_VALUE,
    observedAt: stageDate,
    sourceQuote: `Synthetic chart. PET-CT ${pretty(stageDate)}: ${STAGE_VALUE}. AJCC ${ajcc}.`,
    sourceDoc: `synthetic PET-CT ${stageDate}, ${siteKind}`,
  }));

  const ecog = spec.reason === "ecog" ? (rng() < 0.7 ? 2 : 3) : rng() < 0.4 ? 0 : 1;
  facts.push(fact({
    predicate: "performance_status",
    analyte: "ECOG",
    value: ecog,
    unit: "score",
    observedAt: ecogDate,
    sourceQuote: `Synthetic chart. Clinic note ${pretty(ecogDate)}: ECOG performance status ${ecog}.`,
    sourceDoc: `synthetic clinic note ${ecogDate}, ${siteKind}`,
  }));

  const drop = new Set<string>();
  if (spec.bucket === "gaps") {
    // One protocol-visible lab. With the half-lives leaf that is two unknowns.
    const pool = [...VISIBLE_LABS];
    drop.add(pool[Math.floor(rng() * pool.length)]!);
  }
  if (spec.bucket === "several") {
    const k = spec.site.kind === "community" ? 3 + (rng() < 0.5 ? 1 : 0) : 2 + (rng() < 0.4 ? 1 : 0);
    const pool = [...VISIBLE_LABS, "albumin", "creatinine"];
    for (let i = 0; i < k && pool.length; i++) {
      drop.add(pool.splice(Math.floor(rng() * pool.length), 1)[0]!);
    }
    if (rng() < (spec.site.kind === "community" ? 0.45 : 0.2)) drop.add("ECG");
    if (rng() < (spec.site.kind === "community" ? 0.35 : 0.12)) drop.add("washout");
    if (rng() < (spec.site.kind === "community" ? 0.3 : 0.1)) drop.add("prior");
  }

  const ancMean = spec.site.kind === "academic" ? 4800 : 4100;
  let anc = Math.round(clamp(ancMean + 1500 * gauss(rng), 1600, 14000) / 10) * 10;
  if (spec.reason === "anc") anc = Math.round(clamp(1100 + 180 * gauss(rng), 700, 1450) / 10) * 10;
  const pltMean = spec.site.kind === "academic" ? 242000 : 214000;
  const platelets = Math.round(clamp(pltMean + 68000 * gauss(rng), 110000, 460000) / 1000) * 1000;
  let bili = Number(clamp((spec.site.kind === "academic" ? 0.55 : 0.68) + 0.22 * gauss(rng), 0.2, 1.4).toFixed(2));
  if (spec.reason === "bilirubin") bili = Number(clamp(2.1 + 0.4 * gauss(rng), 1.6, 3.4).toFixed(2));
  const ast = Number(clamp((spec.site.kind === "academic" ? 0.85 : 1.05) + 0.35 * gauss(rng), 0.3, 2.8).toFixed(2));
  let crcl = Math.round(clamp((spec.site.kind === "academic" ? 86 : 74) - (age - 60) * 0.7 + 14 * gauss(rng), 52, 130));
  if (spec.reason === "crcl") crcl = Math.round(clamp(38 + 6 * gauss(rng), 22, 48));
  const creatinine = Number(clamp((sex === "F" ? 0.82 : 0.98) + 0.22 * gauss(rng) + (age - 65) * 0.008, 0.4, 2.8).toFixed(2));
  const albumin = Number(clamp((spec.site.kind === "academic" ? 4.0 : 3.6) + 0.4 * gauss(rng), 2.3, 5.0).toFixed(1));
  const qtc = Math.round(clamp(428 + 16 * gauss(rng), 370, 460));
  const lvef = Math.round(clamp((spec.site.kind === "academic" ? 61 : 58) + 6 * gauss(rng), 50, 75));

  const labs: { analyte: string; value: number; unit: string; quote: string }[] = [
    { analyte: "Absolute neutrophil count", value: anc, unit: "/mcL", quote: `CBC ${pretty(labDate)}: absolute neutrophil count ${anc.toLocaleString("en-US")}/mcL.` },
    { analyte: "Platelets", value: platelets, unit: "/mcL", quote: `CBC ${pretty(labDate)}: platelets ${platelets.toLocaleString("en-US")}/mcL.` },
    { analyte: "Total bilirubin", value: bili, unit: "x ULN", quote: `Total bilirubin ${bili} × ULN on ${pretty(labDate)}.` },
    { analyte: "AST/ALT", value: ast, unit: "x ULN", quote: `AST/ALT ${ast} × ULN on ${pretty(labDate)}.` },
    { analyte: "Creatinine clearance", value: crcl, unit: "mL/min", quote: `Creatinine clearance ${crcl} mL/min on ${pretty(labDate)}.` },
    { analyte: "creatinine", value: creatinine, unit: "mg/dL", quote: `Serum creatinine ${creatinine} mg/dL on ${pretty(labDate)}.` },
    { analyte: "albumin", value: albumin, unit: "g/dL", quote: `Serum albumin ${albumin} g/dL on ${pretty(labDate)}.` },
    { analyte: "QTcF", value: qtc, unit: "msec", quote: `ECG ${pretty(labDate)}: QTcF ${qtc} msec.` },
    { analyte: "LVEF", value: lvef, unit: "%", quote: `Echocardiogram ${pretty(labDate)}: LVEF ${lvef}%.` },
  ];
  for (const lab of labs) {
    if (drop.has(lab.analyte)) continue;
    facts.push(fact({
      predicate: "lab_value",
      analyte: lab.analyte,
      value: lab.value,
      unit: lab.unit,
      observedAt: labDate,
      sourceQuote: `Synthetic chart. ${lab.quote}`,
      sourceDoc: `synthetic lab ${labDate}, ${siteKind}`,
    }));
  }

  if (!drop.has("ECG")) {
    facts.push(fact({
      predicate: "lab_value",
      value: false,
      observedAt: ecgDate,
      sourceQuote: `Synthetic chart. ECG ${pretty(ecgDate)}: no clinically important abnormality of rhythm, conduction, or morphology.`,
      sourceDoc: `synthetic ECG ${ecgDate}, ${siteKind}`,
    }));
  }

  if (spec.reason === "ild") {
    facts.push(fact({
      predicate: "comorbidity",
      value: true,
      observedAt: ecogDate,
      sourceQuote: `Synthetic chart. Oncology note ${pretty(ecogDate)}: clinically active interstitial lung disease.`,
      sourceDoc: `synthetic oncology note ${ecogDate}, ${siteKind}`,
    }));
  } else {
    facts.push(fact({
      predicate: "comorbidity",
      value: false,
      observedAt: ecogDate,
      sourceQuote: `Synthetic chart. Oncology note ${pretty(ecogDate)}: no interstitial lung disease, no second active malignancy, no uncontrolled intercurrent illness, no HIV on antiretroviral therapy.`,
      sourceDoc: `synthetic oncology note ${ecogDate}, ${siteKind}`,
    }));
  }

  facts.push(fact({
    predicate: "contraindication",
    value: false,
    observedAt: ecogDate,
    sourceQuote: `Synthetic chart. Consent signed ${pretty(ecogDate)}. Not pregnant. No potent CYP3A4 inducer.`,
    sourceDoc: `synthetic oncology note ${ecogDate}, ${siteKind}`,
  }));

  if (!drop.has("washout")) {
    facts.push(fact({
      predicate: "washout",
      value: surgeryDate,
      unit: "days",
      observedAt: surgeryDate,
      sourceQuote: `Synthetic chart. Last major surgery ${pretty(surgeryDate)}, more than 21 days before this screen.`,
      sourceDoc: `synthetic operative note ${surgeryDate}, ${siteKind}`,
    }));
  }

  if (!drop.has("prior")) {
    const lines: { name: string; drugClass?: string; date: string }[] = [];
    if (spec.reason !== "no-tki") {
      const tki = pick(rng, FIRST_GEN);
      lines.push({ name: tki, drugClass: "anti-EGFR TKI", date: addDays("2026-01-10", Math.floor(rng() * 40)) });
      if (rng() < 0.18) {
        lines.push({ name: "osimertinib", drugClass: "anti-EGFR TKI", date: addDays("2026-05-01", Math.floor(rng() * 40)) });
      }
    } else {
      lines.push({ name: pick(rng, ["pembrolizumab", "nivolumab", "atezolizumab"] as const), date: addDays("2026-02-01", Math.floor(rng() * 30)) });
    }
    const platinum = histology.startsWith("squamous") ? "paclitaxel" : "pemetrexed";
    if (rng() < 0.8 || spec.reason === "no-tki") {
      lines.push({ name: rng() < 0.75 ? "carboplatin" : "cisplatin", date: addDays("2025-11-01", Math.floor(rng() * 50)) });
      lines.push({ name: platinum, date: addDays("2025-11-01", Math.floor(rng() * 50)) });
    }
    if (rng() < 0.35) lines.push({ name: "docetaxel", date: addDays("2026-04-01", Math.floor(rng() * 40)) });
    if (rng() < 0.12) lines.push({ name: "bevacizumab", date: addDays("2026-01-20", Math.floor(rng() * 30)) });
    for (const line of lines) {
      facts.push(fact({
        predicate: "prior_therapy",
        value: line.name,
        drugClass: line.drugClass,
        observedAt: line.date,
        sourceQuote: line.drugClass
          ? `Synthetic chart. Medication history: ${line.name}, an EGFR tyrosine kinase inhibitor, recorded ${pretty(line.date)}.`
          : `Synthetic chart. Medication history: ${line.name}, recorded ${pretty(line.date)}.`,
        sourceDoc: `synthetic oncology note ${line.date}, ${siteKind}`,
      }));
    }
  }

  if (spec.bucket !== "several") {
    const markers: [string, string, number][] = [
      ["KRAS", "G12C", 0.1182],
      ["KRAS", "mutation", 0.2887 - 0.1182],
      ["BRAF", "V600E", 0.0423],
      ["ALK", "rearrangement", 0.0241],
      ["ROS1", "rearrangement", 0.0067],
      ["RET", "rearrangement", 0.0067],
      ["NTRK", "fusion", 0.0016],
      ["ERBB2", "mutation", 0.0171],
      ["MET", "mutation", 0.0238],
      ["MET", "amplification", 0.0271],
      ["MET", "exon 14 skipping", 0.03],
      ["STK11", "mutation", 0.1229],
      ["KEAP1", "mutation", 0.0592],
    ];
    let day = 0;
    const krasHit = rng();
    for (const [analyte, alteration, p] of markers) {
      day += 1;
      let positive = rng() < p;
      if (analyte === "KRAS" && alteration === "mutation") positive = krasHit >= 0.1182 && krasHit < 0.2887;
      if (analyte === "KRAS" && alteration === "G12C") positive = krasHit < 0.1182;
      const value = positive ? alteration : "negative";
      facts.push(fact({
        predicate: "biomarker",
        analyte,
        value,
        observedAt: addDays(panelDate, day),
        sourceQuote: positive
          ? `Synthetic chart. Comprehensive genomic profile ${pretty(panelDate)}: ${analyte} ${alteration}.`
          : `Synthetic chart. Comprehensive genomic profile ${pretty(panelDate)}: ${analyte} negative.`,
        sourceDoc: `synthetic NGS ${panelDate}, ${siteKind}`,
      }));
    }
    const tps = rng() < 0.3053 ? Math.round(50 + rng() * 50) : Math.round(rng() * 49);
    facts.push(fact({
      predicate: "biomarker",
      analyte: "PD-L1",
      value: tps,
      unit: "%",
      observedAt: addDays(panelDate, 20),
      sourceQuote: `Synthetic chart. PD-L1 IHC (22C3) ${pretty(panelDate)}: TPS ${tps}%.`,
      sourceDoc: `synthetic IHC ${panelDate}, ${siteKind}`,
    }));
    const tmb = rng() < 0.3665 ? Number((10 + rng() * 25).toFixed(1)) : Number((rng() * 9.9).toFixed(1));
    facts.push(fact({
      predicate: "biomarker",
      analyte: "TMB",
      value: tmb,
      unit: "mutations/Mb",
      observedAt: addDays(panelDate, 21),
      sourceQuote: `Synthetic chart. Tumor mutational burden ${pretty(panelDate)}: ${tmb} mutations/Mb.`,
      sourceDoc: `synthetic NGS ${panelDate}, ${siteKind}`,
    }));
    if (subtype && spec.reason !== "no-tki" && rng() < 0.5) {
      const t790Date = addDays(egfrDate, -5);
      facts.push(fact({
        predicate: "biomarker",
        analyte: "EGFR",
        value: "T790M",
        observedAt: t790Date,
        sourceQuote: `Synthetic chart. Plasma ${pretty(t790Date)}: EGFR T790M detected after a first-generation EGFR TKI.`,
        sourceDoc: `synthetic plasma NGS ${t790Date}, ${siteKind}`,
      }));
    }
    facts.push(fact({
      predicate: "biomarker",
      analyte: "EGFR",
      value: subtype ?? "EGFR negative",
      observedAt: egfrDate,
      sourceQuote: subtype
        ? `Synthetic chart. NGS ${pretty(egfrDate)}: EGFR ${subtype}.`
        : `Synthetic chart. NGS ${pretty(egfrDate)}: EGFR negative. No activating EGFR mutation detected.`,
      sourceDoc: `synthetic NGS ${egfrDate}, ${siteKind}`,
    }));
  }

  const travelMinutes = spec.site.travel[0] + Math.floor(rng() * (spec.site.travel[1] - spec.site.travel[0] + 1));
  return { id, age, sex, race, ethnicity, zip: spec.site.zip, travelMinutes, facts };
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! * (hi - idx) + sorted[hi]! * (idx - lo);
}

function summarize(values: number[]): string {
  if (values.length === 0) return "n=0";
  const s = [...values].sort((a, b) => a - b);
  const fmt = (n: number) => (Math.abs(n) >= 100 ? Math.round(n).toLocaleString("en-US") : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
  return `n=${s.length}, median ${fmt(quantile(s, 0.5))}, IQR ${fmt(quantile(s, 0.25))}–${fmt(quantile(s, 0.75))}, min ${fmt(s[0]!)}, max ${fmt(s[s.length - 1]!)}`;
}

function siteOf(id: string): SiteKind {
  return id.startsWith("LC-A-") ? "academic" : "community";
}

function newestEgfr(patient: Patient): Fact | undefined {
  const rows = patient.facts.filter((f) => f.predicate === "biomarker" && f.analyte === "EGFR" && f.value !== "T790M");
  return rows.sort((a, b) => (a.observedAt < b.observedAt ? 1 : -1))[0];
}

function hasAnalyte(patient: Patient, analyte: string): boolean {
  return patient.facts.some((f) => f.analyte === analyte);
}

function labValues(patients: Patient[], analyte: string, site: SiteKind): number[] {
  return patients
    .filter((p) => siteOf(p.id) === site)
    .flatMap((p) => p.facts.filter((f) => f.analyte === analyte && typeof f.value === "number").map((f) => f.value as number));
}

function toneGreen(verdict: string, type: "inclusion" | "exclusion"): boolean {
  if (verdict === "UNKNOWN") return false;
  return type === "inclusion" ? verdict === "PASS" : verdict === "FAIL";
}

function leafType(trial: TrialT, id: string): "inclusion" | "exclusion" | undefined {
  return allLeaves(trial).find((leaf) => leaf.id === id)?.type;
}

function main() {
  const rng = mulberry32(SEED);
  const specs = assignSpecs(rng);
  let aSeq = 1;
  let cSeq = 1;
  const built = specs.map((spec) => {
    const seq = spec.site.kind === "academic" ? aSeq++ : cSeq++;
    return { spec, patient: buildPatient(rng, spec, seq) };
  });

  const parsed = PatientsFixture.safeParse(built.map((row) => row.patient));
  if (!parsed.success) {
    console.error(parsed.error.issues.slice(0, 8));
    throw new Error(`cohort failed PatientsFixture (${parsed.error.issues.length} issues)`);
  }
  const patients = parsed.data;
  if (patients.length !== N) throw new Error(`expected ${N}, got ${patients.length}`);

  const second = loadTrial("NCT02496663");
  const first = loadTrial("NCT06281964");
  const secondLeaves = allLeaves(second);

  const scored = patients.map((patient, i) => {
    const pair = evaluate(patient, second, AS_OF);
    const green = pair.cells.filter((cell) => {
      const type = leafType(second, cell.criterionId);
      return type ? toneGreen(cell.verdict, type) : false;
    }).length;
    return { spec: built[i]!.spec, patient, pair, green, total: secondLeaves.length };
  });

  const complete = scored.filter((row) => row.spec.bucket === "complete");
  const badComplete = complete.filter((row) => row.pair.eliminated || row.pair.unknownCount !== 1);
  const gaps = scored.filter((row) => row.spec.bucket === "gaps");
  const badGaps = gaps.filter((row) => row.pair.eliminated || row.pair.unknownCount !== 2);
  const badElim = scored.filter((row) => row.spec.bucket === "eliminated" && !row.pair.eliminated);
  const badOpen = scored.filter((row) => row.spec.bucket !== "eliminated" && row.pair.eliminated);
  if (badComplete.length || badGaps.length || badElim.length || badOpen.length) {
    const sample = badComplete[0] ?? badGaps[0] ?? badElim[0] ?? badOpen[0]!;
    console.error(
      sample.patient.id,
      sample.spec.bucket,
      sample.spec.reason,
      "elim",
      sample.pair.eliminated,
      "unk",
      sample.pair.unknownCount,
      sample.pair.cells.filter((c) => c.verdict === "UNKNOWN").map((c) => `${c.criterionId}:${c.reason}`),
    );
    throw new Error(
      `bucket check failed: complete ${badComplete.length}, gaps ${badGaps.length}, elim-not-eliminated ${badElim.length}, open-eliminated ${badOpen.length}`,
    );
  }

  writeFileSync("fixtures/cohort.json", JSON.stringify(patients, null, 2) + "\n");

  const md = renderReport(scored, second, first);
  writeFileSync("fixtures/COHORT.md", md);
  const top = scored
    .filter((row) => !row.pair.eliminated)
    .sort((a, b) => a.pair.unknownCount - b.pair.unknownCount || a.patient.id.localeCompare(b.patient.id))
    .slice(0, 8);
  console.log(
    JSON.stringify(
      {
        n: patients.length,
        badComplete: badComplete.length,
        top: top.map((row) => `${row.patient.id} ${row.green}/${row.total} unk=${row.pair.unknownCount} elim=${row.pair.eliminated}`),
        unk: countBy(scored, (row) => `${row.pair.eliminated ? "elim" : "open"}:${row.pair.unknownCount}`),
      },
      null,
      2,
    ),
  );
}

function countBy<T>(rows: T[], key: (row: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) out[key(row)] = (out[key(row)] ?? 0) + 1;
  return out;
}

function pct(n: number, d: number): string {
  if (d === 0) return "n/a";
  return `${((100 * n) / d).toFixed(1)}%`;
}

type Scored = {
  spec: Spec;
  patient: Patient;
  pair: ReturnType<typeof evaluate>;
  green: number;
  total: number;
};

function renderReport(scored: Scored[], second: TrialT, first: TrialT): string {
  const patients = scored.map((row) => row.patient);
  const n = patients.length;
  const academic = patients.filter((p) => siteOf(p.id) === "academic");
  const community = patients.filter((p) => siteOf(p.id) === "community");

  const egfrOf = (p: Patient): "positive" | "negative" | "absent" => {
    const factRow = newestEgfr(p);
    if (!factRow) return "absent";
    return factRow.value === "EGFR negative" ? "negative" : "positive";
  };
  const tested = patients.filter((p) => egfrOf(p) !== "absent");
  const positive = tested.filter((p) => egfrOf(p) === "positive");
  const negative = tested.filter((p) => egfrOf(p) === "negative");
  const absent = patients.filter((p) => egfrOf(p) === "absent");

  const subtypeCounts: Record<string, number> = {};
  for (const p of positive) {
    const value = String(newestEgfr(p)?.value);
    subtypeCounts[value] = (subtypeCounts[value] ?? 0) + 1;
  }

  const open = scored.filter((row) => !row.pair.eliminated);
  const eliminated = scored.filter((row) => row.pair.eliminated);
  const unk1 = open.filter((row) => row.pair.unknownCount === 1);
  const unk2 = open.filter((row) => row.pair.unknownCount === 2);
  const unkSeveral = open.filter((row) => row.pair.unknownCount >= 3);

  const lines: string[] = [];
  lines.push("# Lung cohort");
  lines.push("");
  lines.push("These patients are synthetic. None of them is a real record. The prevalences they are compared with are the cited figures in `data/prevalence.json` (Huang et al., Pathol Oncol Res. 2021; Fois et al., Int J Mol Sci. 2021). A worklist that can be screened is the point of the file. It is not a claim that 150 consecutive clinic charts look like this.");
  lines.push("");
  lines.push("The four hand-built demo charts stay in `fixtures/demo-patients.json` (PT-4410, PT-4411, PT-4412, PT-4413). They are not copied into this file. Loaders that want them pinned merge that file ahead of `fixtures/cohort.json`.");
  lines.push("");
  lines.push(`Seed ${SEED}. Evaluation date ${AS_OF}. ${n} patients: ${academic.length} academic centre (\`LC-A-\`), ${community.length} community oncology (\`LC-C-\`).`);
  lines.push("");
  lines.push("## What the engine did on NCT02496663");
  lines.push("");
  lines.push("Osimertinib and necitumumab, 27 leaves. Favourable means an inclusion passed or an exclusion cleared. The four EGFR mutation leaves are an OR: one match keeps the patient in, and the other four leaves still count as not met.");
  lines.push("");
  lines.push(`| Outcome on NCT02496663 | n | share |`);
  lines.push(`|---|---:|---:|`);
  lines.push(`| Not eliminated, 1 unknown | ${unk1.length} | ${pct(unk1.length, n)} |`);
  lines.push(`| Not eliminated, 2 unknowns | ${unk2.length} | ${pct(unk2.length, n)} |`);
  lines.push(`| Not eliminated, 3 or more unknowns | ${unkSeveral.length} | ${pct(unkSeveral.length, n)} |`);
  lines.push(`| Eliminated | ${eliminated.length} | ${pct(eliminated.length, n)} |`);
  lines.push("");
  lines.push("The aim was about 15% fully worked up, 35% with one or two unknowns, 30% with several, and 20% eliminated on a real contradiction. The table above is the engine, not the aim.");
  lines.push("");
  if (unk1.length) {
    const sample = unk1[0]!;
    const unknown = sample.pair.cells.filter((c) => c.verdict === "UNKNOWN").map((c) => c.criterionId);
    lines.push(`A fully charted patient still has ${sample.pair.unknownCount} unknown (${unknown.join(", ")}). EXC-3 asks for a washout in half-lives and EXC-1/EXC-2 ask for days. The engine keeps a single newest washout fact, so a day count that clears the surgery leaves cannot also answer the half-lives leaf. That cell stays UNKNOWN rather than being forced to a number that would eliminate the patient.`);
    lines.push("");
    lines.push(`Top of the non-eliminated list, first row: ${sample.patient.id} ${sample.green}/${sample.total} favourable, ${sample.pair.unknownCount} unknown.`);
    lines.push("");
  }
  const byReason: Record<string, number> = {};
  for (const row of eliminated) byReason[row.spec.reason ?? "unspecified"] = (byReason[row.spec.reason ?? "unspecified"] ?? 0) + 1;
  lines.push("Elimination reasons as assigned when the chart was built (the engine is what marks the row eliminated):");
  lines.push("");
  for (const [reason, count] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${reason}: ${count}`);
  }
  lines.push("");

  const firstElim = patients.filter((p) => evaluate(p, first, AS_OF).eliminated).length;
  lines.push(`On NCT06281964 (PLB1004, first-line, prior EGFR TKI is an exclusion), ${firstElim} of ${n} are eliminated. That trial's two staging leaves demand different strings and the engine keeps one newest stage fact, so a recorded stage fails one of them. Patients with a stage on file are eliminated there even when the same chart is still open on NCT02496663.`);
  lines.push("");

  lines.push("## Completeness by site");
  lines.push("");
  lines.push("Academic charts were aimed at fewer gaps than community charts. Missing below means no fact with that analyte (EGFR: no EGFR result other than a resistance co-mutation).");
  lines.push("");
  lines.push("| Item | Academic missing | Community missing |");
  lines.push("|---|---:|---:|");
  const items: [string, (p: Patient) => boolean][] = [
    ["EGFR result", (p) => egfrOf(p) === "absent"],
    ["ECOG", (p) => !p.facts.some((f) => f.predicate === "performance_status")],
    ["histology", (p) => !p.facts.some((f) => f.predicate === "diagnosis")],
    ["stage", (p) => !p.facts.some((f) => f.predicate === "staging")],
    ["prior therapy", (p) => !p.facts.some((f) => f.predicate === "prior_therapy")],
    ["ANC", (p) => !hasAnalyte(p, "Absolute neutrophil count")],
    ["platelets", (p) => !hasAnalyte(p, "Platelets")],
    ["bilirubin", (p) => !hasAnalyte(p, "Total bilirubin")],
    ["creatinine", (p) => !hasAnalyte(p, "creatinine")],
    ["creatinine clearance", (p) => !hasAnalyte(p, "Creatinine clearance")],
    ["albumin", (p) => !hasAnalyte(p, "albumin")],
  ];
  for (const [label, missing] of items) {
    const a = academic.filter(missing).length;
    const c = community.filter(missing).length;
    lines.push(`| ${label} | ${a}/${academic.length} (${pct(a, academic.length)}) | ${c}/${community.length} (${pct(c, community.length)}) |`);
  }
  lines.push("");
  const egfrMiss = patients.filter((p) => egfrOf(p) === "absent").length;
  const labMiss = ["Absolute neutrophil count", "Platelets", "Total bilirubin", "creatinine", "albumin"].map((analyte) =>
    patients.filter((p) => !hasAnalyte(p, analyte)).length,
  );
  const worstLab = Math.max(...labMiss);
  lines.push(`EGFR is absent on ${egfrMiss}/${n} (${pct(egfrMiss, n)}). The most-missed lab among ANC, platelets, bilirubin, creatinine, and albumin is missing on ${worstLab}/${n} (${pct(worstLab, n)}).`);
  const inverted = items.filter(([, missing]) => {
    const aRate = academic.filter(missing).length / academic.length;
    const cRate = community.filter(missing).length / community.length;
    return cRate + 0.02 < aRate;
  });
  if (inverted.length) {
    lines.push("");
    lines.push(
      `Missingness was aimed higher at community sites. It came out the other way for: ${inverted.map(([label]) => label).join(", ")}.`,
    );
  }
  lines.push("");

  lines.push("## EGFR against the cited figures");
  lines.push("");
  lines.push(`Huang et al. report EGFR mutation in 1,322/9,450 NSCLC specimens (13.99%). This file is built for two EGFR trials, so it is enriched. Among charts with an EGFR result, ${positive.length}/${tested.length} (${pct(positive.length, tested.length)}) are positive and ${negative.length}/${tested.length} (${pct(negative.length, tested.length)}) are an explicit negative. ${absent.length}/${n} (${pct(absent.length, n)}) were never tested. The positive share is not 13.99%.`);
  lines.push("");
  lines.push("Subtype share among EGFR-positive charts, against Fois et al. ranges (share of EGFR mutations, not of all NSCLC):");
  lines.push("");
  lines.push("| Subtype | n | share of positives | cited |");
  lines.push("|---|---:|---:|---|");
  const cited: Record<string, string> = {
    "Exon 19 deletion": "45–60%",
    "Exon 21 L858R": "35–45%",
    "Exon 18 G719X": "not given; remainder after the two common subtypes",
    "Exon 21 L861Q": "not given; remainder after the two common subtypes",
    "EGFR Exon 20 insertion": "not given; remainder after the two common subtypes",
  };
  for (const [name] of EGFR_SUBTYPES) {
    const count = subtypeCounts[name] ?? 0;
    lines.push(`| ${name} | ${count} | ${pct(count, positive.length)} | ${cited[name]} |`);
  }
  const t790 = positive.filter((p) => p.facts.some((f) => f.analyte === "EGFR" && f.value === "T790M")).length;
  const tkiPos = positive.filter((p) => p.facts.some((f) => f.predicate === "prior_therapy" && f.drugClass === "anti-EGFR TKI" && f.value !== "osimertinib")).length;
  lines.push("");
  lines.push(`T790M was drawn at 50% after a first-generation EGFR TKI (Fois et al., about 50% of those progressions). Produced: ${t790} T790M facts on ${tkiPos} EGFR-positive charts that record erlotinib, gefitinib, or afatinib (${pct(t790, tkiPos)}).`);
  lines.push("");

  lines.push("## Other markers among charts that have a panel");
  lines.push("");
  lines.push("A panel fact exists only when EGFR was tested. The engine reads the newest biomarker fact, which is the EGFR result, so these rows are in the file for the prevalence check and do not change the EGFR leaves. Draws are independent. KRAS was drawn once per panel and split into G12C versus other KRAS mutations. That is not mutual exclusivity with EGFR, and the cohort is EGFR-enriched, so these rates are not Huang's all-NSCLC rates.");
  lines.push("");
  lines.push("| Marker | Produced | Cited |");
  lines.push("|---|---:|---:|");
  const markerRows: [string, (p: Patient) => boolean, number][] = [
    ["KRAS mutation, any", (p) => p.facts.some((f) => f.analyte === "KRAS" && f.value !== "negative"), 0.2887],
    ["KRAS G12C", (p) => p.facts.some((f) => f.analyte === "KRAS" && f.value === "G12C"), 0.1182],
    ["BRAF mutation", (p) => p.facts.some((f) => f.analyte === "BRAF" && f.value !== "negative"), 0.0423],
    ["ALK rearrangement", (p) => p.facts.some((f) => f.analyte === "ALK" && f.value !== "negative"), 0.0241],
    ["ROS1 rearrangement", (p) => p.facts.some((f) => f.analyte === "ROS1" && f.value !== "negative"), 0.0067],
    ["RET rearrangement", (p) => p.facts.some((f) => f.analyte === "RET" && f.value !== "negative"), 0.0067],
    ["NTRK fusion", (p) => p.facts.some((f) => f.analyte === "NTRK" && f.value !== "negative"), 0.0016],
    ["ERBB2 mutation", (p) => p.facts.some((f) => f.analyte === "ERBB2" && f.value !== "negative"), 0.0171],
    ["MET mutation", (p) => p.facts.some((f) => f.analyte === "MET" && f.value === "mutation"), 0.0238],
    ["MET amplification", (p) => p.facts.some((f) => f.analyte === "MET" && f.value === "amplification"), 0.0271],
    ["MET exon 14 skipping", (p) => p.facts.some((f) => f.analyte === "MET" && f.value === "exon 14 skipping"), 0.03],
    ["PD-L1 TPS ≥ 50%", (p) => p.facts.some((f) => f.analyte === "PD-L1" && typeof f.value === "number" && f.value >= 50), 0.3053],
    ["STK11 mutation", (p) => p.facts.some((f) => f.analyte === "STK11" && f.value !== "negative"), 0.1229],
    ["KEAP1 mutation", (p) => p.facts.some((f) => f.analyte === "KEAP1" && f.value !== "negative"), 0.0592],
    ["TMB ≥ 10 mutations/Mb", (p) => p.facts.some((f) => f.analyte === "TMB" && typeof f.value === "number" && f.value >= 10), 0.3665],
  ];
  const panelN = tested.length;
  for (const [label, pred, citedP] of markerRows) {
    const hits = tested.filter(pred).length;
    lines.push(`| ${label} | ${hits}/${panelN} (${pct(hits, panelN)}) | ${(citedP * 100).toFixed(2)}% |`);
  }
  lines.push("");
  lines.push("MET exon 14 skipping was drawn at 3%, inside the Fois et al. range of 1–10%. The other cited percentages are Huang et al. point estimates (n = 9,450).");
  const off = markerRows.filter(([, pred, citedP]) => {
    const hits = tested.filter(pred).length / panelN;
    return Math.abs(hits - citedP) >= 0.05;
  });
  if (off.length) {
    lines.push("");
    lines.push(
      `Off by 5 points or more on this draw: ${off.map(([label, pred, citedP]) => `${label} ${pct(tested.filter(pred).length, panelN)} vs ${(citedP * 100).toFixed(1)}%`).join("; ")}. ROS1 and NTRK can also land at zero in a panel of this size.`,
    );
  }
  lines.push("");

  lines.push("## Labs by site");
  lines.push("");
  lines.push("Values are the ones in the file, among patients who have that analyte. Community sites were given a lower centre for ANC, platelets, creatinine clearance, and albumin, and more of them are missing. Units are the ones the facts carry.");
  lines.push("");
  const labAnalytes: [string, string][] = [
    ["Absolute neutrophil count", "/mcL"],
    ["Platelets", "/mcL"],
    ["Total bilirubin", "× ULN"],
    ["creatinine", "mg/dL"],
    ["albumin", "g/dL"],
    ["Creatinine clearance", "mL/min"],
  ];
  for (const [analyte, unit] of labAnalytes) {
    lines.push(`**${analyte}** (${unit})`);
    lines.push("");
    lines.push(`- Academic: ${summarize(labValues(patients, analyte, "academic"))}`);
    lines.push(`- Community: ${summarize(labValues(patients, analyte, "community"))}`);
    lines.push("");
  }

  lines.push("## Demographics produced");
  lines.push("");
  const raceCounts: Record<string, number> = {};
  const sexCounts: Record<string, number> = {};
  for (const p of patients) {
    raceCounts[p.race] = (raceCounts[p.race] ?? 0) + 1;
    sexCounts[p.sex] = (sexCounts[p.sex] ?? 0) + 1;
  }
  lines.push(`Sex: ${Object.entries(sexCounts).map(([k, v]) => `${k} ${v}`).join(", ")}.`);
  lines.push(`Race: ${Object.entries(raceCounts).map(([k, v]) => `${k} ${v}`).join(", ")}.`);
  const ages = patients.map((p) => p.age).sort((a, b) => a - b);
  lines.push(`Age: median ${quantile(ages, 0.5).toFixed(0)}, IQR ${quantile(ages, 0.25).toFixed(0)}–${quantile(ages, 0.75).toFixed(0)}, min ${ages[0]}, max ${ages[ages.length - 1]}.`);
  lines.push("");
  lines.push("Race, sex, and age are not in `data/prevalence.json`. They are a seeded shape for an advanced NSCLC clinic, with more women among the EGFR-positive charts. Histology is the same: adenocarcinoma is heavier in the EGFR-positive charts. Neither is a cited row.");
  lines.push("");
  return lines.join("\n");
}

main();
