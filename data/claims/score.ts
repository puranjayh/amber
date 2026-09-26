/**
 * Score the claims panel with the engine. The page reads the JSON this writes.
 * Run: npx vite-node --config vitest.config.ts data/claims/score.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { orderFor } from "@/components/alert/alert";
import {
  PatientsFixture,
  TIER_LABEL,
  TrialsFixture,
  type PairResult,
  type Patient,
  type Trial,
} from "@/src/contracts";
import { evaluateWithNotes, indexLeaves, isEliminating } from "@/src/engine";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const panel = JSON.parse(readFileSync(ROOT + "data/claims/panel.json", "utf8")) as {
  source: { name: string; sample: string; url: string; note: string };
  doctor: { npi: string; serviceDate: string; pickedBecause: string };
  blast: { nctId: string; text: string };
  patients: Patient[];
  schedule: {
    patientId: string;
    time: string;
    timeNote: string;
    lungCancerClaim: boolean;
    claimLines: {
      kind: string;
      code: string;
      label: string;
      date: string;
      doc: string;
      lung: boolean;
      knownDrug?: string | null;
    }[];
  }[];
};

const patients = PatientsFixture.parse(panel.patients);
const trials = TrialsFixture.parse(
  JSON.parse(readFileSync(ROOT + "fixtures/trials.sample.json", "utf8")),
).filter((t) => !t.needsHumanReview);
const byId = new Map(patients.map((p) => [p.id, p]));
const asOf = panel.doctor.serviceDate;

type Step = {
  criterionId: string;
  title: string;
  detail: string;
  tierLabel: string;
  criterionCitation: string;
  claimCitation: string | null;
  reason: string;
};

type TrialFit = {
  nctId: string;
  title: string;
  phase: string;
  condition: string;
  status: "ready" | "needs_tests" | "ruled_out";
  eliminated: boolean;
  unknownCount: number;
  passCount: number;
  failCount: number;
  expectedValue: number;
  steps: Step[];
  ruledOutBy: { criterionCitation: string; claimCitation: string | null } | null;
};

function fit(patient: Patient, trial: Trial): TrialFit {
  const { result, provenanceNotes } = evaluateWithNotes(patient, trial, asOf);
  const leaves = indexLeaves(trial);
  const status = statusOf(result);
  const steps = result.cells
    .filter((cell) => cell.verdict === "UNKNOWN")
    .map((cell) => {
      const leaf = leaves.get(cell.criterionId);
      if (!leaf) return null;
      const order = orderFor(leaf, cell, patient);
      const note = provenanceNotes[cell.criterionId];
      return {
        criterionId: cell.criterionId,
        title: order.title,
        detail: note ? `${note.note} ${order.detail}` : order.detail,
        tierLabel: TIER_LABEL[cell.tier] ?? `tier ${cell.tier}`,
        criterionCitation: cell.criterionCitation,
        claimCitation: cell.chartCitation ?? null,
        reason: cell.reason,
      };
    })
    .filter((step): step is Step => step !== null);

  const ruling = result.cells.find((cell) => {
    const leaf = leaves.get(cell.criterionId);
    return leaf ? isEliminating(cell.verdict, leaf.type) : false;
  });

  return {
    nctId: trial.nctId,
    title: trial.title,
    phase: trial.phase,
    condition: trial.condition,
    status,
    eliminated: result.eliminated,
    unknownCount: result.unknownCount,
    passCount: result.passCount,
    failCount: result.failCount,
    expectedValue: result.expectedValue,
    steps,
    ruledOutBy: ruling
      ? { criterionCitation: ruling.criterionCitation, claimCitation: ruling.chartCitation ?? null }
      : null,
  };
}

function statusOf(result: PairResult): TrialFit["status"] {
  if (result.eliminated) return "ruled_out";
  if (result.unknownCount === 0) return "ready";
  return "needs_tests";
}

const rows = panel.schedule
  .map((slot) => {
    const patient = byId.get(slot.patientId);
    if (!patient) return null;
    const fits = trials.map((trial) => fit(patient, trial));
    return {
      patientId: patient.id,
      time: slot.time,
      timeNote: slot.timeNote,
      age: patient.age,
      sex: patient.sex,
      race: patient.race,
      lungCancerClaim: slot.lungCancerClaim,
      claimLines: slot.claimLines,
      fits,
    };
  })
  .filter((row): row is NonNullable<typeof row> => row !== null);

function rankFor(nctId: string): string[] {
  return rows
    .filter((row) => {
      const trial = row.fits.find((f) => f.nctId === nctId);
      return trial && trial.status !== "ruled_out";
    })
    .sort((a, b) => {
      const fa = a.fits.find((f) => f.nctId === nctId)!;
      const fb = b.fits.find((f) => f.nctId === nctId)!;
      const lung = Number(b.lungCancerClaim) - Number(a.lungCancerClaim);
      if (lung !== 0) return lung;
      return (
        fa.unknownCount - fb.unknownCount ||
        fb.expectedValue - fa.expectedValue ||
        a.patientId.localeCompare(b.patientId)
      );
    })
    .map((row) => row.patientId);
}

const focusId = panel.blast.nctId;
const ranked = rankFor(focusId);
const top = ranked.slice(0, 3);

const clinic = {
  asOf,
  source: panel.source,
  doctor: panel.doctor,
  blast: panel.blast,
  trials: trials.map((t) => ({ nctId: t.nctId, title: t.title, phase: t.phase, condition: t.condition })),
  top,
  ranked,
  rows,
};

const out = ROOT + "app/_data/clinic.json";
writeFileSync(out, JSON.stringify(clinic, null, 2) + "\n");

const focus = rows.map((row) => row.fits.find((f) => f.nctId === focusId)!);
const counts = {
  ready: focus.filter((f) => f.status === "ready").length,
  needs: focus.filter((f) => f.status === "needs_tests").length,
  out: focus.filter((f) => f.status === "ruled_out").length,
  lung: rows.filter((r) => r.lungCancerClaim).length,
};
console.log(
  `clinic: ${rows.length} patients, ready ${counts.ready}, needs tests ${counts.needs}, ruled out ${counts.out}, lung claims ${counts.lung}`,
);
console.log(`top ${top.join(", ")}`);
