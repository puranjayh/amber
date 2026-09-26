/** Only "human" (and obvious aliases) may be shown as validated. Everything else is a draft. */
export function isHumanValidated(labelSource: string): boolean {
  const s = labelSource.toLowerCase();
  return s === "human" || s === "hand" || s.startsWith("human-");
}
