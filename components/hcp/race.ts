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

/**
 * The group these criteria leave out. A larger gap in the other direction —
 * a group over-represented among those admitted — is not the finding.
 * A group admitted at 0% leads, even when another group lost more share but still gets in.
 */
export function compositionHeadline(
  panel: Record<string, number>,
  admitted: Record<string, number>,
): { group: string; panelShare: number; admittedShare: number; text: string } {
  const groups = [...new Set([...Object.keys(panel), ...Object.keys(admitted)])];
  const rows = groups.map((group) => ({
    group,
    panelShare: panel[group] ?? 0,
    admittedShare: admitted[group] ?? 0,
  }));
  const under = rows.filter((row) => row.panelShare > 0 && row.admittedShare < row.panelShare - 1e-12);
  const shutOut = under.filter((row) => row.admittedShare === 0);
  const pool = shutOut.length ? shutOut : under;
  const top = [...pool].sort((a, b) => {
    if (shutOut.length) return b.panelShare - a.panelShare || a.group.localeCompare(b.group);
    const gap = b.panelShare - b.admittedShare - (a.panelShare - a.admittedShare);
    return gap || a.group.localeCompare(b.group);
  })[0];
  if (!top) {
    return {
      group: "",
      panelShare: 0,
      admittedShare: 0,
      text: "No group on your panel is under-admitted by these criteria.",
    };
  }
  return {
    group: top.group,
    panelShare: top.panelShare,
    admittedShare: top.admittedShare,
    text: `${top.group} patients are ${pct(top.panelShare)} of your panel and ${pct(top.admittedShare)} of the patients these criteria admit.`,
  };
}
