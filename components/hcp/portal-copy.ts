import type { Trial } from "@/src/contracts";
import { doctorFor } from "./roster";

export type PortalCatalog = {
  patientId: string;
  talk: string;
  physicianName: string;
  trials: {
    nctId: string;
    title: string;
    phase: string;
    travelMinutes: number | null;
    blocking?: string;
  }[];
};

/** Shown when the doctor suggests a trial. No study name — that is a clinic conversation. */
export function discussionCopy(doctorTalk: string): string {
  return `${doctorTalk} wants to discuss a clinical trial with you. Book a follow-up and you can go through it together.`;
}

export function suggestionCopy(
  catalog: PortalCatalog,
  nctId: string | null,
): { title: string; body: string; talk: string; cta: string } | undefined {
  const trial = catalog.trials.find((t) => t.nctId === nctId) ?? catalog.trials[0];
  if (!trial) return undefined;
  const travel =
    trial.travelMinutes !== null
      ? `The site is about ${trial.travelMinutes} minutes from you.`
      : "Travel time is still being confirmed.";
  const open = trial.blocking
    ? `One question on the chart is still open: ${trial.blocking}`
    : "Your doctor still has a chart question to close before anyone can enrol.";
  return {
    title: trial.title,
    talk: catalog.talk,
    body: `${trial.phase ? `${trial.phase} study. ` : ""}${travel} ${open} This page does not sign you up and does not enrol you.`,
    cta: `Talk to ${catalog.talk} about this.`,
  };
}

export function catalogFor(
  patientId: string,
  trials: readonly { nctId: string; title: string; phase: string; travelMinutes: number | null; blocking?: string }[],
): PortalCatalog {
  const doctor = doctorFor(patientId);
  return {
    patientId,
    talk: doctor.talk,
    physicianName: doctor.name,
    trials: [...trials],
  };
}

export function trialPhaseLabel(trial: Trial): string {
  return trial.phase && trial.phase !== "NA" ? trial.phase.replace(/_/g, " ") : "A clinical study";
}
