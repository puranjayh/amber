export const READY = ["eligible", "one", "several", "eliminated"] as const;
export type Ready = (typeof READY)[number];

export const READY_LABEL: Record<Ready, string> = {
  eligible: "eligible now",
  one: "one unknown away",
  several: "several unknowns",
  eliminated: "eliminated",
};

export function readiness(row: { eliminated: boolean; unknownCount: number }): Ready {
  if (row.eliminated) return "eliminated";
  if (row.unknownCount === 0) return "eligible";
  if (row.unknownCount === 1) return "one";
  return "several";
}

export function trialReady(row: { eliminated: boolean; unknownCount: number }): boolean {
  return readiness(row) === "eligible";
}

export function spread(rows: readonly { eliminated: boolean; unknownCount: number }[]): Record<Ready, number> {
  const out: Record<Ready, number> = { eligible: 0, one: 0, several: 0, eliminated: 0 };
  for (const row of rows) out[readiness(row)] += 1;
  return out;
}
