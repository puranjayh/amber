export const BEATS = ["worklist", "hcp", "elasticity", "payer"] as const;
export type Beat = (typeof BEATS)[number];

export function advance(beat: number): number {
  return Math.min(beat + 1, BEATS.length - 1);
}

export function retreat(beat: number): number {
  return Math.max(beat - 1, 0);
}

/** When presenter mode is off the whole story is visible. */
export function revealedThrough(beat: number, presenting: boolean): number {
  return presenting ? beat : BEATS.length - 1;
}

export function isAdvanceKey(key: string): boolean {
  return key === " " || key === "Spacebar" || key === "ArrowRight" || key === "ArrowDown" || key === "PageDown";
}

export function isRetreatKey(key: string): boolean {
  return key === "ArrowLeft" || key === "ArrowUp" || key === "PageUp" || key === "Backspace";
}
