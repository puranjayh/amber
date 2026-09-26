export const ANCHORS = [
  {
    nctId: "NCT02496663",
    line: "second-line",
    short: "Osimertinib and Necitumumab",
    note: "Requires prior EGFR TKI (erlotinib, gefitinib, or afatinib). ANC ≥ 1500/mcL is sweepable.",
  },
  {
    nctId: "NCT06281964",
    line: "first-line",
    short: "PLB1004",
    note: "Excludes prior anti-EGFR TKI. The opposite door from the other trial.",
  },
] as const;

export type AnchorId = (typeof ANCHORS)[number]["nctId"];

export function anchorById(nctId: string | undefined) {
  return ANCHORS.find((trial) => trial.nctId === nctId) ?? ANCHORS[0];
}

export function isAnchor(nctId: string | undefined): nctId is AnchorId {
  return ANCHORS.some((trial) => trial.nctId === nctId);
}
