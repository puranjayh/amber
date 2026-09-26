import type { CriterionLeaf, CubeCell, Trial } from "@/src/contracts";
import type { Order } from "@/components/alert/alert";

export type OutreachDraft = {
  patientId: string;
  nctId: string;
  subject: string;
  body: string;
};

export function draftOutreach(args: {
  patientId: string;
  trial: Trial;
  cell: CubeCell;
  leaf: CriterionLeaf;
  order: Order;
}): OutreachDraft {
  const { patientId, trial, cell, leaf, order } = args;
  return {
    patientId,
    nctId: trial.nctId,
    subject: `${patientId} × ${trial.nctId} — one test`,
    body: [
      `${patientId} could qualify for ${trial.title} (${trial.nctId}).`,
      "",
      `The record does not answer ${leaf.id} (${cell.reason}):`,
      `"${cell.criterionCitation}"`,
      cell.chartCitation ? `Record: "${cell.chartCitation}"` : "No sentence in the record addresses this.",
      "",
      `Order: ${order.title}`,
      order.detail,
      "",
      "Draft only — not sent.",
    ].join("\n"),
  };
}
