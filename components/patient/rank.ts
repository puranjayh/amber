export const TRIAL_RANK_RULE =
  "Ranked by how close this patient is to enrolling, then by what the trial is worth to them.";

type RankedTrial = {
  nctId: string;
  eliminated: boolean;
  unknownCount: number;
  expectedValue: number;
  resolutionCost: number;
};

function worth(row: RankedTrial): number {
  return row.expectedValue / (1 + Math.max(0, row.resolutionCost));
}

/** Open trials first. A gap of more than one unknown is not close, so eligibility wins. */
export function rankPatientTrials<T extends RankedTrial>(pairs: readonly T[]): T[] {
  return [...pairs].sort((a, b) => {
    if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
    const gap = a.unknownCount - b.unknownCount;
    if (Math.abs(gap) > 1) return gap;
    const byWorth = worth(b) - worth(a);
    if (Math.abs(byWorth) > 1e-9) return byWorth;
    if (gap !== 0) return gap;
    return a.nctId.localeCompare(b.nctId);
  });
}

export type Peer = {
  patientId: string;
  name: string;
  nctId: string;
  blockingId?: string;
  diagnosis?: string;
  /** True when this person is blocked on the same criterion as the patient on screen. */
  sameBlocker?: boolean;
};

/** Same blocking criterion first, then the same diagnosis. The patient themselves is left out. */
export function suggestPeers(self: Peer, peers: readonly Peer[], limit = 6): Peer[] {
  const rest = peers.filter((row) => row.patientId !== self.patientId);
  const blocked = self.blockingId ? rest.filter((row) => row.blockingId === self.blockingId) : [];
  const taken = new Set(blocked.map((row) => row.patientId));
  const similar = self.diagnosis
    ? rest.filter((row) => !taken.has(row.patientId) && row.diagnosis === self.diagnosis)
    : [];
  return [
    ...blocked.map((row) => ({ ...row, sameBlocker: true })),
    ...similar.map((row) => ({ ...row, sameBlocker: false })),
  ].slice(0, limit);
}
