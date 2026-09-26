/** Synthea writes `white`; fixtures write `White`. One label for the panel. */
export function raceLabel(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (s.startsWith("black") || s.includes("african")) return "Black";
  if (s.startsWith("white")) return "White";
  if (s.startsWith("asian")) return "Asian";
  if (s.includes("native") || s.includes("indian")) return "Native";
  return raw.trim() || "Unknown";
}

export function shares(labels: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const label of labels) counts[label] = (counts[label] ?? 0) + 1;
  const n = labels.length || 1;
  return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / n]));
}

export function pct(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/** Largest panel-minus-admitted gap — the sentence on the HCP panel. */
export function compositionHeadline(
  panel: Record<string, number>,
  admitted: Record<string, number>,
): { group: string; panelShare: number; admittedShare: number; text: string } {
  const groups = [...new Set([...Object.keys(panel), ...Object.keys(admitted)])];
  const ranked = groups
    .map((group) => ({
      group,
      panelShare: panel[group] ?? 0,
      admittedShare: admitted[group] ?? 0,
      gap: (panel[group] ?? 0) - (admitted[group] ?? 0),
    }))
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap) || a.group.localeCompare(b.group));
  const top = ranked[0] ?? { group: "Unknown", panelShare: 0, admittedShare: 0, gap: 0 };
  return {
    group: top.group,
    panelShare: top.panelShare,
    admittedShare: top.admittedShare,
    text: `Your panel is ${pct(top.panelShare)} ${top.group}; the patients these criteria admit are ${pct(top.admittedShare)}.`,
  };
}
